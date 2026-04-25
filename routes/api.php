<?php

use App\Http\Controllers\BunqController;
use Illuminate\Support\Facades\Route;

Route::post('/payment-requests', [BunqController::class, 'createPaymentRequest']);
Route::post('/payment-requests/{paymentRequest}/sync', [BunqController::class, 'syncPaymentStatus']);

// bunq calls this URL when a payment lands — no auth, no CSRF
Route::post('/bunq/webhook', [BunqController::class, 'webhook']);
