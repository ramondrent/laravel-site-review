<?php

namespace RamonDrent\SiteReview\Services;

use Illuminate\Support\Facades\Lang;

class SiteReview
{
    public function enabled(): bool
    {
        return (bool) config('site-review.enabled', false);
    }

    public function locale(): string
    {
        $configured = config('site-review.locale') ?: app()->getLocale();
        $normalized = strtolower(strtok((string) $configured, '-_') ?: 'en');

        if (in_array($normalized, ['en', 'nl'], true)) {
            return $normalized;
        }

        if (Lang::hasForLocale('site-review::review.ui.unlock_button', $normalized)) {
            return $normalized;
        }

        return 'en';
    }

    public function trans(string $key, array $replace = []): string
    {
        return __('site-review::review.'.$key, $replace, $this->locale());
    }

    public function frontendConfig(ReviewPages $pages): array
    {
        $locale = $this->locale();
        $jsTranslations = __('site-review::review.js', [], $locale);

        return [
            'locale' => $locale,
            'i18n' => is_array($jsTranslations) ? $jsTranslations : [],
            'pages' => $pages->labels(),
            'sharedKeyPrefixes' => array_values((array) config('site-review.shared_key_prefixes', [])),
            'captureTargets' => array_values((array) config('site-review.capture_targets', [])),
        ];
    }
}
