<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Receipt extends Model
{
    protected $fillable = [
        'user_id',
        'store',
        'receipt_image_path',
        'total_price',
        'currency',
        'purchased_at',
    ];

    protected $casts = [
        'total_price' => 'decimal:2',
        'purchased_at' => 'date',
    ];

    public function user()
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function items()
    {
        return $this->hasMany(ReceiptItem::class);
    }
}
