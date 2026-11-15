@php
  $cursors = app(\RamonDrent\SiteReview\Services\ReviewCursors::class);
  $cursorChannel = $cursors->configured() ? $cursors->channel(request()->getPathInfo()) : null;
@endphp
@if($cursorChannel)
  <div class="review-live-cursors" data-review-live-cursors aria-hidden="true"
    data-key="{{ config('reverb.apps.apps.0.key') }}"
    data-host="{{ config('reverb.apps.apps.0.options.host') }}"
    data-port="{{ config('reverb.apps.apps.0.options.port') }}"
    data-scheme="{{ config('reverb.apps.apps.0.options.scheme') }}"
    data-channel="{{ substr($cursorChannel, 9) }}"
    data-auth-url="{{ route('site-review.cursors.auth', [], false) }}"></div>
@endif
