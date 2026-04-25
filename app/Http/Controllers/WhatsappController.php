<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsappController extends Controller
{
    public function sendText(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => 'required|string',
            'text' => 'required|string',
        ]);

        $base = rtrim((string) config('services.openwa.url'), '/');
        $apiKey = config('services.openwa.api_key');
        $sessionId = config('services.openwa.session_id');

        if (! $base || ! $apiKey || ! $sessionId) {
            return response()->json([
                'error' => 'OpenWA is not configured. Set OPENWA_URL, OPENWA_API_KEY and OPENWA_SESSION_ID in .env.',
            ], 503);
        }

        $openwaHeaders = [
            'X-API-Key' => $apiKey,
            'Accept' => 'application/json',
        ];

        $sessionCheck = Http::withHeaders($openwaHeaders)
            ->get("{$base}/api/sessions/{$sessionId}");

        if (! $sessionCheck->successful()) {
            return response()->json([
                'error' => 'OpenWA session lookup failed',
                'status' => $sessionCheck->status(),
                'body' => $sessionCheck->json() ?? $sessionCheck->body(),
            ], 502);
        }

        $sessionState = $sessionCheck->json('status');
        if ($sessionState !== 'ready') {
            return response()->json([
                'error' => 'OpenWA session is not connected; cannot send yet.',
                'session_status' => $sessionState,
                'fix' => 'In OpenWA: open GET /api/sessions/{id}/qr (or the dashboard at port 2886), scan the QR with WhatsApp, then retry when session status is "ready".',
            ], 503);
        }

        $chatId = preg_replace('/\D/', '', $data['phone']).'@c.us';
        $url = "{$base}/api/sessions/{$sessionId}/messages/send-text";

        $response = Http::withHeaders($openwaHeaders)->post($url, [
            'chatId' => $chatId,
            'text' => $data['text'],
        ]);

        if ($response->failed()) {
            Log::warning('OpenWA send-text failed', [
                'status' => $response->status(),
                'body' => $response->body(),
                'chatId' => $chatId,
            ]);

            return response()->json([
                'error' => 'OpenWA request failed',
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ], 502);
        }

        return response()->json([
            'ok' => true,
            'chatId' => $chatId,
            'data' => $response->json(),
        ]);
    }
}
