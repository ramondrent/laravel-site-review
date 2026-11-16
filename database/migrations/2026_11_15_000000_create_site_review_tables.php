<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('feedback_notes')) {
            Schema::create('feedback_notes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('parent_id')->nullable()->constrained('feedback_notes')->nullOnDelete();
                $table->string('page')->index();
                $table->string('section')->nullable();
                $table->string('section_label');
                $table->unsignedSmallInteger('position');
                $table->string('name', 100);
                $table->text('body');
                $table->string('anchor', 2000)->nullable();
                $table->json('anchor_meta')->nullable();
                $table->decimal('pin_x', 7, 4)->nullable();
                $table->decimal('pin_y', 7, 4)->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->string('resolved_by', 100)->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('site_texts')) {
            Schema::create('site_texts', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->text('body');
                $table->unsignedInteger('version')->default(0);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('review_changes')) {
            Schema::create('review_changes', function (Blueprint $table) {
                $table->id();
                $table->string('page');
                $table->string('kind', 40);
                $table->string('target');
                $table->string('name', 100);
                $table->text('before')->nullable();
                $table->text('after')->nullable();
                $table->timestamp('created_at');
                $table->index(['page', 'id']);
            });
        }

        if (! Schema::hasTable('review_sessions')) {
            Schema::create('review_sessions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name', 100);
                $table->string('credential_fingerprint', 64);
                $table->string('page');
                $table->timestamp('first_seen_at');
                $table->timestamp('last_seen_at')->index();
                $table->timestamp('expires_at');
                $table->timestamp('ended_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('review_sessions');
        Schema::dropIfExists('review_changes');
        Schema::dropIfExists('site_texts');
        Schema::dropIfExists('feedback_notes');
    }
};
