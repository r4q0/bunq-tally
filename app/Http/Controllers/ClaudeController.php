<?php

namespace App\Http\Controllers;

use App\Models\Receipt;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ClaudeController extends Controller
{
    public function scan(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|file|mimes:jpeg,jpg,png,webp|max:10240',
        ]);

        $apiKey = config('services.anthropic.key');
        if (! $apiKey) {
            return response()->json([
                'error' => 'Anthropic is not configured. Set ANTHROPIC_API_KEY in .env.',
            ], 503);
        }

        $user = User::query()->first();
        if (! $user) {
            return response()->json([
                'error' => 'No user found. Run "php artisan migrate --seed" to create a default user.',
            ], 503);
        }

        $file = $request->file('image');
        $prepared = $this->prepareReceiptImageForScan($file);
        $path = $prepared['path'];
        $mediaType = $prepared['media_type'];
        $base64 = $prepared['base64'];

        $prompt = <<<'PROMPT'
You are a receipt parser. Read the receipt image and reply with ONLY a JSON object,
no prose, no markdown fences. Use this exact schema:
{
  "merchant": string,
  "date": "YYYY-MM-DD" or null,
  "currency": ISO 4217 code or symbol if unknown,
  "items": [{ "name": string, "price": number }],
  "total": number
}
Numbers must be plain decimals (e.g. 12.50). Omit currency symbols inside numbers.
PROMPT;

        $response = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => config('services.anthropic.version'),
            'content-type' => 'application/json',
        ])->timeout(120)->post(config('services.anthropic.url'), [
            'model' => config('services.anthropic.model'),
            'max_tokens' => 1024,
            'messages' => [[
                'role' => 'user',
                'content' => [
                    [
                        'type' => 'image',
                        'source' => [
                            'type' => 'base64',
                            'media_type' => $mediaType,
                            'data' => $base64,
                        ],
                    ],
                    [
                        'type' => 'text',
                        'text' => $prompt,
                    ],
                ],
            ]],
        ]);

        if ($response->failed()) {
            Storage::disk('public')->delete($path);
            Log::warning('Anthropic request failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return response()->json([
                'error' => 'Claude request failed',
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ], 502);
        }

        $text = collect($response->json('content', []))
            ->firstWhere('type', 'text')['text'] ?? null;

        $parsed = $this->extractJson($text);

        if (! is_array($parsed) || ! isset($parsed['merchant'], $parsed['items'], $parsed['total'])) {
            Storage::disk('public')->delete($path);

            return response()->json([
                'error' => 'Could not parse Claude response as JSON',
                'raw' => $text,
            ], 422);
        }

        $receipt = DB::transaction(function () use ($parsed, $path, $user) {
            $receipt = Receipt::create([
                'user_id' => $user->id,
                'store' => $parsed['merchant'],
                'receipt_image_path' => $path,
                'total_price' => $parsed['total'],
                'currency' => $parsed['currency'] ?? null,
                'purchased_at' => $parsed['date'] ?? null,
            ]);

            foreach ($parsed['items'] as $item) {
                if (! isset($item['name'], $item['price'])) {
                    continue;
                }

                $receipt->items()->create([
                    'item_name' => $item['name'],
                    'price' => $item['price'],
                    'quantity' => 1,
                ]);
            }

            return $receipt->load('items');
        });

        return response()->json([
            'ok' => true,
            'receipt' => $receipt,
            'image_url' => Storage::disk('public')->url($path),
            'parsed' => $parsed,
        ]);
    }

    /**
     * Store receipt image on the public disk and return base64 + mime for Anthropic.
     * Downscales if any edge exceeds Anthropic's limit (8000px); uses 7680px max edge.
     *
     * @return array{path: string, media_type: string, base64: string}
     */
    private function prepareReceiptImageForScan(UploadedFile $file): array
    {
        $maxEdge = 7680;
        $bytes = (string) file_get_contents($file->getRealPath());
        $mimeType = (string) $file->getMimeType();

        $storeOriginal = function () use ($file, $bytes, $mimeType): array {
            $path = $file->store('receipts', 'public');

            return [
                'path' => $path,
                'media_type' => $mimeType,
                'base64' => base64_encode($bytes),
            ];
        };

        if (! \extension_loaded('gd')) {
            return $storeOriginal();
        }

        $info = @\getimagesizefromstring($bytes);
        if (! is_array($info) || ! isset($info[0], $info[1])) {
            return $storeOriginal();
        }

        $width = (int) $info[0];
        $height = (int) $info[1];

        if ($width <= $maxEdge && $height <= $maxEdge) {
            return $storeOriginal();
        }

        $scale = min($maxEdge / $width, $maxEdge / $height);
        $newWidth = (int) max(1, round($width * $scale));
        $newHeight = (int) max(1, round($height * $scale));

        $estimatedDecodeBytes = $width * $height * 4;
        $estimatedScaledBytes = $newWidth * $newHeight * 4;
        $requiredBytes = (int) (($estimatedDecodeBytes + $estimatedScaledBytes) * 1.5) + 64 * 1024 * 1024;
        $previousMemoryLimit = (string) ini_get('memory_limit');
        $bumpedMemory = false;
        if ($this->memoryLimitInBytes($previousMemoryLimit) < $requiredBytes) {
            @ini_set('memory_limit', max($requiredBytes, 512 * 1024 * 1024).'');
            $bumpedMemory = true;
        }

        try {
            $image = @\imagecreatefromstring($bytes);
            if ($image === false) {
                return $storeOriginal();
            }

            $scaled = \imagescale($image, $newWidth, $newHeight);
            \imagedestroy($image);

            if ($scaled === false) {
                return $storeOriginal();
            }

            if (\function_exists('imagepalettetotruecolor') && ! \imageistruecolor($scaled)) {
                \imagepalettetotruecolor($scaled);
            }

            \ob_start();
            \imagejpeg($scaled, null, 88);
            $jpegBytes = (string) \ob_get_clean();
            \imagedestroy($scaled);
        } finally {
            if ($bumpedMemory) {
                @ini_set('memory_limit', $previousMemoryLimit);
            }
        }

        $path = 'receipts/'.Str::uuid()->toString().'.jpg';
        Storage::disk('public')->put($path, $jpegBytes);

        Log::info('Receipt image resized for Anthropic scan', [
            'original' => ['width' => $width, 'height' => $height],
            'resized' => ['width' => $newWidth, 'height' => $newHeight],
            'path' => $path,
        ]);

        return [
            'path' => $path,
            'media_type' => 'image/jpeg',
            'base64' => base64_encode($jpegBytes),
        ];
    }

    private function memoryLimitInBytes(string $limit): int
    {
        $limit = trim($limit);
        if ($limit === '' || $limit === '-1') {
            return PHP_INT_MAX;
        }

        $unit = strtolower(substr($limit, -1));
        $value = (int) $limit;

        return match ($unit) {
            'g' => $value * 1024 * 1024 * 1024,
            'm' => $value * 1024 * 1024,
            'k' => $value * 1024,
            default => (int) $limit,
        };
    }

    private function extractJson(?string $text): ?array
    {
        if (! $text) {
            return null;
        }

        $trimmed = trim($text);

        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $trimmed, $m)) {
            $trimmed = $m[1];
        } elseif (preg_match('/\{.*\}/s', $trimmed, $m)) {
            $trimmed = $m[0];
        }

        $decoded = json_decode($trimmed, true);

        return is_array($decoded) ? $decoded : null;
    }
}
