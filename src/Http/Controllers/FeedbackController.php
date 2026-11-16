<?php

namespace RamonDrent\SiteReview\Http\Controllers;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RamonDrent\SiteReview\Models\FeedbackNote;
use RamonDrent\SiteReview\Services\ReviewPages;
use RamonDrent\SiteReview\Services\SiteReview;

class FeedbackController extends Controller
{
    public function destroy(Request $request, int $id, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        $name = $request->attributes->get('reviewer')->name;

        DB::transaction(function () use ($id, $name) {
            $note = FeedbackNote::lockForUpdate()->findOrFail($id);
            if ($note->parent_id === null) {
                FeedbackNote::where('parent_id', $note->id)->delete();
            }
            $note->delete();
            DB::table('review_changes')->insert([
                'page' => $note->page,
                'kind' => 'comment_deleted',
                'target' => (string) $note->id,
                'name' => $name,
                'before' => $note->body,
                'after' => null,
                'created_at' => now(),
            ]);
        });

        return response()->json(['message' => $review->trans('messages.comment_deleted')])->header('Cache-Control', 'no-store');
    }

    public function update(Request $request, int $id, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        $name = $request->attributes->get('reviewer')->name;

        if ($request->has('resolved') && ! $request->has('body') && ! $request->has('anchor')) {
            $data = $request->validate([
                'resolved' => ['required', 'boolean'],
            ]);

            $note = DB::transaction(function () use ($id, $data, $name, $review) {
                $note = FeedbackNote::lockForUpdate()->findOrFail($id);
                if ($note->parent_id !== null) {
                    throw ValidationException::withMessages(['resolved' => $review->trans('errors.comment_unavailable')]);
                }

                $wantResolved = (bool) $data['resolved'];
                $currentlyResolved = $note->resolved_at !== null;
                if ($wantResolved !== $currentlyResolved) {
                    $note->update([
                        'resolved_at' => $wantResolved ? now() : null,
                        'resolved_by' => $wantResolved ? $name : null,
                    ]);
                    DB::table('review_changes')->insert([
                        'page' => $note->page,
                        'kind' => $wantResolved ? 'comment_resolved' : 'comment_reopened',
                        'target' => (string) $note->id,
                        'name' => $name,
                        'before' => null,
                        'after' => $note->body,
                        'created_at' => now(),
                    ]);
                }

                return $note->fresh()->load('replies');
            });

            return response()->json($note)->header('Cache-Control', 'no-store');
        }

        if ($request->has('anchor') && ! $request->has('body')) {
            $data = $request->validate($this->locationRules(requireAnchor: true));
            $anchorMeta = $this->cleanAnchorMeta($data['anchor_meta'] ?? null);

            $note = DB::transaction(function () use ($id, $data, $anchorMeta, $name, $review) {
                $note = FeedbackNote::lockForUpdate()->findOrFail($id);
                if ($note->parent_id !== null) {
                    throw ValidationException::withMessages(['anchor' => $review->trans('errors.comment_unavailable')]);
                }

                $previousLabel = $note->section_label;
                $locationPayload = [
                    'section' => $data['section'] ?? null,
                    'section_label' => $data['section_label'],
                    'position' => $data['position'],
                    'anchor' => $data['anchor'],
                    'anchor_meta' => $anchorMeta,
                    'pin_x' => $data['pin_x'],
                    'pin_y' => $data['pin_y'],
                ];

                $note->update($locationPayload);
                FeedbackNote::where('parent_id', $note->id)->update([
                    'section' => $locationPayload['section'],
                    'section_label' => $locationPayload['section_label'],
                    'position' => $locationPayload['position'],
                    'anchor' => $locationPayload['anchor'],
                    'anchor_meta' => $anchorMeta !== null ? json_encode($anchorMeta, JSON_UNESCAPED_UNICODE) : null,
                    'pin_x' => $locationPayload['pin_x'],
                    'pin_y' => $locationPayload['pin_y'],
                ]);

                DB::table('review_changes')->insert([
                    'page' => $note->page,
                    'kind' => 'comment_moved',
                    'target' => (string) $note->id,
                    'name' => $name,
                    'before' => $previousLabel,
                    'after' => $note->section_label,
                    'created_at' => now(),
                ]);

                return $note->fresh()->load('replies');
            });

            return response()->json($note)->header('Cache-Control', 'no-store');
        }

        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
        ], [
            'body.required' => $review->trans('validation.comment_required'),
            'body.max' => $review->trans('validation.comment_max'),
        ]);

        $note = DB::transaction(function () use ($id, $data, $name) {
            $note = FeedbackNote::lockForUpdate()->findOrFail($id);
            $previous = $note->body;
            if ($previous !== $data['body']) {
                $note->update(['body' => $data['body']]);
                DB::table('review_changes')->insert([
                    'page' => $note->page,
                    'kind' => 'comment_updated',
                    'target' => (string) $note->id,
                    'name' => $name,
                    'before' => $previous,
                    'after' => $note->body,
                    'created_at' => now(),
                ]);
            }

            $fresh = $note->fresh();

            return $fresh->parent_id === null ? $fresh->load('replies') : $fresh;
        });

        return response()->json($note)->header('Cache-Control', 'no-store');
    }

    public function index(Request $request, ReviewPages $pages, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        $data = $request->validate(['page' => $pages->rules()]);

        return response()->json(
            FeedbackNote::where('page', $data['page'])
                ->whereNull('parent_id')
                ->with('replies')
                ->latest('id')
                ->paginate(25, ['*'], 'notes_page')
        )->header('Cache-Control', 'no-store');
    }

    public function store(Request $request, ReviewPages $pages, SiteReview $review): JsonResponse
    {
        abort_unless($review->enabled(), 404);
        $reviewerName = $request->attributes->get('reviewer')->name;

        if ($request->input('parent_id') !== null && $request->input('parent_id') !== '') {
            $data = $request->validate([
                'parent_id' => ['required', 'integer', 'min:1'],
                'page' => $pages->rules(nullable: true),
                'body' => ['required', 'string', 'max:5000'],
            ], [
                'body.required' => $review->trans('validation.comment_required'),
                'body.max' => $review->trans('validation.comment_max'),
            ]);

            $note = DB::transaction(function () use ($data, $reviewerName, $review) {
                $target = FeedbackNote::lockForUpdate()->find($data['parent_id']);
                if (! $target) {
                    throw ValidationException::withMessages(['parent_id' => $review->trans('errors.comment_unavailable')]);
                }
                $parent = $target->parent_id ? FeedbackNote::lockForUpdate()->find($target->parent_id) : $target;
                if (! $parent) {
                    throw ValidationException::withMessages(['parent_id' => $review->trans('errors.comment_unavailable')]);
                }
                if (isset($data['page']) && $data['page'] !== $parent->page) {
                    throw ValidationException::withMessages(['page' => $review->trans('errors.page_mismatch')]);
                }

                $note = FeedbackNote::create([
                    'parent_id' => $parent->id,
                    'page' => $parent->page,
                    'section' => $parent->section,
                    'section_label' => $parent->section_label,
                    'position' => $parent->position,
                    'anchor' => $parent->anchor,
                    'anchor_meta' => $parent->anchor_meta,
                    'pin_x' => $parent->pin_x,
                    'pin_y' => $parent->pin_y,
                    'name' => $reviewerName,
                    'body' => $data['body'],
                ]);
                DB::table('review_changes')->insert([
                    'page' => $note->page,
                    'kind' => 'comment_replied',
                    'target' => (string) $note->id,
                    'name' => $note->name,
                    'before' => null,
                    'after' => $note->body,
                    'created_at' => now(),
                ]);

                return $note;
            });

            return response()->json($note, 201)->header('Cache-Control', 'no-store');
        }

        $data = $request->validate(array_merge([
            'page' => $pages->rules(),
            'body' => ['required', 'string', 'max:5000'],
        ], $this->locationRules()), [
            'body.required' => $review->trans('validation.comment_required'),
            'body.max' => $review->trans('validation.comment_max'),
        ]);

        $data['anchor_meta'] = $this->cleanAnchorMeta($data['anchor_meta'] ?? null);
        $data['name'] = $reviewerName;
        $note = DB::transaction(function () use ($data) {
            $note = FeedbackNote::create($data);
            $note->setRelation('replies', collect());
            DB::table('review_changes')->insert([
                'page' => $note->page,
                'kind' => 'comment_created',
                'target' => (string) $note->id,
                'name' => $note->name,
                'before' => null,
                'after' => $note->body,
                'created_at' => now(),
            ]);

            return $note;
        });

        return response()->json($note, 201)->header('Cache-Control', 'no-store');
    }

    /**
     * @return array<string, mixed>
     */
    private function locationRules(bool $requireAnchor = false): array
    {
        return [
            'section' => ['nullable', 'string', 'max:150', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'section_label' => ['required', 'string', 'max:255'],
            'position' => ['required', 'integer', 'between:0,10000'],
            'anchor' => [
                $requireAnchor ? 'required' : 'nullable',
                'string',
                'max:2000',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && ! self::isValidSelector($value)) {
                        $fail("The {$attribute} format is invalid.");
                    }
                },
            ],
            'anchor_meta' => ['nullable', 'array'],
            'anchor_meta.tag' => ['nullable', 'string', 'max:32', 'regex:/^[a-zA-Z][a-zA-Z0-9-]*$/'],
            'anchor_meta.text' => ['nullable', 'string', 'max:300'],
            'anchor_meta.src' => ['nullable', 'string', 'max:300'],
            'pin_x' => ['nullable', 'required_with:anchor', 'numeric', 'between:0,100'],
            'pin_y' => ['nullable', 'required_with:anchor', 'numeric', 'between:0,100'],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $meta
     * @return array<string, string>|null
     */
    private function cleanAnchorMeta(?array $meta): ?array
    {
        if ($meta === null) {
            return null;
        }

        $clean = [];
        foreach (['tag', 'text', 'src'] as $key) {
            if (isset($meta[$key]) && is_string($meta[$key])) {
                $trimmed = trim((string) preg_replace('/\s+/u', ' ', $meta[$key]));
                if ($trimmed !== '') {
                    $clean[$key] = mb_substr($trimmed, 0, $key === 'tag' ? 32 : 300);
                }
            }
        }

        return $clean !== [] ? $clean : null;
    }

    private static function isValidSelector(string $selector): bool
    {
        if ($selector === 'body') {
            return true;
        }

        if ($selector === '' || preg_match('/[\p{Cc}\x{2028}\x{2029}]/u', $selector)) {
            return false;
        }

        $segments = explode(' > ', $selector);
        if (count($segments) > 40) {
            return false;
        }

        foreach ($segments as $segment) {
            $validTag = (bool) preg_match('/^[a-zA-Z][a-zA-Z0-9-]*(?::nth-of-type\(\d{1,4}\))?$/', $segment);
            $validId = (bool) preg_match('/^#[a-zA-Z0-9_:\-.\\\\]{1,150}$/', $segment);
            $validAttr = (bool) preg_match('/^\[data-(?:copy-key|review-target|testid|sector|fragrance)="[^"<>\\\\]{1,200}"\]$/u', $segment);

            if (! $validTag && ! $validId && ! $validAttr) {
                return false;
            }
        }

        return true;
    }
}
