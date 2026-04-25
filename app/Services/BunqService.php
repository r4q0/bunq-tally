<?php

namespace App\Services;

use bunq\Context\ApiContext;
use bunq\Context\BunqContext;
use bunq\Model\Generated\Endpoint\BunqMeTabApiObject;
use bunq\Model\Generated\Endpoint\BunqMeTabEntryApiObject;
use bunq\Model\Generated\Object\AmountObject;
use bunq\Util\BunqEnumApiEnvironmentType;

class BunqService
{
    private string $contextPath;

    public function __construct()
    {
        $this->contextPath = storage_path('app/bunq_context.json');
        $this->boot();
    }

    private function boot(): void
    {
        if (!file_exists($this->contextPath)) {
            throw new \RuntimeException(
                'bunq context not initialised. Run: php artisan bunq:setup'
            );
        }

        BunqContext::loadApiContext(ApiContext::restore($this->contextPath));
    }

    /**
     * Create a bunq.me payment link for the given amount.
     *
     * @return array{tab_id: int, url: string}
     */
    public function createPaymentLink(float $amount, string $description): array
    {
        $accountId = config('bunq.monetary_account_id') ? (int) config('bunq.monetary_account_id') : null;

        $tabId = BunqMeTabApiObject::create(
            new BunqMeTabEntryApiObject(
                new AmountObject(number_format($amount, 2, '.', ''), 'EUR'),
                $description
            ),
            $accountId
        )->getValue();

        $tab = BunqMeTabApiObject::get($tabId, $accountId)->getValue();

        return [
            'tab_id' => $tabId,
            'url'    => $tab->getBunqmeTabShareUrl(),
        ];
    }

    /**
     * Returns true if at least one payment has been made against the tab.
     */
    public function isTabPaid(int $tabId): bool
    {
        $accountId = config('bunq.monetary_account_id') ? (int) config('bunq.monetary_account_id') : null;
        $tab = BunqMeTabApiObject::get($tabId, $accountId)->getValue();

        $inquiries = $tab->getResultInquiries();

        return !empty($inquiries);
    }
}
