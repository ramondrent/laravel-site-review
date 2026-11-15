<aside class="feedback review-access" lang="{{ $review->locale() }}" data-review-access aria-label="{{ $review->trans('ui.aria_label') }}">
  <script type="application/json" data-review-config>{!! json_encode($frontendConfig, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) !!}</script>
  <button type="button" class="review-unlock-launcher" data-review-unlock aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>{{ $review->trans('ui.unlock_button') }}</span></button>
  <dialog class="review-dialog review-unlock-dialog" data-review-unlock-dialog aria-labelledby="review-unlock-title">
    <form data-review-unlock-form action="{{ route('site-review.unlock', [], false) }}" method="post">
      @csrf
      <header class="review-panel-header"><div><h2 id="review-unlock-title">{{ $review->trans('ui.unlock_title') }}</h2><p>{{ $review->trans('ui.unlock_subtitle') }}</p></div><button type="button" class="review-icon-button" data-review-unlock-close aria-label="{{ $review->trans('ui.unlock_close') }}">×</button></header>
      <div class="review-unlock-fields">
        <label for="review-access-name">{{ $review->trans('ui.your_name') }}</label><input id="review-access-name" name="name" autocomplete="name" maxlength="100" required />
        <label for="review-access-password">{{ $review->trans('ui.password') }}</label>
        <div class="review-password-field">
          <input id="review-access-password" name="password" type="password" autocomplete="current-password" maxlength="256" required />
          <button type="button" class="review-password-toggle" data-review-password-toggle aria-label="{{ $review->trans('ui.password_show') }}" aria-pressed="false" title="{{ $review->trans('ui.password_show') }}">
            <svg data-eye-open viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg data-eye-closed hidden viewBox="0 0 24 24" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M3 3l18 18"/></svg>
          </button>
        </div>
        <p>{{ $review->trans('ui.unlock_note') }}</p>
        <p data-review-unlock-status role="status" aria-live="polite"></p>
        <button type="submit" class="review-primary">{{ $review->trans('ui.sign_in') }} <span aria-hidden="true">→</span></button>
      </div>
    </form>
  </dialog>
</aside>
