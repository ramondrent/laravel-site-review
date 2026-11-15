<?php

namespace RamonDrent\SiteReview\Services;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use JsonException;

class SiteCopy
{
    private ?array $definitionsCache = null;

    private function overrides(): Collection
    {
        $request = request();
        if (! $request->attributes->has('site-copy')) {
            try {
                $rows = DB::table('site_texts')->get()->keyBy('key');
            } catch (\Throwable) {
                $rows = Schema::hasTable('site_texts')
                    ? DB::table('site_texts')->get()->keyBy('key')
                    : collect();
            }
            $request->attributes->set('site-copy', $rows);
        }

        return $request->attributes->get('site-copy');
    }

    /**
     * @return array<string, array{page: string, text: string}>
     */
    public function definitions(): array
    {
        if ($this->definitionsCache !== null) {
            return $this->definitionsCache;
        }

        $configured = config('site-copy');
        if (is_array($configured) && $configured !== []) {
            return $this->definitionsCache = $configured;
        }

        $path = config('site-review.copy_file');
        if (is_string($path) && $path !== '' && is_file($path)) {
            $decoded = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

            return $this->definitionsCache = is_array($decoded) ? $decoded : [];
        }

        return $this->definitionsCache = [];
    }

    /**
     * @return array{page: string, text: string}|null
     */
    public function definition(string $key): ?array
    {
        return $this->definitions()[$key] ?? null;
    }

    public function hasDefinition(string $key): bool
    {
        return isset($this->definitions()[$key]);
    }

    public function isSharedKey(string $key): bool
    {
        $def = $this->definition($key);
        if ($def && ($def['page'] ?? null) === '*') {
            return true;
        }

        foreach ((array) config('site-review.shared_key_prefixes', []) as $prefix) {
            if (is_string($prefix) && $prefix !== '' && str_starts_with($key, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public function text(string $key, ?string $default = null): string
    {
        $override = $this->overrides()->get($key)?->body;
        if ($override !== null) {
            return $override;
        }

        if ($default !== null) {
            return $default;
        }

        return (string) ($this->definition($key)['text'] ?? '');
    }

    public function version(string $key): int
    {
        return (int) ($this->overrides()->get($key)?->version ?? 0);
    }

    public function makeToken(string $key, string $defaultText, string $page): string
    {
        return Crypt::encryptString(json_encode([
            'k' => $key,
            'p' => $page,
            'd' => $defaultText,
        ], JSON_THROW_ON_ERROR));
    }

    /**
     * @return array{page: string, text: string}|null
     */
    public function verifyToken(?string $token, string $expectedKey): ?array
    {
        if (! is_string($token) || $token === '') {
            return null;
        }

        try {
            $payload = json_decode(Crypt::decryptString($token), true, flags: JSON_THROW_ON_ERROR);
        } catch (DecryptException|JsonException) {
            return null;
        }

        if (! is_array($payload)
            || ($payload['k'] ?? null) !== $expectedKey
            || ! is_string($payload['p'] ?? null)
            || ! is_string($payload['d'] ?? null)) {
            return null;
        }

        return [
            'page' => $payload['p'],
            'text' => $payload['d'],
        ];
    }
}
