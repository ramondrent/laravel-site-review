<?php

namespace RamonDrent\SiteReview\Realtime;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Laravel\Reverb\Contracts\Connection;
use Laravel\Reverb\Protocols\Pusher\Channels\PresenceChannel;
use Laravel\Reverb\Protocols\Pusher\Exceptions\ConnectionUnauthorized;
use RamonDrent\SiteReview\Services\ReviewAccess;
use RamonDrent\SiteReview\Services\ReviewCursors;

class ReviewPresenceChannel extends PresenceChannel
{
    private array $grants = [];

    public function subscribe(Connection $connection, ?string $auth = null, ?string $data = null): void
    {
        $this->verify($connection, $auth, $data);
        $info = json_decode((string) $data, true, flags: JSON_THROW_ON_ERROR);
        $grant = json_decode(Crypt::decryptString($info['user_info']['grant']), true, flags: JSON_THROW_ON_ERROR);
        if ($info['user_id'] !== $connection->id() || ! $this->validGrants([$connection->id() => $grant])) {
            throw new ConnectionUnauthorized;
        }
        $this->grants[$connection->id()] = $grant;
        $this->prune();
        parent::subscribe($connection, $auth, $data);
    }

    public function unsubscribe(Connection $connection): void
    {
        unset($this->grants[$connection->id()]);
        parent::unsubscribe($connection);
    }

    public function broadcast(array $payload, ?Connection $except = null): void
    {
        // Re-check both ends before delivery, including sockets left open after logout.
        $this->prune();
        if (($payload['event'] ?? '') !== 'client-cursor' || ! $except || ! $this->find($except)) {
            return;
        }
        $data = $payload['data'] ?? [];
        if (Validator::make($data, [
            'visible' => ['required', 'boolean'],
            'anchor' => ['required_if:visible,true', 'nullable', 'string', 'max:200', 'regex:/^(copy|id):[a-zA-Z0-9_\-:.]+$/'],
            'x' => ['required_if:visible,true', 'numeric', 'between:0,1'],
            'y' => ['required_if:visible,true', 'numeric', 'between:0,1'],
        ])->fails()) {
            return;
        }
        // Never trust names, IDs, HTML, or other fields supplied by the sender.
        $payload['data'] = array_intersect_key($data, array_flip(['visible', 'anchor', 'x', 'y']));
        $payload['data']['id'] = $except->id();
        parent::broadcast($payload, $except);
    }

    public function broadcastInternally(array $payload, ?Connection $except = null): void
    {
        $this->prune();
        parent::broadcast($payload, $except);
    }

    public function data(): array
    {
        $this->prune();

        return parent::data();
    }

    private function validGrants(array $grants): array
    {
        if (! $grants || ! app(ReviewAccess::class)->configured() || ! app(ReviewCursors::class)->configured()) {
            return [];
        }
        $ids = DB::table('review_sessions')->whereIn('id', array_column($grants, 'reviewer'))
            ->whereNull('ended_at')->where('expires_at', '>', now())
            ->where('credential_fingerprint', app(ReviewAccess::class)->fingerprint())->pluck('id')->all();

        return array_filter($grants, fn ($grant) => ($grant['expires'] ?? 0) > now()->timestamp && in_array($grant['reviewer'] ?? null, $ids, true));
    }

    private function prune(): void
    {
        $valid = $this->validGrants($this->grants);
        // Remove all invalid grants first, because presence departures also broadcast.
        $invalid = array_diff_key($this->grants, $valid);
        $this->grants = $valid;
        $removed = [];
        foreach ($invalid as $id => $grant) {
            if ($member = $this->findById($id)) {
                $this->connections->remove($member->connection());
                $removed[] = $member;
            }
        }
        foreach ($removed as $member) {
            $this->broadcastMemberRemoved($member->connection(), $member->data('user_id'));
            $member->connection()->terminate();
        }
    }
}
