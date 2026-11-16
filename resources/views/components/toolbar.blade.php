@php
  $review = app(\RamonDrent\SiteReview\Services\SiteReview::class);
  $access = app(\RamonDrent\SiteReview\Services\ReviewAccess::class);
@endphp
@if($review->enabled() && $access->configured())
  @php
    $pages = app(\RamonDrent\SiteReview\Services\ReviewPages::class);
    $frontendConfig = $review->frontendConfig($pages);
    $reviewSession = $access->current(request());
    $cssVersion = $review->assetVersion('site-review.css');
    $jsVersion = $review->assetVersion('site-review.js');
  @endphp
  <link rel="stylesheet" href="{{ route('site-review.asset', ['file' => 'site-review.css', 'v' => $cssVersion], false) }}" />
  @if($reviewSession)
    @include('site-review::partials.toolbar', ['review' => $review, 'reviewSession' => $reviewSession, 'frontendConfig' => $frontendConfig])
  @else
    @include('site-review::partials.unlock', ['review' => $review, 'frontendConfig' => $frontendConfig])
  @endif
  <script type="module" src="{{ route('site-review.asset', ['file' => 'site-review.js', 'v' => $jsVersion], false) }}"></script>
@endif
