<?php

namespace RamonDrent\SiteReview\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RamonDrent\SiteReview\Services\ReviewAccess;
use RamonDrent\SiteReview\Services\ReviewPages;
use RamonDrent\SiteReview\Services\SiteReview;

class ReviewAccessController extends Controller
{
    public function unlock(Request $request, ReviewAccess $access, ReviewPages $pages, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        abort_unless($access->configured(), 503, $review->trans('errors.not_configured'));

        $request->merge(['name' => is_string($request->input('name')) ? trim($request->input('name')) : $request->input('name')]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string', 'max:256'],
            'page' => $pages->rules(),
        ], [
            'name.required' => $review->trans('validation.name_required'),
            'name.max' => $review->trans('validation.name_max'),
            'password.required' => $review->trans('validation.password_required'),
            'password.max' => $review->trans('validation.password_max'),
        ]);

        if (! Hash::check($data['password'], (string) config('site-review.password_hash'))) {
            return response()->json(['message' => $review->trans('errors.wrong_password')], 422)->header('Cache-Control', 'no-store');
        }

        $id = (string) Str::uuid();
        $previousId = $access->sessionId($request);
        DB::transaction(function () use ($previousId, $access, $data, $id) {
            if ($previousId) {
                DB::table('review_sessions')->where('id', $previousId)->whereNull('ended_at')->update(['ended_at' => now()]);
            }
            DB::table('review_sessions')->insert([
                'id' => $id,
                'name' => $data['name'],
                'credential_fingerprint' => $access->fingerprint(),
                'page' => $data['page'],
                'first_seen_at' => now(),
                'last_seen_at' => now(),
                'expires_at' => now()->addMinutes((int) config('site-review.access_minutes', 43200)),
            ]);
            // Presence is operational context, not a permanent browsing history.
            DB::table('review_sessions')->where('last_seen_at', '<', now()->subDays(30))->delete();
        });

        $request->session()->regenerate(true);
        $request->session()->put('review_session_id', $id);
        $access->flushRequestCache($request);
        Cookie::unqueue(ReviewAccess::COOKIE);

        return response()->json(['message' => $review->trans('messages.unlocked')])
            ->withCookie($access->makeCookie($id))
            ->header('Cache-Control', 'no-store');
    }

    public function lock(Request $request, ReviewAccess $access, SiteReview $review): JsonResponse
    {
        if ($id = $access->sessionId($request)) {
            DB::table('review_sessions')->where('id', $id)->whereNull('ended_at')->update(['ended_at' => now()]);
        }
        $request->session()->forget('review_session_id');
        $request->session()->regenerate(true);
        $access->flushRequestCache($request);
        Cookie::unqueue(ReviewAccess::COOKIE);

        return response()->json(['message' => $review->trans('messages.locked')])
            ->withCookie($access->forgetCookie())
            ->header('Cache-Control', 'no-store');
    }

    public function session(Request $request): JsonResponse
    {
        $reviewer = $request->attributes->get('reviewer');

        return response()->json([
            'name' => $reviewer->name,
            'token' => csrf_token(),
        ])->header('Cache-Control', 'no-store');
    }

    public function updateProfile(Request $request, SiteReview $review): JsonResponse
    {
        $request->merge(['name' => is_string($request->input('name')) ? trim($request->input('name')) : $request->input('name')]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ], [
            'name.required' => $review->trans('validation.name_required'),
            'name.max' => $review->trans('validation.name_max'),
        ]);

        $reviewer = $request->attributes->get('reviewer');
        DB::table('review_sessions')->where('id', $reviewer->id)->update(['name' => $data['name']]);

        return response()->json(['name' => $data['name']])->header('Cache-Control', 'no-store');
    }

    public function heartbeat(Request $request, ReviewPages $pages): JsonResponse
    {
        $data = $request->validate(['page' => $pages->rules()]);
        DB::table('review_sessions')->where('id', $request->attributes->get('reviewer')->id)
            ->update([
                'last_seen_at' => now(),
                'page' => $data['page'],
                'expires_at' => now()->addMinutes((int) config('site-review.access_minutes', 43200)),
            ]);

        return response()->json(['seen_at' => now()->toIso8601String()]);
    }

    public function people(Request $request, ReviewAccess $access): JsonResponse
    {
        $currentId = $request->attributes->get('reviewer')->id;
        $fingerprint = $access->fingerprint();
        $sessions = DB::table('review_sessions')
            ->where('last_seen_at', '>=', now()->subDays(30))
            ->orderByDesc('last_seen_at')
            ->get();

        $isOnline = fn ($session): bool => ! $session->ended_at
            && Carbon::parse($session->expires_at)->isFuture()
            && $session->credential_fingerprint === $fingerprint
            && Carbon::parse($session->last_seen_at)->greaterThan(now()->subSeconds(90));

        $people = $sessions
            ->groupBy(fn ($session) => mb_strtolower(trim($session->name)))
            ->map(function ($group) use ($currentId, $isOnline) {
                $currentSession = $group->first(fn ($session) => $session->id === $currentId);
                $onlineSession = $group->first(fn ($session) => $session->id === $currentId && $isOnline($session))
                    ?? $group->first($isOnline);
                $latest = $group->first();
                $primary = $onlineSession ?? $currentSession ?? $latest;

                return [
                    'name' => trim(($currentSession ?? $latest)->name),
                    'page' => $primary->page,
                    'current' => $currentSession !== null,
                    'last_seen_at' => Carbon::parse($latest->last_seen_at)->toIso8601String(),
                    'online' => $onlineSession !== null,
                ];
            })
            ->values()
            ->take(30);

        return response()->json($people);
    }
}
