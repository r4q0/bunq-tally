<?php

namespace App\Console\Commands;

use bunq\Context\ApiContext;
use bunq\Context\BunqContext;
use bunq\Util\BunqEnumApiEnvironmentType;
use Illuminate\Console\Command;

class BunqSetup extends Command
{
    protected $signature = 'bunq:setup';
    protected $description = 'Register this device with bunq and save the API context';

    public function handle(): int
    {
        $contextPath = storage_path('app/bunq_context.json');

        if (file_exists($contextPath)) {
            $this->info('Context file already exists. Delete it first if you want to re-register.');
            return self::SUCCESS;
        }

        $apiKey = config('bunq.api_key');
        $env    = config('bunq.env');

        if (!$apiKey) {
            $this->error('BUNQ_API_KEY is not set in .env');
            return self::FAILURE;
        }

        $this->info("Registering with bunq ({$env})...");

        $maxAttempts = 5;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $context = ApiContext::create(
                    $env === 'production'
                        ? BunqEnumApiEnvironmentType::PRODUCTION()
                        : BunqEnumApiEnvironmentType::SANDBOX(),
                    $apiKey,
                    'bunq-tally'
                );

                $context->save($contextPath);
                $this->info("Done. Context saved to {$contextPath}");
                return self::SUCCESS;

            } catch (\bunq\Exception\TooManyRequestsException $e) {
                if ($attempt === $maxAttempts) {
                    $this->error('Still rate-limited after ' . $maxAttempts . ' attempts.');
                    return self::FAILURE;
                }
                $wait = $attempt * 35;
                $this->warn("Rate limited. Waiting {$wait}s before retry ({$attempt}/{$maxAttempts})...");
                sleep($wait);
            }
        }

        return self::FAILURE;
    }
}
