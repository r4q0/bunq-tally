<?php

use App\Http\Controllers\BunqController;
use App\Http\Controllers\ClaudeController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\WhatsappController;
use Illuminate\Support\Facades\Route;

// Contacts
Route::get('/contacts', [ContactController::class, 'index']);
Route::post('/contacts', [ContactController::class, 'store']);
Route::patch('/contacts/{contact}', [ContactController::class, 'update']);
Route::delete('/contacts/{contact}', [ContactController::class, 'destroy']);

// Receipts
Route::get('/receipts', [ReceiptController::class, 'index']);
Route::get('/receipts/{receipt}', [ReceiptController::class, 'show']);
Route::post('/receipts/{receipt}/allocations', [ReceiptController::class, 'saveAllocations']);
Route::post('/receipts/{receipt}/split', [ReceiptController::class, 'split']);
Route::get('/receipts/{receipt}/status', [ReceiptController::class, 'status']);

// Claude OCR
Route::post('/claude/scan', [ClaudeController::class, 'scan']);

// WhatsApp
Route::get('/whatsapp/profile-pic', [WhatsappController::class, 'getProfilePic']);
Route::post('/whatsapp/send-text', [WhatsappController::class, 'sendText']);

// bunq payment requests
Route::post('/payment-requests', [BunqController::class, 'createPaymentRequest']);
Route::post('/payment-requests/{paymentRequest}/sync', [BunqController::class, 'syncPaymentStatus']);

// bunq calls this URL when a payment lands - no auth, no CSRF.
Route::post('/bunq/webhook', [BunqController::class, 'webhook']);
