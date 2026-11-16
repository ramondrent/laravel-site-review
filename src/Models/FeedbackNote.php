<?php

namespace RamonDrent\SiteReview\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class FeedbackNote extends Model
{
    use SoftDeletes;

    protected $table = 'feedback_notes';

    protected $fillable = [
        'parent_id',
        'page',
        'section',
        'section_label',
        'position',
        'name',
        'body',
        'anchor',
        'anchor_meta',
        'pin_x',
        'pin_y',
        'resolved_at',
        'resolved_by',
    ];

    protected function casts(): array
    {
        return [
            'anchor_meta' => 'array',
            'resolved_at' => 'datetime',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('id');
    }
}
