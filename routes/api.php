<?php

use App\Http\Controllers\WhatsappController;
use Illuminate\Support\Facades\Route;

Route::post('/whatsapp/send-text', [WhatsappController::class, 'sendText']);
