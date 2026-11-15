<?php

namespace RamonDrent\SiteReview\Http\Controllers;

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
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
        ], [
            'body.required' => $review->trans('validation.comment_required'),
            'body.max' => $review->trans('validation.comment_max'),
        ]);

        $name = $request->attributes->get('reviewer')->name;
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

        $data = $request->validate([
            'page' => $pages->rules(),
            'section' => ['nullable', 'string', 'max:150', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'section_label' => ['required', 'string', 'max:255'],
            'position' => ['required', 'integer', 'between:0,10000'],
            'body' => ['required', 'string', 'max:5000'],
            'anchor' => ['nullable', 'string', 'max:2000', 'regex:/^[a-zA-Z0-9 >:()_-]+$/'],
            'pin_x' => ['nullable', 'required_with:anchor', 'numeric', 'between:0,100'],
            'pin_y' => ['nullable', 'required_with:anchor', 'numeric', 'between:0,100'],
        ], [
            'body.required' => $review->trans('validation.comment_required'),
            'body.max' => $review->trans('validation.comment_max'),
        ]);

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
}
