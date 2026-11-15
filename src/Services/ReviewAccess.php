<?php

namespace RamonDrent\SiteReview\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use stdClass;
use Symfony\Component\HttpFoundation\Cookie as HttpCookie;

class ReviewAccess
{
    public const COOKIE = 'review_grant';

    public function configured(): bool
    {
        return (bool) config('site-review.enabled') && (string) config('site-review.password_hash') !== '';
    }

    public function fingerprint(): string
    {
        return hash_hmac('sha256', (string) config('site-review.password_hash'), (string) config('app.key'));
    }

    public function sessionId(Request $request): ?string
    {
        if ($request->hasSession() && $request->session()->exists('review_session_id')) {
            $id = $request->session()->get('review_session_id');

            return is_string($id) && $id !== '' ? $id : null;
        }

        $cookie = $request->cookie(self::COOKIE);

        return is_string($cookie) && $cookie !== '' ? $cookie : null;
    }

    public function current(Request $request): ?stdClass
    {
        if (! $this->configured()) {
            return null;
        }

        if ($request->attributes->has('site-review.current-checked')) {
            return $request->attributes->get('site-review.current-session');
        }

        $id = $this->sessionId($request);
        if (! $id) {
            $request->attributes->set('site-review.current-checked', true);
            $request->attributes->set('site-review.current-session', null);

            return null;
        }

        $session = DB::table('review_sessions')->where('id', $id)
            ->where('credential_fingerprint', $this->fingerprint())
            ->whereNull('ended_at')->where('expires_at', '>', now())->first();

        if (! $session) {
            $request->attributes->set('site-review.current-checked', true);
            $request->attributes->set('site-review.current-session', null);

            return null;
        }

        if ($request->hasSession() && $request->session()->get('review_session_id') !== $session->id) {
            $request->session()->put('review_session_id', $session->id);
        }

        $minutes = (int) config('site-review.access_minutes', 43200);
        if ($minutes > 60 && Carbon::parse($session->expires_at)->lessThan(now()->addMinutes($minutes - 60))) {
            $expiresAt = now()->addMinutes($minutes);
            DB::table('review_sessions')->where('id', $session->id)->update(['expires_at' => $expiresAt]);
            $session->expires_at = $expiresAt->toDateTimeString();
            Cookie::queue($this->makeCookie($session->id));
        }

        $request->attributes->set('site-review.current-checked', true);
        $request->attributes->set('site-review.current-session', $session);

        return $session;
    }

    public function flushRequestCache(?Request $request = null): void
    {
        $target = $request ?? request();
        $target->attributes->remove('site-review.current-checked');
        $target->attributes->remove('site-review.current-session');
    }

    public function makeCookie(string $id): HttpCookie
    {
        return cookie(
            self::COOKIE,
            $id,
            (int) config('site-review.access_minutes', 43200),
            config('session.path', '/'),
            config('session.domain'),
            config('session.secure'),
            true,
            false,
            config('session.same_site', 'lax'),
        );
    }

    public function forgetCookie(): HttpCookie
    {
        return Cookie::forget(self::COOKIE, config('session.path', '/'), config('session.domain'));
    }
}
