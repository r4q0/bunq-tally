<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->char('country_code', 2)->nullable()->after('phone_number');
        });

        // Backfill: detect country from numbers already in E.164 format
        $util = \libphonenumber\PhoneNumberUtil::getInstance();
        DB::table('contacts')
            ->whereNotNull('phone_number')
            ->whereNull('country_code')
            ->get(['id', 'phone_number'])
            ->each(function ($row) use ($util) {
                try {
                    $parsed = $util->parse($row->phone_number, null);
                    if ($util->isValidNumber($parsed)) {
                        $region = $util->getRegionCodeForNumber($parsed);
                        if ($region && $region !== 'ZZ') {
                            DB::table('contacts')->where('id', $row->id)->update(['country_code' => $region]);
                        }
                    }
                } catch (\Exception) {
                    // Leave as null — user must edit the contact to set country
                }
            });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropColumn('country_code');
        });
    }
};
