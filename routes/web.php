<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\BunqController;




Route::get('/bunq', function () {
    $bunq = app(BunqController::class);
    return $bunq->createPaymentRequest(new Illuminate\Http\Request([
        'amount' => 10.00,
        'description' => 'Test payment',
    ]));
});
Route::view('/', 'app');
Route::view('/{any}', 'app')->where('any', '^(?!api|storage|build|fonts).*$');
