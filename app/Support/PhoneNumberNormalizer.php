<?php

namespace App\Support;

use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

class PhoneNumberNormalizer
{
    private PhoneNumberUtil $util;

    public function __construct()
    {
        $this->util = PhoneNumberUtil::getInstance();
    }

    /**
     * Normalize a phone number to E.164 format.
     *
     * @param  string  $raw  Raw phone number (e.g. "06 12345678" or "+31612345678")
     * @param  string  $countryCode  ISO 3166-1 alpha-2 country code hint (e.g. "NL")
     * @return array{e164: string}|array{error: string}
     */
    public function normalize(string $raw, string $countryCode = 'ZZ'): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return ['error' => 'Phone number is required.'];
        }

        $region = strtoupper($countryCode) ?: 'ZZ';

        try {
            $parsed = $this->util->parse($raw, $region);
        } catch (NumberParseException) {
            return ['error' => 'Could not parse this phone number. Try including the country code (e.g. +31 6 12345678).'];
        }

        if (! $this->util->isValidNumber($parsed)) {
            $regionName = $region !== 'ZZ' ? $region : 'the selected country';
            return ['error' => "This phone number is not valid for {$regionName}. Check the number and country selection."];
        }

        return ['e164' => $this->util->format($parsed, PhoneNumberFormat::E164)];
    }
}
