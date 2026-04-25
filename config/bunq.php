<?php

return [
    'api_key'             => env('BUNQ_API_KEY'),
    'monetary_account_id' => env('BUNQ_MONETARY_ACCOUNT_ID'),
    'env'                 => env('BUNQ_ENV', 'sandbox'), // 'sandbox' or 'production'
];
