<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceiptItemAllocation extends Model
{
    protected $fillable = ['receipt_item_id', 'contact_id', 'weight'];

    protected $casts = [
        'weight' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(ReceiptItem::class, 'receipt_item_id');
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }
}
