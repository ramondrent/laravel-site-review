<aside lang="{{ $review->locale() }}" class="feedback" data-feedback data-mode="cursor" data-reviewer-name="{{ $reviewSession->name }}" data-session-url="{{ route('site-review.session', [], false) }}" data-profile-url="{{ route('site-review.profile', [], false) }}" data-people-url="{{ route('site-review.people', [], false) }}" data-heartbeat-url="{{ route('site-review.heartbeat', [], false) }}" data-lock-url="{{ route('site-review.lock', [], false) }}" data-endpoint="{{ route('site-review.comments.index', [], false) }}" aria-label="{{ $review->trans('ui.aria_label') }}">
  <script type="application/json" data-review-config>{!! json_encode($frontendConfig, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) !!}</script>
  @include('site-review::partials.cursors', ['review' => $review])
  <div class="feedback-hint" hidden data-feedback-hint role="status"><span data-feedback-hint-text>{{ $review->trans('ui.place_hint') }}</span><button type="button" data-feedback-cancel aria-label="{{ $review->trans('ui.place_cancel') }}"><kbd>Esc</kbd></button></div>
  <div class="feedback-toolbar" role="toolbar" aria-label="{{ $review->trans('ui.aria_label') }}">
    <div class="review-brand" aria-label="{{ $review->trans('ui.aria_label') }}"><span class="review-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></svg></span><span class="review-brand-label">{{ $review->trans('ui.brand_main') }} <span>{{ $review->trans('ui.brand_accent') }}</span></span></div>
    <div class="review-tools" role="group" aria-label="{{ $review->trans('ui.tools_group') }}">
      <button type="button" class="review-mode" data-review-cursor aria-pressed="true" aria-label="{{ $review->trans('ui.mode_browse_title') }}" aria-keyshortcuts="V"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 14 8-6 2-3 6-5-16Z"/></svg><span class="review-tooltip">{{ $review->trans('ui.mode_browse') }} <kbd>V</kbd></span></button>
      <button type="button" class="review-mode feedback-launcher" aria-pressed="false" aria-label="{{ $review->trans('ui.mode_comment_title') }}" aria-keyshortcuts="C"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H4v-8a8 8 0 1 1 16 0Z"/></svg><span class="review-tooltip">{{ $review->trans('ui.mode_comment') }} <kbd>C</kbd></span></button>
      <button type="button" class="review-mode" data-review-edit aria-pressed="false" aria-label="{{ $review->trans('ui.mode_text_title') }}" aria-keyshortcuts="T"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6V4h14v2M12 4v16M8 20h8"/></svg><span class="review-tooltip">{{ $review->trans('ui.mode_text') }} <kbd>T</kbd></span></button>
    </div>
    <div class="review-toolbar-actions">
      <button class="feedback-notes-toggle" type="button" aria-expanded="false" aria-controls="feedback-board"><span data-feedback-count>0</span><span class="review-count-label">{{ $review->trans('ui.comments_plural') }}</span></button>
      <button class="review-history-toggle" type="button" data-review-history aria-expanded="false" aria-controls="review-history" aria-label="{{ $review->trans('ui.history_title') }}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/></svg><span class="review-tooltip">{{ $review->trans('ui.history_title') }}</span></button>
      <div class="review-avatars" data-review-avatars role="group" aria-label="{{ $review->trans('ui.people_aria') }}">
        <button type="button" class="review-avatar review-self" data-review-people-toggle aria-label="{{ $review->trans('ui.people_aria') }}" aria-expanded="false" aria-controls="review-people"><span class="review-avatar-face" data-review-avatar>?</span><span class="review-tooltip" data-review-self-tooltip>{{ $reviewSession->name }}</span></button>
      </div>
    </div>
  </div>
  <div class="feedback-pins" data-feedback-pins></div>
  <section class="feedback-sticky" data-feedback-sticky role="dialog" aria-labelledby="feedback-sticky-title" hidden>
    <header class="feedback-sticky-header"><span id="feedback-sticky-title">{{ $review->trans('ui.sticky_title') }}</span><div class="feedback-sticky-header-actions"><button type="button" class="feedback-resolve-button" data-feedback-resolve hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span data-feedback-resolve-label>{{ $review->trans('ui.resolve_action') }}</span></button><button type="button" class="review-icon-button" data-feedback-close aria-label="{{ $review->trans('ui.sticky_close') }}">×</button></div></header>
    <p class="review-anchor-label" data-feedback-context></p>
    <div class="feedback-anchor-notice" data-feedback-anchor-notice hidden><p data-feedback-anchor-notice-text></p><button type="button" class="feedback-move-button" data-feedback-move hidden>{{ $review->trans('ui.move_here_action') }}</button></div>
    <form data-feedback-form>
      @csrf
      <label class="feedback-sr-only" for="feedback-body">{{ $review->trans('ui.comment_label') }}</label>
      <div class="feedback-composer"><textarea id="feedback-body" name="body" required maxlength="5000" rows="3" placeholder="{{ $review->trans('ui.comment_placeholder') }}"></textarea><button type="submit" class="feedback-submit" aria-label="{{ $review->trans('ui.comment_save') }}" title="{{ $review->trans('ui.comment_save') }} (⌘/Ctrl + Enter)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div>
      <div class="feedback-form-footer"><p class="feedback-sharing review-author-row"><span class="review-avatar review-inline-avatar" data-review-avatar aria-hidden="true">?</span><span>{{ $review->trans('ui.posting_as_prefix') }} <strong data-review-name-label>{{ $reviewSession->name }}</strong></span></p><button type="button" class="feedback-cancel-edit" data-feedback-edit-cancel hidden>{{ $review->trans('ui.cancel') }}</button></div>
    </form>
    <div class="feedback-detail" data-feedback-detail hidden>
      <div class="feedback-thread" data-feedback-thread></div>
      <form class="feedback-reply-form" data-feedback-reply-form>
        <label class="feedback-sr-only" for="feedback-reply-body">{{ $review->trans('ui.reply_label') }}</label>
        <div class="feedback-composer feedback-reply-composer"><textarea id="feedback-reply-body" name="body" required maxlength="5000" rows="2" placeholder="{{ $review->trans('ui.reply_placeholder') }}"></textarea><button type="submit" class="feedback-submit" aria-label="{{ $review->trans('ui.reply_save') }}" title="{{ $review->trans('ui.reply_save') }} (⌘/Ctrl + Enter)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div>
        <p class="feedback-sharing review-author-row"><span class="review-avatar review-inline-avatar" data-review-avatar aria-hidden="true">?</span><span>{{ $review->trans('ui.posting_as_prefix') }} <strong data-review-name-label>{{ $reviewSession->name }}</strong></span></p>
      </form>
    </div>
    <p class="feedback-note-status" data-feedback-status role="status" aria-live="polite"></p>
  </section>
  <section class="feedback-board" id="feedback-board" role="dialog" aria-labelledby="feedback-board-title" hidden>
    <header class="review-panel-header"><div><h2 id="feedback-board-title">{{ $review->trans('ui.board_title') }}</h2><p>{{ $review->trans('ui.board_subtitle') }}</p></div><button type="button" class="review-icon-button" data-feedback-board-close aria-label="{{ $review->trans('ui.board_close') }}">×</button></header>
    <div class="feedback-board-actions"><div class="feedback-filter-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-feedback-filter="open">{{ $review->trans('ui.filter_open') }} <span data-feedback-board-count>0</span></button><button type="button" role="tab" aria-selected="false" data-feedback-filter="resolved">{{ $review->trans('ui.filter_resolved') }} <span data-feedback-resolved-count>0</span></button></div><button type="button" data-feedback-refresh>{{ $review->trans('ui.refresh') }}</button></div>
    <p data-feedback-load-status role="status" aria-live="polite"></p>
    <div class="feedback-board-list" data-feedback-list></div>
    <footer class="review-panel-footer"><span>{{ $review->trans('ui.show_pins') }} <kbd>⇧ C</kbd></span><button class="feedback-visibility-toggle" type="button" data-feedback-visibility role="switch" aria-checked="true" aria-label="{{ $review->trans('ui.show_pins') }}"><span></span></button></footer>
  </section>
  <div class="feedback-toast" data-feedback-toast role="status" aria-live="polite" hidden></div>
  @include('site-review::partials.text-review', ['review' => $review, 'reviewSession' => $reviewSession])
  @include('site-review::partials.people', ['review' => $review])
</aside>
