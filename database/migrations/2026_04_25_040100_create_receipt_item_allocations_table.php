<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receipt_item_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receipt_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('weight')->default(1);
            $table->timestamps();

            $table->unique(['receipt_item_id', 'contact_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receipt_item_allocations');
    }
};
