<section class="review-people feedback-board" data-review-people id="review-people" role="dialog" aria-labelledby="review-people-title" hidden>
  <header class="review-panel-header"><div><h2 id="review-people-title">{{ $review->trans('ui.people_title') }}</h2><p>{{ $review->trans('ui.people_subtitle') }}</p></div><button type="button" class="review-icon-button" data-review-people-close aria-label="{{ $review->trans('ui.people_close') }}">×</button></header>
  <p class="review-people-explanation">{{ $review->trans('ui.people_explanation') }}</p>
  <p data-review-people-status role="status" aria-live="polite"></p>
  <div class="review-people-list" data-review-people-list></div>
  @if(app(\RamonDrent\SiteReview\Services\ReviewCursors::class)->configured())
    <div class="review-panel-footer review-cursor-settings"><div><span>{{ $review->trans('ui.cursors_toggle') }}</span><p data-review-cursors-status role="status">{{ $review->trans('ui.cursors_connecting') }}</p></div><button class="feedback-visibility-toggle" type="button" data-review-cursors-toggle role="switch" aria-checked="true" aria-label="{{ $review->trans('ui.cursors_toggle') }}"><span></span></button></div>
  @endif
  <form class="review-rename-form" data-review-profile-form hidden>
    <label class="feedback-sr-only" for="review-profile-name">{{ $review->trans('ui.your_name') }}</label>
    <input id="review-profile-name" name="name" maxlength="100" required autocomplete="name" placeholder="{{ $review->trans('ui.your_name') }}" />
    <button type="submit" class="review-primary">{{ $review->trans('ui.save') }}</button>
    <button type="button" data-review-rename-cancel>{{ $review->trans('ui.cancel') }}</button>
  </form>
  <footer class="review-panel-footer"><span class="review-signed-in-group"><span data-review-signed-in></span><button type="button" class="review-link-button" data-review-rename-toggle>{{ $review->trans('ui.rename_button') }}</button></span><button type="button" data-review-lock>{{ $review->trans('ui.sign_out') }}</button></footer>
</section>
<p class="review-expired feedback-toast" data-review-expired hidden role="alert">{{ $review->trans('ui.session_expired') }} <button type="button" data-review-reauth>{{ $review->trans('ui.sign_in_again') }}</button></p>
