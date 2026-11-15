@props([
    'key',
    'tag' => 'span',
    'default' => null,
    'shared' => false,
])
@php
  $siteCopy = app(\RamonDrent\SiteReview\Services\SiteCopy::class);
  $review = app(\RamonDrent\SiteReview\Services\SiteReview::class);
  $access = app(\RamonDrent\SiteReview\Services\ReviewAccess::class);
  $fallback = $default !== null ? (string) $default : trim((string) $slot);
  $value = $siteCopy->text($key, $fallback);
  $version = $siteCopy->version($key);
  $isShared = (bool) $shared || $siteCopy->isSharedKey($key);
  $token = ($review->enabled() && $access->current(request()) && ! $siteCopy->hasDefinition($key))
      ? $siteCopy->makeToken($key, $fallback, $isShared ? '*' : request()->getPathInfo())
      : null;
  $copyAttrs = array_filter([
      'data-copy-key' => $key,
      'data-copy-version' => (string) $version,
      'data-copy-shared' => $isShared ? 'true' : null,
      'data-copy-token' => $token,
  ], fn ($v) => $v !== null);
@endphp
<{{ $tag }} {{ $attributes->merge($copyAttrs) }}>{{ $value }}</{{ $tag }}>