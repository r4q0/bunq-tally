<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use App\Models\PaymentRequest;
use App\Models\Receipt;
use App\Models\ReceiptItemAllocation;
use App\Services\BunqService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

class ReceiptController extends Controller
{
    public function index(): JsonResponse
    {
        $receipts = Receipt::query()
            ->with('items.allocations')
            ->latest()
            ->get()
            ->map(fn (Receipt $r) => $this->transform($r));

        return response()->json(['data' => $receipts]);
    }

    public function show(Receipt $receipt): JsonResponse
    {
        $receipt->load(['items.allocations', 'paymentRequests.contact']);

        return response()->json(['data' => $this->transform($receipt, includeSplits: true)]);
    }

    /**
     * Replace allocations for all items of a receipt.
     * Body: { allocations: [ { receipt_item_id, contact_ids: int[] } ] }
     */
    public function saveAllocations(Request $request, Receipt $receipt): JsonResponse
    {
        $data = $request->validate([
            'allocations' => 'required|array',
            'allocations.*.receipt_item_id' => 'required|integer',
            'allocations.*.contact_ids' => 'array',
            'allocations.*.contact_ids.*' => 'integer|exists:contacts,id',
        ]);

        $itemIds = $receipt->items()->pluck('id')->all();
        $invalidItemIds = collect($data['allocations'])
            ->pluck('receipt_item_id')
            ->filter(fn ($id) => ! in_array((int) $id, $itemIds, true))
            ->unique()
            ->values()
            ->all();

        if (! empty($invalidItemIds)) {
            return response()->json([
                'message' => 'Some allocation items do not belong to this receipt.',
                'invalid_receipt_item_ids' => $invalidItemIds,
            ], 422);
        }

        DB::transaction(function () use ($data, $itemIds) {
            foreach ($data['allocations'] as $row) {
                ReceiptItemAllocation::where('receipt_item_id', $row['receipt_item_id'])->delete();

                foreach (array_unique($row['contact_ids'] ?? []) as $contactId) {
                    ReceiptItemAllocation::create([
                        'receipt_item_id' => $row['receipt_item_id'],
                        'contact_id' => $contactId,
                        'weight' => 1,
                    ]);
                }
            }
        });

        return $this->show($receipt->fresh());
    }

    /**
     * Compute per-contact totals from current allocations, create payment_requests
     * and (best-effort) generate a bunq.me payment link per contact.
     */
    public function split(Receipt $receipt): JsonResponse
    {
        $receipt->load(['items.allocations', 'paymentRequests']);
        $totals = $this->computePerContactTotals($receipt);

        $bunq = $this->resolveBunqService();
        $merchant = $receipt->store ?: 'Tally receipt';

        $createdIds = DB::transaction(function () use ($receipt, $totals, $bunq, $merchant) {
            PaymentRequest::where('receipt_id', $receipt->id)->delete();

            $ids = [];
            foreach ($totals as $contactId => $amount) {
                if ($amount <= 0) {
                    continue;
                }

                $rounded = round($amount, 2);
                $contact = Contact::find($contactId);
                $description = $this->buildBunqDescription($merchant, $contact, $rounded);

                $bunqTabId = null;
                $paymentUrl = null;

                if ($bunq) {
                    try {
                        $link = $bunq->createPaymentLink((float) $rounded, $description);
                        $bunqTabId = $link['tab_id'] ?? null;
                        $paymentUrl = $link['url'] ?? null;
                    } catch (Throwable $e) {
                        Log::warning('bunq payment link creation failed for contact '.$contactId.': '.$e->getMessage());
                    }
                }

                $pr = PaymentRequest::create([
                    'receipt_id' => $receipt->id,
                    'contact_id' => $contactId,
                    'amount' => $rounded,
                    'status' => 'pending',
                    'bunq_tab_id' => $bunqTabId,
                    'payment_url' => $paymentUrl,
                ]);
                $ids[] = $pr->id;
            }

            return $ids;
        });

        $receipt->load('paymentRequests.contact');

        return response()->json([
            'ok' => true,
            'receipt_id' => $receipt->id,
            'bunq_available' => $bunq !== null,
            'splits' => $receipt->paymentRequests->map(fn (PaymentRequest $pr) => [
                'id' => $pr->id,
                'contact_id' => $pr->contact_id,
                'contact' => $pr->contact ? [
                    'id' => $pr->contact->id,
                    'name' => $pr->contact->name,
                    'color' => $pr->contact->color,
                    'phone_number' => $pr->contact->phone_number,
                ] : null,
                'amount' => (float) $pr->amount,
                'status' => $pr->status,
                'paid' => $pr->paid,
                'bunq_tab_id' => $pr->bunq_tab_id,
                'payment_url' => $pr->payment_url,
            ]),
        ]);
    }

    /**
     * Resolve the BunqService if its context is initialised, otherwise null.
     * Keeps the split flow working even when bunq:setup has not been run yet.
     */
    private function resolveBunqService(): ?BunqService
    {
        try {
            return app(BunqService::class);
        } catch (Throwable $e) {
            Log::info('BunqService unavailable: '.$e->getMessage());
            return null;
        }
    }

    private function buildBunqDescription(string $merchant, ?Contact $contact, float $amount): string
    {
        $name = $contact?->name ?: 'friend';
        $description = "Tally split - {$merchant} - {$name}";
        if (mb_strlen($description) > 140) {
            $description = mb_substr($description, 0, 140);
        }
        return $description;
    }

    public function status(Receipt $receipt): JsonResponse
    {
        $receipt->load('paymentRequests.contact');

        return response()->json([
            'receipt_id' => $receipt->id,
            'splits' => $receipt->paymentRequests->map(fn (PaymentRequest $pr) => [
                'id' => $pr->id,
                'contact_id' => $pr->contact_id,
                'amount' => $pr->amount,
                'status' => $pr->status,
                'paid' => $pr->paid,
                'paid_at' => $pr->paid_at,
            ]),
        ]);
    }

    /**
     * @return array<int, float> contact_id => amount
     */
    private function computePerContactTotals(Receipt $receipt): array
    {
        $totals = [];

        foreach ($receipt->items as $item) {
            $allocations = $item->allocations;
            $weightSum = (int) $allocations->sum('weight');
            if ($weightSum <= 0) {
                continue;
            }

            $lineTotal = (float) $item->price * (int) $item->quantity;

            foreach ($allocations as $alloc) {
                $share = ((int) $alloc->weight) / $weightSum;
                $totals[$alloc->contact_id] = ($totals[$alloc->contact_id] ?? 0.0) + $share * $lineTotal;
            }
        }

        return $totals;
    }

    private function transform(Receipt $r, bool $includeSplits = false): array
    {
        $items = $r->items->map(function ($item) {
            return [
                'id' => $item->id,
                'name' => $item->item_name,
                'price' => (float) $item->price,
                'quantity' => (int) $item->quantity,
                'assigned_contact_ids' => $item->allocations->pluck('contact_id')->all(),
            ];
        });

        $payload = [
            'id' => $r->id,
            'merchant' => $r->store,
            'currency' => $r->currency,
            'date' => optional($r->purchased_at)->toDateString() ?? optional($r->created_at)->toDateString(),
            'total' => (float) $r->total_price,
            'image_url' => $r->receipt_image_path
                ? Storage::disk('public')->url($r->receipt_image_path)
                : null,
            'items' => $items,
        ];

        if ($includeSplits) {
            $payload['splits'] = $r->paymentRequests->map(fn (PaymentRequest $pr) => [
                'id' => $pr->id,
                'contact_id' => $pr->contact_id,
                'amount' => (float) $pr->amount,
                'status' => $pr->status,
                'paid' => $pr->paid,
                'bunq_tab_id' => $pr->bunq_tab_id,
                'payment_url' => $pr->payment_url,
            ])->all();
        }

        return $payload;
    }
}
