import '../css/site-review.css';
import { initFeedback } from './feedback';
import { initTextReview } from './text-review';
import { initReviewAccess } from './review-access';
import { initReviewCursors } from './review-cursors';

if (!window.__siteReviewInitialized) {
  window.__siteReviewInitialized = true;
  initFeedback();
  initTextReview();
  initReviewAccess();
  initReviewCursors();
}
