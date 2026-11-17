<aside class="feedback review-access" lang="{{ $review->locale() }}" data-review-access aria-label="{{ $review->trans('ui.aria_label') }}">
  <script type="application/json" data-review-config>{!! json_encode($frontendConfig, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) !!}</script>
  <button type="button" class="review-unlock-launcher" data-review-unlock aria-haspopup="dialog" aria-expanded="false" aria-controls="review-unlock-dialog">
    <span class="review-unlock-mark" data-review-launcher-mark aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M16.86 3.49a2.1 2.1 0 1 1 2.97 2.97L7.5 18.79 3 20l1.21-4.5L16.86 3.49Z"/><path d="m15 5.5 3 3"/></svg>
    </span>
    <span class="review-unlock-label">{{ $review->trans('ui.unlock_button') }}</span>
  </button>
  <section class="review-dialog review-unlock-dialog" id="review-unlock-dialog" data-review-unlock-dialog role="dialog" aria-labelledby="review-unlock-title" hidden>
    <form data-review-unlock-form action="{{ route('site-review.unlock', [], false) }}" method="post" novalidate>
      @csrf
      <header class="review-panel-header review-unlock-header">
        <div class="review-unlock-heading">
          <span class="review-unlock-mark" data-review-dialog-mark aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M16.86 3.49a2.1 2.1 0 1 1 2.97 2.97L7.5 18.79 3 20l1.21-4.5L16.86 3.49Z"/><path d="m15 5.5 3 3"/></svg>
          </span>
          <div>
            <h2 id="review-unlock-title">{{ $review->trans('ui.unlock_title') }}</h2>
            <p>{{ $review->trans('ui.unlock_subtitle') }}</p>
          </div>
        </div>
        <button type="button" class="review-icon-button" data-review-unlock-close aria-label="{{ $review->trans('ui.unlock_close') }}">×</button>
      </header>
      <div class="review-unlock-fields">
        <div class="review-field">
          <label for="review-access-name">{{ $review->trans('ui.your_name') }}</label>
          <div class="review-field-box" data-review-name-box>
            <input id="review-access-name" name="name" autocomplete="name" maxlength="100" placeholder="{{ $review->trans('ui.your_name_placeholder') }}" required />
            <span class="review-avatar review-unlock-avatar is-empty" data-review-unlock-avatar aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg>
              <span data-review-unlock-initials></span>
            </span>
          </div>
        </div>
        <div class="review-field">
          <label for="review-access-password">{{ $review->trans('ui.password') }}</label>
          <div class="review-field-box review-password-field" data-review-password-box>
            <input id="review-access-password" name="password" type="password" autocomplete="current-password" maxlength="256" placeholder="••••••••" required />
            <button type="button" class="review-password-toggle" data-review-password-toggle aria-label="{{ $review->trans('ui.password_show') }}" aria-pressed="false" title="{{ $review->trans('ui.password_show') }}">
              <svg data-eye-open viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              <svg data-eye-closed hidden viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/></svg>
            </button>
          </div>
        </div>
        <p class="review-unlock-alert" data-review-unlock-status role="alert" aria-live="polite"></p>
        <button type="submit" class="review-primary review-unlock-submit">
          <span data-review-submit-label>{{ $review->trans('ui.sign_in') }}</span>
          <svg class="review-submit-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
          <svg class="review-submit-spinner" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>
        </button>
      </div>
    </form>
  </section>
</aside>
