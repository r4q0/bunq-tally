<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReceiptItem extends Model
{
    protected $fillable = ['receipt_id', 'item_name', 'price', 'quantity'];

    public function receipt()
    {
        return $this->belongsTo(Receipt::class);
    }
}
