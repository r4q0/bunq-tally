<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use App\Models\PaymentRequest;
use App\Models\Receipt;
use App\Models\ReceiptItemAllocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

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

        DB::transaction(function () use ($data, $itemIds) {
            foreach ($data['allocations'] as $row) {
                if (! in_array($row['receipt_item_id'], $itemIds, true)) {
                    continue;
                }

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
     * Compute per-contact totals from current allocations and create/update payment_requests.
     */
    public function split(Receipt $receipt): JsonResponse
    {
        $receipt->load('items.allocations');
        $totals = $this->computePerContactTotals($receipt);

        DB::transaction(function () use ($receipt, $totals) {
            PaymentRequest::where('receipt_id', $receipt->id)->delete();

            foreach ($totals as $contactId => $amount) {
                if ($amount <= 0) {
                    continue;
                }

                PaymentRequest::create([
                    'receipt_id' => $receipt->id,
                    'contact_id' => $contactId,
                    'amount' => round($amount, 2),
                    'status' => 'pending',
                ]);
            }
        });

        $receipt->load('paymentRequests.contact');

        return response()->json([
            'ok' => true,
            'receipt_id' => $receipt->id,
            'splits' => $receipt->paymentRequests->map(fn (PaymentRequest $pr) => [
                'id' => $pr->id,
                'contact_id' => $pr->contact_id,
                'contact' => $pr->contact ? [
                    'id' => $pr->contact->id,
                    'name' => $pr->contact->name,
                    'color' => $pr->contact->color,
                    'phone_number' => $pr->contact->phone_number,
                ] : null,
                'amount' => $pr->amount,
                'status' => $pr->status,
                'paid' => $pr->paid,
            ]),
        ]);
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
            ])->all();
        }

        return $payload;
    }
}
