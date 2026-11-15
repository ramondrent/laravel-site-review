<?php

namespace RamonDrent\SiteReview\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use RamonDrent\SiteReview\Services\SiteReview;
use Symfony\Component\HttpFoundation\Response;

class PreventReviewCaching
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $request->routeIs('site-review.asset') && app(SiteReview::class)->enabled()) {
            $response->headers->set('Cache-Control', 'no-store, private');
        }

        return $response;
    }
}
