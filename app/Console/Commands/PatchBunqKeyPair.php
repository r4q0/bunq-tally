<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class PatchBunqKeyPair extends Command
{
    protected $signature = 'bunq:patch-keypair';
    protected $description = 'Patch bunq SDK OpenSSL calls to work on Windows/XAMPP';

    private array $opensslPaths = [
        'C:/xampp/apache/conf/openssl.cnf',
        'C:/xampp/php/extras/openssl/openssl.cnf',
        'C:/xampp/php/extras/ssl/openssl.cnf',
    ];

    public function handle(): void
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return;
        }

        $this->patchKeyPair();
        $this->patchPrivateKey();
    }

    private function patchKeyPair(): void
    {
        $file = base_path('vendor/bunq/sdk_php/src/Security/KeyPair.php');

        if (!file_exists($file) || str_contains(file_get_contents($file), 'PHP_OS_FAMILY')) {
            $this->info('KeyPair: already patched or not found.');
            return;
        }

        $original = <<<'PHP'
        $opensslKeyPair = openssl_pkey_new([
            self::FIELD_KEY_ALGORITHM => self::PRIVATE_KEY_ALGORITHM,
            self::FIELD_KEY_LENGTH => self::PRIVATE_KEY_LENGTH,
            self::FIELD_KEY_TYPE => OPENSSL_KEYTYPE_RSA
        ]);
PHP;

        $pathsList = $this->buildPathsList();
        $patched = <<<PHP
        \$config = [
            self::FIELD_KEY_ALGORITHM => self::PRIVATE_KEY_ALGORITHM,
            self::FIELD_KEY_LENGTH => self::PRIVATE_KEY_LENGTH,
            self::FIELD_KEY_TYPE => OPENSSL_KEYTYPE_RSA,
        ];

        if (PHP_OS_FAMILY === 'Windows') {
            foreach ($pathsList as \$path) {
                if (file_exists(\$path)) {
                    \$config['config'] = \$path;
                    break;
                }
            }
        }

        \$opensslKeyPair = openssl_pkey_new(\$config);
PHP;

        $this->applyPatch($file, $original, $patched, 'KeyPair');
    }

    private function patchPrivateKey(): void
    {
        $file = base_path('vendor/bunq/sdk_php/src/Security/PrivateKey.php');

        if (!file_exists($file) || str_contains(file_get_contents($file), 'PHP_OS_FAMILY')) {
            $this->info('PrivateKey: already patched or not found.');
            return;
        }

        $original = <<<'PHP'
        openssl_pkey_export($this->getKey(), $privateKeyString);
PHP;

        $pathsList = $this->buildPathsList();
        $patched = <<<PHP
        \$config = [];

        if (PHP_OS_FAMILY === 'Windows') {
            foreach ($pathsList as \$path) {
                if (file_exists(\$path)) {
                    \$config['config'] = \$path;
                    break;
                }
            }
        }

        openssl_pkey_export(\$this->getKey(), \$privateKeyString, null, \$config ?: null);
PHP;

        $this->applyPatch($file, $original, $patched, 'PrivateKey');
    }

    private function applyPatch(string $file, string $original, string $patched, string $label): void
    {
        $contents = file_get_contents($file);
        $new = str_replace($original, $patched, $contents);

        if ($new === $contents) {
            $this->warn("$label: original code not found, patch skipped.");
            return;
        }

        file_put_contents($file, $new);
        $this->info("$label: patched successfully.");
    }

    private function buildPathsList(): string
    {
        $paths = array_map(fn($p) => "            '$p'", $this->opensslPaths);
        return "[\n" . implode(",\n", $paths) . ",\n        ]";
    }
}
