<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Enable Site Review Mode
    |--------------------------------------------------------------------------
    |
    | When enabled (and a password hash is configured), visitors see an unlock
    | launcher to sign in with their name and the shared review password.
    | Saved text edits remain visible on the site even when disabled.
    |
    */
    'enabled' => (bool) env('SITE_REVIEW_ENABLED', env('FEEDBACK_ENABLED', false)),

    /*
    |--------------------------------------------------------------------------
    | Shared Password Hash
    |--------------------------------------------------------------------------
    |
    | Generate and store a bcrypt hash using `php artisan review:password`.
    | Never store the plaintext password in configuration or version control.
    |
    */
    'password_hash' => (string) env('SITE_REVIEW_PASSWORD_HASH', env('FEEDBACK_PASSWORD_HASH', '')),

    /*
    |--------------------------------------------------------------------------
    | Access Grant Lifetime (Minutes)
    |--------------------------------------------------------------------------
    |
    | How long a reviewer stays signed in on their device (sliding expiration).
    | Defaults to 43200 minutes (30 days).
    |
    */
    'access_minutes' => (int) env('SITE_REVIEW_ACCESS_MINUTES', env('FEEDBACK_ACCESS_MINUTES', 43200)),

    /*
    |--------------------------------------------------------------------------
    | Review Interface Locale
    |--------------------------------------------------------------------------
    |
    | Set to 'en' or 'nl' to force a specific language for the review toolbar
    | independently of your website's content locale, or leave null to follow
    | `app()->getLocale()`.
    |
    */
    'locale' => env('SITE_REVIEW_LOCALE'),

    /*
    |--------------------------------------------------------------------------
    | Route Prefix & Middleware
    |--------------------------------------------------------------------------
    |
    | All review endpoints and pre-built assets are served under this prefix.
    |
    */
    'route_prefix' => env('SITE_REVIEW_ROUTE_PREFIX', 'review'),
    'middleware' => ['web'],
    'prevent_caching' => true,

    /*
    |--------------------------------------------------------------------------
    | Allowed Pages
    |--------------------------------------------------------------------------
    |
    | Use ['*'] to allow comments and edits on any relative URL path, or list
    | specific paths / path => label pairs:
    |   ['/' => 'Home', '/about' => 'About us']
    |
    */
    'pages' => ['*'],

    /*
    |--------------------------------------------------------------------------
    | Editable Copy Definitions (Optional)
    |--------------------------------------------------------------------------
    |
    | You can define editable text inline via `<x-review::text key="...">`,
    | or optionally load a JSON key map (`{"key": {"page": "/", "text": "..."}}`)
    | for centralized copy management.
    |
    */
    'copy_file' => null,
    'shared_key_prefixes' => [],

    /*
    |--------------------------------------------------------------------------
    | Additional Comment Anchor Selectors (Optional)
    |--------------------------------------------------------------------------
    |
    | Extra CSS selectors specific to your project's components that comment
    | pins should snap to when clicked.
    |
    */
    'capture_targets' => [],

    /*
    |--------------------------------------------------------------------------
    | Live Multiplayer Cursors (Optional — Requires Laravel Reverb)
    |--------------------------------------------------------------------------
    */
    'cursors' => [
        'enabled' => (bool) env('SITE_REVIEW_CURSORS_ENABLED', env('REVIEW_CURSORS_ENABLED', false)),
        'dedicated_reverb' => true,
    ],
];
