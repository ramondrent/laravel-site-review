<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('feedback_notes')) {
            return;
        }

        Schema::table('feedback_notes', function (Blueprint $table) {
            if (! Schema::hasColumn('feedback_notes', 'anchor_meta')) {
                $table->json('anchor_meta')->nullable()->after('anchor');
            }
            if (! Schema::hasColumn('feedback_notes', 'resolved_at')) {
                $table->timestamp('resolved_at')->nullable()->after('pin_y');
            }
            if (! Schema::hasColumn('feedback_notes', 'resolved_by')) {
                $table->string('resolved_by', 100)->nullable()->after('resolved_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('feedback_notes')) {
            return;
        }

        $columns = array_values(array_filter(
            ['anchor_meta', 'resolved_at', 'resolved_by'],
            fn (string $column) => Schema::hasColumn('feedback_notes', $column),
        ));

        if ($columns !== []) {
            Schema::table('feedback_notes', function (Blueprint $table) use ($columns) {
                $table->dropColumn($columns);
            });
        }
    }
};
