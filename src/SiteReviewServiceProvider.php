<?php

namespace RamonDrent\SiteReview;

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;
use Laravel\Reverb\Protocols\Pusher\Contracts\ChannelManager;
use RamonDrent\SiteReview\Console\Commands\SetReviewPassword;
use RamonDrent\SiteReview\Http\Middleware\PreventReviewCaching;
use RamonDrent\SiteReview\Http\Middleware\RequireReviewAccess;
use RamonDrent\SiteReview\Realtime\ReviewChannelManager;
use RamonDrent\SiteReview\Services\ReviewAccess;
use RamonDrent\SiteReview\Services\ReviewCursors;
use RamonDrent\SiteReview\Services\ReviewPages;
use RamonDrent\SiteReview\Services\SiteCopy;
use RamonDrent\SiteReview\Services\SiteReview;

class SiteReviewServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/site-review.php', 'site-review');

        $this->app->singleton(SiteReview::class);
        $this->app->singleton(ReviewPages::class);
        $this->app->singleton(ReviewAccess::class);
        $this->app->singleton(ReviewCursors::class);
        $this->app->scoped(SiteCopy::class);

        if (interface_exists(ChannelManager::class)) {
            $this->app->singleton(
                ChannelManager::class,
                ReviewChannelManager::class,
            );
        }
    }

    public function boot(Router $router): void
    {
        $this->loadTranslationsFrom(__DIR__.'/../lang', 'site-review');
        $this->loadViewsFrom(__DIR__.'/../resources/views', 'site-review');
        Blade::anonymousComponentPath(__DIR__.'/../resources/views/components', 'review');

        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');
        $this->loadRoutesFrom(__DIR__.'/../routes/web.php');

        $router->aliasMiddleware('site-review.nocache', PreventReviewCaching::class);
        $router->aliasMiddleware('site-review.auth', RequireReviewAccess::class);

        if (config('site-review.prevent_caching', true) && $this->app->bound(Kernel::class)) {
            $kernel = $this->app->make(Kernel::class);
            if (method_exists($kernel, 'prependMiddlewareToGroup')) {
                $kernel->prependMiddlewareToGroup('web', PreventReviewCaching::class);
            }
        }

        View::composer('*', function ($view) {
            if (! array_key_exists('siteCopy', $view->getData())) {
                $view->with('siteCopy', app(SiteCopy::class));
            }
        });

        if ($this->app->runningInConsole()) {
            $this->commands([SetReviewPassword::class]);

            $this->publishes([
                __DIR__.'/../config/site-review.php' => config_path('site-review.php'),
            ], 'site-review-config');

            $this->publishes([
                __DIR__.'/../lang' => $this->app->langPath('vendor/site-review'),
            ], 'site-review-lang');

            $this->publishes([
                __DIR__.'/../resources/views' => resource_path('views/vendor/site-review'),
            ], 'site-review-views');

            $this->publishes([
                __DIR__.'/../database/migrations' => database_path('migrations'),
            ], 'site-review-migrations');
        }
    }
}
