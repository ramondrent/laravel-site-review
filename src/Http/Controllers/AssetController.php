<?php

namespace RamonDrent\SiteReview\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use RamonDrent\SiteReview\Services\SiteReview;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AssetController extends Controller
{
    public function __invoke(Request $request, string $file, SiteReview $review): BinaryFileResponse
    {
        abort_unless($review->enabled(), 404);
        abort_unless((bool) preg_match('/^[a-zA-Z0-9_\-\.]+\.(js|css)$/', $file) && ! str_contains($file, '..'), 404);

        $distDir = realpath(__DIR__.'/../../../dist');
        abort_unless($distDir !== false, 404);

        $fullPath = realpath($distDir.DIRECTORY_SEPARATOR.$file);
        abort_unless($fullPath !== false && str_starts_with($fullPath, $distDir.DIRECTORY_SEPARATOR) && is_file($fullPath), 404);

        $contentType = str_ends_with($file, '.css')
            ? 'text/css; charset=UTF-8'
            : 'application/javascript; charset=UTF-8';

        $cacheControl = $request->query('v')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600';

        return response()->file($fullPath, [
            'Content-Type' => $contentType,
            'Cache-Control' => $cacheControl,
        ]);
    }
}
