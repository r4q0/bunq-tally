<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\BunqController;

Route::get('/', function () {
    return view('welcome');
});



Route::get('/bunq', function () {
    $bunq = app(BunqController::class);
    return $bunq->createPaymentRequest(new Illuminate\Http\Request([
        'amount' => 10.00,
        'description' => 'Test payment',
    ]));
});