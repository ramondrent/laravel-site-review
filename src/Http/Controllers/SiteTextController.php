<?php

namespace RamonDrent\SiteReview\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use RamonDrent\SiteReview\Services\ReviewPages;
use RamonDrent\SiteReview\Services\SiteCopy;
use RamonDrent\SiteReview\Services\SiteReview;

class SiteTextController extends Controller
{
    public function update(Request $request, string $key, SiteCopy $copy, ReviewPages $pages, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        $definition = $copy->definition($key) ?? $copy->verifyToken($request->input('token'), $key);
        abort_unless($definition !== null, 404);

        $data = $request->validate([
            'page' => $pages->rules(),
            'body' => ['required', 'string', 'max:5000'],
            'version' => ['required', 'integer', 'min:0'],
        ], [
            'body.required' => $review->trans('validation.text_required'),
            'body.max' => $review->trans('validation.text_max'),
        ]);

        abort_unless($definition['page'] === '*' || $definition['page'] === $data['page'], 422);
        $data['name'] = $request->attributes->get('reviewer')->name;

        return DB::transaction(function () use ($key, $definition, $data, $review) {
            DB::table('site_texts')->insertOrIgnore([
                'key' => $key,
                'body' => $definition['text'],
                'version' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $current = DB::table('site_texts')->where('key', $key)->lockForUpdate()->first();
            if ($current->version !== (int) $data['version']) {
                return response()->json([
                    'message' => $review->trans('errors.text_conflict'),
                    'body' => $current->body,
                    'version' => $current->version,
                ], 409)->header('Cache-Control', 'no-store');
            }

            if ($current->body !== $data['body']) {
                DB::table('site_texts')->where('key', $key)->update([
                    'body' => $data['body'],
                    'version' => $current->version + 1,
                    'updated_at' => now(),
                ]);
                DB::table('review_changes')->insert([
                    'page' => $definition['page'],
                    'kind' => 'text_updated',
                    'target' => $key,
                    'name' => $data['name'],
                    'before' => $current->body,
                    'after' => $data['body'],
                    'created_at' => now(),
                ]);
            }

            return response()->json(DB::table('site_texts')->where('key', $key)->first())->header('Cache-Control', 'no-store');
        });
    }

    public function changes(Request $request, ReviewPages $pages, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        $data = $request->validate(['page' => $pages->rules(nullable: true)]);
        $changes = DB::table('review_changes')
            ->when($data['page'] ?? null, fn ($query, $page) => $query->whereIn('page', [$page, '*']))
            ->orderByDesc('id')
            ->paginate(20, ['*'], 'changes_page');

        return response()->json($changes)->header('Cache-Control', 'no-store');
    }
}
