<?php

use App\Http\Controllers\ClaudeController;
use App\Http\Controllers\WhatsappController;
use Illuminate\Support\Facades\Route;

Route::post('/whatsapp/send-text', [WhatsappController::class, 'sendText']);
Route::post('/claude/scan', [ClaudeController::class, 'scan']);
