<?php

namespace App\Http\Controllers;

use App\Models\PaymentRequest;
use App\Services\BunqService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class BunqController extends Controller
{
    public function __construct(private BunqService $bunq) {}

    /**
     * POST /api/payment-requests
     *
     * Body: { contact_id, amount, description? }
     */
    public function createPaymentRequest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount'      => ['required', 'numeric', 'min:0.01'],
            'description' => ['sometimes', 'string', 'max:140'],
            'contact_id'  => ['sometimes', 'integer', 'exists:contacts,id'],
            'receipt_id'  => ['sometimes', 'integer', 'exists:receipts,id'],
        ]);

        $description = $data['description'] ?? 'Payment request';

        $link = $this->bunq->createPaymentLink((float) $data['amount'], $description);

        $paymentRequest = PaymentRequest::create([
            'receipt_id'  => $data['receipt_id'] ?? null,
            'contact_id'  => $data['contact_id'] ?? null,
            'amount'      => $data['amount'],
            'paid'        => false,
            'status'      => 'pending',
            'bunq_tab_id' => $link['tab_id'],
            'payment_url' => $link['url'],
        ]);

        return response()->json([
            'payment_request' => $paymentRequest,
            'payment_url'     => $link['url'],
        ], 201);
    }

    /**
     * POST /api/bunq/webhook
     *
     * bunq calls this URL when a mutation happens on the account.
     * We check all pending payment requests and mark paid ones.
     */
    public function webhook(Request $request): Response
    {
        $payload = $request->all();
        Log::channel('stack')->info('bunq webhook received', $payload);

        $this->syncPendingRequests();

        return response('OK', 200);
    }

    /**
     * POST /api/payment-requests/{paymentRequest}/sync
     *
     * Manually check and update the payment status for one request.
     */
    public function syncPaymentStatus(PaymentRequest $paymentRequest): JsonResponse
    {
        if ($paymentRequest->paid) {
            return response()->json(['paid' => true, 'paid_at' => $paymentRequest->paid_at]);
        }

        if ($paymentRequest->bunq_tab_id && $this->bunq->isTabPaid($paymentRequest->bunq_tab_id)) {
            $paymentRequest->update([
                'paid'    => true,
                'paid_at' => now(),
            ]);
        }

        return response()->json([
            'paid'    => $paymentRequest->paid,
            'paid_at' => $paymentRequest->paid_at,
        ]);
    }

    private function syncPendingRequests(): void
    {
        PaymentRequest::where('paid', false)
            ->whereNotNull('bunq_tab_id')
            ->each(function (PaymentRequest $pr) {
                if ($this->bunq->isTabPaid($pr->bunq_tab_id)) {
                    $pr->update(['paid' => true, 'paid_at' => now()]);
                }
            });
    }
}
