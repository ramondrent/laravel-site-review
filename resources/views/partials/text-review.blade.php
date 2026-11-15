<div class="review-edit-hint" data-review-hint hidden role="status"><span data-review-hint-text>{{ $review->trans('ui.edit_hint') }}</span><button type="button" data-review-stop aria-label="{{ $review->trans('ui.edit_stop') }}"><kbd>Esc</kbd></button></div>
<dialog class="review-dialog review-editor" data-review-editor aria-labelledby="review-editor-title" data-save-url="{{ preg_replace('/\/__KEY__$/', '', route('site-review.texts.update', ['key' => '__KEY__'], false)) }}">
  <form data-review-form>
    <header class="review-panel-header"><h2 id="review-editor-title">{{ $review->trans('ui.editor_title') }}</h2><button type="button" class="review-icon-button" data-review-close aria-label="{{ $review->trans('ui.editor_close') }}">×</button></header>
    <p class="review-anchor-label" data-review-context></p>
    <label class="feedback-sr-only" for="review-text">{{ $review->trans('ui.editor_label') }}</label>
    <textarea id="review-text" name="body" rows="5" required maxlength="5000"></textarea>
    <p class="review-explanation review-author-row"><span class="review-avatar review-inline-avatar" data-review-avatar aria-hidden="true">?</span><span>{{ $review->trans('ui.posting_as_prefix') }} <strong data-review-name-label>{{ $reviewSession->name }}</strong> {{ $review->trans('ui.editor_saving_note') }}</span></p>
    <p data-review-status role="status" aria-live="polite"></p>
    <div data-review-conflict hidden><p>{{ $review->trans('ui.conflict_heading') }}</p><blockquote data-review-latest></blockquote><button type="button" data-review-reload>{{ $review->trans('ui.conflict_reload') }}</button></div>
    <footer><button type="button" data-review-close>{{ $review->trans('ui.cancel') }}</button><button type="submit" class="review-primary" title="{{ $review->trans('ui.save') }} (⌘/Ctrl + Enter)">{{ $review->trans('ui.save') }} <span aria-hidden="true">↑</span></button></footer>
  </form>
</dialog>
<dialog class="review-dialog review-history" id="review-history" data-review-log aria-labelledby="review-history-title" data-url="{{ route('site-review.changes', [], false) }}">
  <header class="review-panel-header"><div><h2 id="review-history-title">{{ $review->trans('ui.history_title') }}</h2><p>{{ $review->trans('ui.history_subtitle') }}</p></div><button type="button" class="review-icon-button" data-review-log-close aria-label="{{ $review->trans('ui.history_close') }}">×</button></header>
  <div class="review-log-controls"><label class="feedback-sr-only" for="review-scope">{{ $review->trans('ui.history_scope_label') }}</label><select id="review-scope" data-review-scope><option value="all">{{ $review->trans('ui.all_pages') }}</option><option value="page">{{ $review->trans('ui.this_page') }}</option></select><button type="button" data-review-log-refresh>{{ $review->trans('ui.refresh') }}</button></div>
  <p data-review-log-status role="status" aria-live="polite"></p>
  <ol class="review-changes" data-review-changes></ol>
  <button class="review-load-more" type="button" data-review-more hidden>{{ $review->trans('ui.load_more') }}</button>
  <footer class="review-panel-footer">{{ $review->trans('ui.history_footer') }}</footer>
</dialog>
