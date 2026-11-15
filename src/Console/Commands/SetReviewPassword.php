<?php

namespace RamonDrent\SiteReview\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class SetReviewPassword extends Command
{
    protected $signature = 'review:password {--generate : Generate and display a random shared password}';

    protected $description = 'Set the shared site review password; store only its hash in .env and revoke existing access';

    public function handle(): int
    {
        $password = $this->option('generate')
            ? rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=')
            : $this->secret('New shared review password (at least 12 characters)');

        if (! is_string($password) || strlen($password) < 12 || strlen($password) > 72) {
            $this->error('Use a password between 12 and 72 bytes.');

            return self::FAILURE;
        }

        $path = $this->laravel->environmentFilePath();
        if (! is_file($path) || ! is_writable($path)) {
            $this->error('The application .env file must exist and be writable.');

            return self::FAILURE;
        }

        $hash = Hash::make($password);
        $content = (string) file_get_contents($path);
        $line = "SITE_REVIEW_PASSWORD_HASH='".$hash."'";

        if (preg_match('/^SITE_REVIEW_PASSWORD_HASH=.*$/m', $content)) {
            $content = (string) preg_replace_callback('/^SITE_REVIEW_PASSWORD_HASH=.*$/m', fn () => $line, $content);
        } elseif (preg_match('/^FEEDBACK_PASSWORD_HASH=.*$/m', $content)) {
            $content = (string) preg_replace_callback('/^FEEDBACK_PASSWORD_HASH=.*$/m', fn () => $line, $content);
        } else {
            $content = rtrim($content).PHP_EOL.$line.PHP_EOL;
        }

        if (file_put_contents($path, $content, LOCK_EX) === false) {
            $this->error('The password could not be saved.');

            return self::FAILURE;
        }

        $this->callSilent('config:clear');
        if (Schema::hasTable('review_sessions')) {
            DB::table('review_sessions')->whereNull('ended_at')->update(['ended_at' => now()]);
        }

        $this->info('Review password saved. Existing reviewer access is revoked on the next request.');
        if ($this->option('generate')) {
            $this->line('Shared password: '.$password);
        }
        $this->line('For production: rebuild the configuration cache, reload PHP-FPM, and restart Reverb if live cursors are enabled.');

        return self::SUCCESS;
    }
}
