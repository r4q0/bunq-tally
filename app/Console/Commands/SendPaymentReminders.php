<?php

namespace App\Console\Commands;

use App\Models\PaymentRequest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendPaymentReminders extends Command
{
    protected $signature = 'reminders:send';
    protected $description = 'Send WhatsApp reminders for unpaid payment requests';

    public function handle(): int
    {
        $base = rtrim((string) config('services.openwa.url'), '/');
        $apiKey = config('services.openwa.api_key');
        $sessionId = config('services.openwa.session_id');

        if (! $base || ! $apiKey || ! $sessionId) {
            $this->warn('OpenWA not configured — skipping reminders.');
            return self::SUCCESS;
        }

        $headers = ['X-API-Key' => $apiKey, 'Accept' => 'application/json'];

        $sessionCheck = Http::withHeaders($headers)->get("{$base}/api/sessions/{$sessionId}");
        if (! $sessionCheck->successful() || $sessionCheck->json('status') !== 'ready') {
            $this->warn('OpenWA session not ready — skipping reminders.');
            return self::SUCCESS;
        }

        $due = PaymentRequest::query()
            ->where('paid', false)
            ->whereNotNull('contact_id')
            ->where('created_at', '<', now()->subHour())
            ->where(function ($q) {
                $q->whereNull('reminder_sent_at')
                  ->orWhere('reminder_sent_at', '<', now()->subHours(24));
            })
            ->with('contact', 'receipt')
            ->get();

        $sent = 0;
        foreach ($due as $pr) {
            $contact = $pr->contact;
            if (! $contact || ! $contact->phone_number || str_starts_with($contact->phone_number, 'tmp-')) {
                continue;
            }

            $merchant = $pr->receipt?->store ?? 'Tally';
            $amount = number_format((float) $pr->amount, 2);
            $message = "Hi {$contact->name}! Just a reminder: your share for {$merchant} is €{$amount} and is still unpaid.";
            if ($pr->payment_url) {
                $message .= "\nPay securely with bunq.me: {$pr->payment_url}";
            }

            $chatId = preg_replace('/\D/', '', $contact->phone_number).'@c.us';

            $response = Http::withHeaders($headers)
                ->post("{$base}/api/sessions/{$sessionId}/messages/send-text", [
                    'chatId' => $chatId,
                    'text'   => $message,
                ]);

            if ($response->successful()) {
                $pr->update(['reminder_sent_at' => now()]);
                $sent++;
                $this->line("Reminded {$contact->name} ({$chatId})");
            } else {
                Log::warning('Reminder send failed', [
                    'contact_id' => $contact->id,
                    'status'     => $response->status(),
                    'body'       => $response->body(),
                ]);
            }
        }

        $this->info("Sent {$sent} reminder(s).");
        return self::SUCCESS;
    }
}
