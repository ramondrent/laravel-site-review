<?php

namespace RamonDrent\SiteReview\Services;

use Closure;
use Illuminate\Support\Str;

class ReviewPages
{
    /**
     * Normalized map of configured patterns/paths => optional human label.
     *
     * @return array<string, string|null>
     */
    public function configured(): array
    {
        $raw = (array) config('site-review.pages', ['*']);
        $normalized = [];

        foreach ($raw as $key => $value) {
            if (is_int($key)) {
                $normalized[(string) $value] = null;
            } else {
                $normalized[(string) $key] = is_string($value) ? $value : null;
            }
        }

        return $normalized ?: ['*' => null];
    }

    /**
     * @return array<string, string>
     */
    public function labels(): array
    {
        return array_filter($this->configured(), fn ($label) => is_string($label) && $label !== '');
    }

    public function isValidPath(mixed $value): bool
    {
        if (! is_string($value) || $value === '' || strlen($value) > 255) {
            return false;
        }

        if (! preg_match('/^\/(?!\/)[a-zA-Z0-9\/_\-\.]*$/', $value)) {
            return false;
        }

        if (str_contains($value, '..')) {
            return false;
        }

        $prefix = '/'.trim((string) config('site-review.route_prefix', 'review'), '/');
        if ($prefix !== '/' && ($value === $prefix || str_starts_with($value, $prefix.'/'))) {
            return false;
        }

        return true;
    }

    public function allows(mixed $page): bool
    {
        if (! $this->isValidPath($page)) {
            return false;
        }

        $configured = array_keys($this->configured());
        if (in_array('*', $configured, true)) {
            return true;
        }

        foreach ($configured as $pattern) {
            if ($pattern === $page || (str_contains($pattern, '*') && Str::is($pattern, $page))) {
                return true;
            }
        }

        return false;
    }

    public function rules(bool $nullable = false): array
    {
        return [
            $nullable ? 'nullable' : 'required',
            'string',
            'max:255',
            function (string $attribute, mixed $value, Closure $fail): void {
                if (! $this->allows($value)) {
                    $fail(__('validation.in', ['attribute' => $attribute]));
                }
            },
        ];
    }

    public function roomForPage(string $page): ?string
    {
        if (! $this->allows($page)) {
            return null;
        }

        if ($page === '/') {
            return 'home';
        }

        $slug = trim(str_replace('/', '.', $page), '.');
        $sanitized = preg_replace('/[^a-zA-Z0-9_\-.]/', '-', $slug) ?: 'page';

        return strlen($sanitized) <= 100
            ? $sanitized
            : substr($sanitized, 0, 80).'.'.substr(hash('sha256', $page), 0, 16);
    }

    public function allowsChannel(string $channelName): bool
    {
        $prefix = 'presence-review-cursors.';
        if (! str_starts_with($channelName, $prefix)) {
            return false;
        }

        $room = substr($channelName, strlen($prefix));
        if (! preg_match('/^[a-zA-Z0-9_\-.]{1,120}$/', $room)) {
            return false;
        }

        $configured = array_keys($this->configured());
        foreach ($configured as $pattern) {
            if ($pattern === '*' || str_contains($pattern, '*')) {
                return true;
            }
        }

        $allowedRooms = array_filter(array_map(fn (string $page) => $this->roomForPage($page), $configured));

        return in_array($room, $allowedRooms, true);
    }
}
