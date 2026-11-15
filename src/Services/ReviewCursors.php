<?php

namespace RamonDrent\SiteReview\Services;

use Pusher\Pusher;

class ReviewCursors
{
    public function __construct(private ReviewPages $pages) {}

    public function configured(): bool
    {
        return (bool) config('site-review.enabled')
            && (bool) config('site-review.cursors.enabled')
            && class_exists(Pusher::class)
            && (string) config('reverb.apps.apps.0.key') !== ''
            && (string) config('reverb.apps.apps.0.secret') !== '';
    }

    public function channel(string $page): ?string
    {
        $room = $this->pages->roomForPage($page);

        return $room !== null ? 'presence-review-cursors.'.$room : null;
    }
}
