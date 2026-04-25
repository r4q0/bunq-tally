<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->string('receipt_image_path')->nullable()->after('store');
            $table->string('currency', 8)->nullable()->after('total_price');
            $table->date('purchased_at')->nullable()->after('currency');
        });
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->dropColumn(['receipt_image_path', 'currency', 'purchased_at']);
        });
    }
};
