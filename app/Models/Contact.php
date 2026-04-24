<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    protected $fillable = ['name', 'phone_number', 'whatsapp_profile_pic'];

    public function paymentRequests()
    {
        return $this->hasMany(PaymentRequest::class);
    }
}
