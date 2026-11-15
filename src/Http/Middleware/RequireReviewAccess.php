<?php

namespace RamonDrent\SiteReview\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use RamonDrent\SiteReview\Services\ReviewAccess;
use RamonDrent\SiteReview\Services\SiteReview;
use Symfony\Component\HttpFoundation\Response;

class RequireReviewAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $review = app(SiteReview::class);
        abort_unless($review->enabled(), 404);

        $reviewer = app(ReviewAccess::class)->current($request);
        if (! $reviewer) {
            return response()
                ->json(['message' => $review->trans('errors.unauthenticated')], 401)
                ->header('Cache-Control', 'no-store');
        }

        $request->attributes->set('reviewer', $reviewer);

        return $next($request)->header('Cache-Control', 'no-store, private');
    }
}
