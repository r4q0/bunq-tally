<?php

namespace App\Services;

use bunq\Context\ApiContext;
use bunq\Context\ApiEnvironmentType;
use bunq\Context\BunqContext;
use bunq\Model\Generated\Endpoint\BunqMeTab;
use bunq\Model\Generated\Object\Amount;
use bunq\Model\Generated\Object\BunqMeTabEntry;

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
            $context = ApiContext::create(
                config('bunq.env') === 'production'
                    ? ApiEnvironmentType::PRODUCTION()
                    : ApiEnvironmentType::SANDBOX(),
                config('bunq.api_key'),
                'bunq-tally'
            );
            $context->save($this->contextPath);
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
        $accountId = (int) config('bunq.monetary_account_id');

        $tabId = BunqMeTab::create(
            new BunqMeTabEntry(
                new Amount(number_format($amount, 2, '.', ''), 'EUR'),
                $description
            ),
            $accountId
        )->getValue();

        $tab = BunqMeTab::get($tabId, $accountId)->getValue();

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
        $accountId = (int) config('bunq.monetary_account_id');
        $tab = BunqMeTab::get($tabId, $accountId)->getValue();

        $inquiries = $tab->getResultInquiries();

        return !empty($inquiries);
    }
}
