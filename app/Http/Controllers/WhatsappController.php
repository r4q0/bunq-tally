<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsappController extends Controller
{
    public function getProfilePic(Request $request): JsonResponse
    {
        $data = $request->validate(['phone_number' => 'required|string']);

        $base = rtrim((string) config('services.openwa.url'), '/');
        $apiKey = config('services.openwa.api_key');
        $sessionId = config('services.openwa.session_id');

        if (! $base || ! $apiKey || ! $sessionId) {
            return response()->json(['url' => null], 200);
        }

        $chatId = preg_replace('/\D/', '', $data['phone_number']).'@c.us';
        $headers = ['X-API-Key' => $apiKey, 'Accept' => 'application/json'];

        $response = Http::withHeaders($headers)
            ->get("{$base}/api/sessions/{$sessionId}/contacts/{$chatId}/profile-picture");

        if ($response->failed()) {
            return response()->json(['url' => null], 200);
        }

        $body = $response->json();
        $url = $body['profilePictureURL'] ?? $body['url'] ?? $body['profilePicUrl'] ?? null;

        return response()->json(['url' => $url]);
    }

    public function sendText(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_number' => 'required|string',
            'message'      => 'required|string',
        ]);

        $base = rtrim((string) config('services.openwa.url'), '/');
        $apiKey = config('services.openwa.api_key');
        $sessionId = config('services.openwa.session_id');

        if (! $base || ! $apiKey || ! $sessionId) {
            return response()->json([
                'message' => 'WhatsApp is not configured on this server.',
                'code'    => 'not_configured',
            ], 503);
        }

        $openwaHeaders = [
            'X-API-Key' => $apiKey,
            'Accept'    => 'application/json',
        ];

        $sessionCheck = Http::withHeaders($openwaHeaders)
            ->get("{$base}/api/sessions/{$sessionId}");

        if (! $sessionCheck->successful()) {
            return response()->json([
                'message' => 'WhatsApp session check failed.',
                'code'    => 'session_lookup_failed',
            ], 502);
        }

        $sessionState = $sessionCheck->json('status');
        if ($sessionState !== 'ready') {
            return response()->json([
                'message'        => 'WhatsApp is not connected. Scan the QR code in the OpenWA dashboard and retry.',
                'code'           => 'session_not_ready',
                'session_status' => $sessionState,
            ], 503);
        }

        $chatId = preg_replace('/\D/', '', $data['phone_number']).'@c.us';
        $url = "{$base}/api/sessions/{$sessionId}/messages/send-text";

        $response = Http::withHeaders($openwaHeaders)->post($url, [
            'chatId' => $chatId,
            'text'   => $data['message'],
        ]);

        if ($response->failed()) {
            Log::warning('OpenWA send-text failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
                'chatId' => $chatId,
            ]);

            return response()->json([
                'message'         => 'WhatsApp delivery failed.',
                'code'            => 'upstream_error',
                'upstream_status' => $response->status(),
            ], 502);
        }

        return response()->json([
            'ok'     => true,
            'chatId' => $chatId,
            'data'   => $response->json(),
        ]);
    }
}
