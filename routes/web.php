<?php

use Illuminate\Support\Facades\Route;
use RamonDrent\SiteReview\Http\Controllers\AssetController;
use RamonDrent\SiteReview\Http\Controllers\FeedbackController;
use RamonDrent\SiteReview\Http\Controllers\ReviewAccessController;
use RamonDrent\SiteReview\Http\Controllers\ReviewCursorController;
use RamonDrent\SiteReview\Http\Controllers\SiteTextController;
use RamonDrent\SiteReview\Http\Middleware\RequireReviewAccess;

$prefix = trim((string) config('site-review.route_prefix', 'review'), '/');

Route::prefix($prefix)->group(function () {
    Route::get('/assets/{file}', AssetController::class)
        ->where('file', '[a-zA-Z0-9_\-\.]+\.(js|css)')
        ->name('site-review.asset');
});

Route::prefix($prefix)
    ->middleware((array) config('site-review.middleware', ['web']))
    ->group(function () {
        Route::post('/unlock', [ReviewAccessController::class, 'unlock'])
            ->middleware('throttle:5,1,review.unlock')
            ->name('site-review.unlock');

        Route::post('/lock', [ReviewAccessController::class, 'lock'])
            ->middleware('throttle:10,1,review.lock')
            ->name('site-review.lock');

        Route::middleware(RequireReviewAccess::class)->group(function () {
            Route::get('/session', [ReviewAccessController::class, 'session'])
                ->middleware('throttle:60,1,review.session')
                ->name('site-review.session');

            Route::patch('/profile', [ReviewAccessController::class, 'updateProfile'])
                ->middleware('throttle:20,1,review.profile')
                ->name('site-review.profile');

            Route::post('/cursors/auth', [ReviewCursorController::class, 'authorizeChannel'])
                ->middleware('throttle:60,1,review.cursors.auth')
                ->name('site-review.cursors.auth');

            Route::patch('/texts/{key}', [SiteTextController::class, 'update'])
                ->middleware('throttle:30,1,review.texts.update')
                ->name('site-review.texts.update');

            Route::get('/changes', [SiteTextController::class, 'changes'])
                ->middleware('throttle:60,1,review.changes')
                ->name('site-review.changes');

            Route::get('/people', [ReviewAccessController::class, 'people'])
                ->middleware('throttle:60,1,review.people')
                ->name('site-review.people');

            Route::post('/heartbeat', [ReviewAccessController::class, 'heartbeat'])
                ->middleware('throttle:30,1,review.heartbeat')
                ->name('site-review.heartbeat');

            Route::get('/comments', [FeedbackController::class, 'index'])
                ->middleware('throttle:60,1,feedback.index')
                ->name('site-review.comments.index');

            Route::post('/comments', [FeedbackController::class, 'store'])
                ->middleware('throttle:10,1,feedback.store')
                ->name('site-review.comments.store');

            Route::patch('/comments/{id}', [FeedbackController::class, 'update'])
                ->whereNumber('id')
                ->middleware('throttle:20,1,feedback.update')
                ->name('site-review.comments.update');

            Route::delete('/comments/{id}', [FeedbackController::class, 'destroy'])
                ->whereNumber('id')
                ->middleware('throttle:20,1,feedback.destroy')
                ->name('site-review.comments.destroy');
        });
    });
