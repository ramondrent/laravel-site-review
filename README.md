# Laravel Site Review

Shared-password in-page commenting, live copy editing, changelog, reviewer presence, and optional multiplayer cursors for Laravel websites.

Built for client & team website reviews: visitors browse your public site normally, while anyone with the shared password can sign in with their name to pin threaded comments anywhere on the page and edit tagged website copy live.

## Features

- **Name + shared password unlock** — Bcrypt password hash stored in `.env` (`php artisan review:password`), 30-day sliding HTTP-only grant cookie, instant revocation on password rotation.
- **Anchored comment threads** — Click anywhere on the page to pin a comment, reply in threads, see combined reviewer initials/colors on pins, edit your own comments, or soft-delete comments (`FeedbackNote::withTrashed()`).
- **Live copy editing** — Wrap copy in `<x-review::text key="...">` (or use a centralized JSON copy file). Edits save immediately to `site_texts`, stay visible even after review mode is turned off, and include optimistic concurrency (`409` conflict protection).
- **Changelog & reviewer presence** — Built-in history dialog with before/after diffs and a presence panel showing who is currently viewing which page (plus self-service display name updates).
- **Zero-build frontend** — Pre-compiled CSS and JS are served automatically by the package only when review mode is enabled (`0 KB` added when disabled). No Vite or npm setup required in your host project.
- **English & Dutch out of the box** — Ships with `en` and `nl` translations; set `SITE_REVIEW_LOCALE=nl` (or `en`) independently of your site's content locale.
- **Optional multiplayer cursors** — Live named pointers powered by Laravel Reverb when `SITE_REVIEW_CURSORS_ENABLED=true`.

---

## Installing in Another Laravel Project

### Option A: From a private (or public) GitHub repository

Push this folder (`packages/laravel-site-review`) to its own GitHub repository (e.g. `ramondrent/laravel-site-review`), then add the repository to your target Laravel project's `composer.json`:

```json
{
    "repositories": [
        {
            "type": "vcs",
            "url": "git@github.com:ramondrent/laravel-site-review.git"
        }
    ]
}
```

Then install it:

```bash
composer require ramondrent/laravel-site-review
```

*(If published to Packagist, skip adding `"repositories"` and run `composer require ramondrent/laravel-site-review` directly.)*

---

## Quickstart

### 1. Run the migrations & set a shared password

```bash
php artisan migrate
php artisan review:password --generate
```

Enable review mode in your `.env`:

```dotenv
SITE_REVIEW_ENABLED=true
# Written automatically by `php artisan review:password`:
SITE_REVIEW_PASSWORD_HASH='...'
# Optional: force 'nl' or 'en' for the review UI (defaults to APP_LOCALE)
SITE_REVIEW_LOCALE=nl
```

### 2. Add the toolbar component to your layout

Place `<x-review::toolbar />` right before `</body>` in your main layout (e.g. `resources/views/layouts/app.blade.php`):

```blade
    @yield('content')
    <x-review::toolbar />
</body>
```

Comment pins work immediately on every page!

### 3. Tag copy you want reviewers to edit

Wrap any plain-text copy in `<x-review::text>` with a stable `key`:

```blade
<h1>
    <x-review::text key="home.hero.title">
        Welcome to our new website
    </x-review::text>
</h1>

{{-- Custom wrapper tag & classes --}}
<x-review::text key="home.hero.subtitle" tag="p" class="lead">
    Subtle, science-backed experiences for modern spaces.
</x-review::text>

{{-- Copy shared across multiple pages (e.g. footer or modal) --}}
<x-review::text key="footer.cta" shared>
    Book an introductory call
</x-review::text>
```

---

## Configuration (Optional)

Publish the config file if you want to restrict allowed pages, change the `/review` route prefix, or point to a centralized JSON copy file:

```bash
php artisan vendor:publish --tag=site-review-config
```

Example `config/site-review.php` customization:

```php
return [
    'enabled' => (bool) env('SITE_REVIEW_ENABLED', false),
    'locale' => env('SITE_REVIEW_LOCALE', 'nl'),
    'route_prefix' => 'review',

    // Allow all pages with ['*'], or restrict & label specific routes:
    'pages' => [
        '/' => 'Home',
        '/about' => 'About',
        '/contact' => 'Contact',
    ],

    // Optional centralized defaults file: {"home-001": {"page": "/", "text": "..."}}
    'copy_file' => null,
];
```

### Optional Live Cursors (Laravel Reverb)

1. Install Reverb in the host project: `composer require laravel/reverb`
2. Set `SITE_REVIEW_CURSORS_ENABLED=true` and configure `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`, `REVERB_HOST`, `REVERB_PORT`, and `REVERB_SCHEME` in `.env`.
3. Run `php artisan reverb:start`.

---

## Rebuilding Package Assets (Package Development)

Pre-built assets in `dist/` are committed so consumers never need Node/Vite. When editing files in `resources/js/` or `resources/css/`:

```bash
npm install
npm run build
```
