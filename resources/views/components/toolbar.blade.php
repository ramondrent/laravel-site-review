@php
  $review = app(\RamonDrent\SiteReview\Services\SiteReview::class);
  $access = app(\RamonDrent\SiteReview\Services\ReviewAccess::class);
@endphp
@if($review->enabled() && $access->configured())
  @php
    $pages = app(\RamonDrent\SiteReview\Services\ReviewPages::class);
    $frontendConfig = $review->frontendConfig($pages);
    $reviewSession = $access->current(request());
    $distDir = dirname(__DIR__, 3).'/dist';
    $cssVersion = is_file($distDir.'/site-review.css') ? substr((string) md5_file($distDir.'/site-review.css'), 0, 12) : '1';
    $jsVersion = is_file($distDir.'/site-review.js') ? substr((string) md5_file($distDir.'/site-review.js'), 0, 12) : '1';
  @endphp
  <link rel="stylesheet" href="{{ route('site-review.asset', ['file' => 'site-review.css', 'v' => $cssVersion], false) }}" />
  @if($reviewSession)
    @include('site-review::partials.toolbar', ['review' => $review, 'reviewSession' => $reviewSession, 'frontendConfig' => $frontendConfig])
  @else
    @include('site-review::partials.unlock', ['review' => $review, 'frontendConfig' => $frontendConfig])
  @endif
  <script type="module" src="{{ route('site-review.asset', ['file' => 'site-review.js', 'v' => $jsVersion], false) }}"></script>
@endif
