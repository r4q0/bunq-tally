<?php

use App\Http\Controllers\ClaudeController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\WhatsappController;
use Illuminate\Support\Facades\Route;

Route::post('/whatsapp/send-text', [WhatsappController::class, 'sendText']);

Route::post('/claude/scan', [ClaudeController::class, 'scan']);

Route::get('/contacts', [ContactController::class, 'index']);
Route::post('/contacts', [ContactController::class, 'store']);
Route::patch('/contacts/{contact}', [ContactController::class, 'update']);
Route::delete('/contacts/{contact}', [ContactController::class, 'destroy']);

Route::get('/receipts', [ReceiptController::class, 'index']);
Route::get('/receipts/{receipt}', [ReceiptController::class, 'show']);
Route::post('/receipts/{receipt}/allocations', [ReceiptController::class, 'saveAllocations']);
Route::post('/receipts/{receipt}/split', [ReceiptController::class, 'split']);
Route::get('/receipts/{receipt}/status', [ReceiptController::class, 'status']);
