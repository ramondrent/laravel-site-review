<?php

namespace RamonDrent\SiteReview\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Crypt;
use Pusher\Pusher;
use RamonDrent\SiteReview\Services\ReviewCursors;
use RamonDrent\SiteReview\Services\ReviewPages;

class ReviewCursorController extends Controller
{
    public function authorizeChannel(Request $request, ReviewCursors $cursors, ReviewPages $pages): JsonResponse
    {
        abort_unless($cursors->configured(), 404);
        $data = $request->validate([
            'socket_id' => ['required', 'string', 'max:100', 'regex:/^\d+\.\d+$/'],
            'channel_name' => ['required', 'string', 'max:150'],
            'page' => $pages->rules(),
        ]);

        abort_unless($data['channel_name'] === $cursors->channel($data['page']), 403);
        $reviewer = $request->attributes->get('reviewer');
        $app = config('reverb.apps.apps.0');
        $pusher = new Pusher($app['key'], $app['secret'], $app['app_id']);

        // A signed, short lease requires a fresh HTTP session check each minute.
        // The encrypted grant keeps the review session ID out of presence metadata.
        $grant = Crypt::encryptString(json_encode([
            'reviewer' => $reviewer->id,
            'expires' => now()->addSeconds(90)->timestamp,
        ], JSON_THROW_ON_ERROR));

        return response()->json(json_decode($pusher->authorizePresenceChannel(
            $data['channel_name'],
            $data['socket_id'],
            $data['socket_id'],
            ['id' => $data['socket_id'], 'name' => $reviewer->name, 'grant' => $grant],
        ), true));
    }
}
