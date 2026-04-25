<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_requests', function (Blueprint $table) {
            $table->foreignId('receipt_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->string('status', 32)->default('pending')->after('paid_at');
            $table->string('whatsapp_message_id')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('payment_requests', function (Blueprint $table) {
            $table->dropForeign(['receipt_id']);
            $table->dropColumn(['receipt_id', 'status', 'whatsapp_message_id']);
        });
    }
};
