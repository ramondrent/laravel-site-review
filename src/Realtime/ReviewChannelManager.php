<?php

namespace RamonDrent\SiteReview\Realtime;

use Laravel\Reverb\Events\ChannelCreated;
use Laravel\Reverb\Protocols\Pusher\Channels\Channel;
use Laravel\Reverb\Protocols\Pusher\Exceptions\ConnectionUnauthorized;
use Laravel\Reverb\Protocols\Pusher\Managers\ArrayChannelManager;
use RamonDrent\SiteReview\Services\ReviewPages;

class ReviewChannelManager extends ArrayChannelManager
{
    public function findOrCreate(string $channelName): Channel
    {
        if (! app(ReviewPages::class)->allowsChannel($channelName)) {
            if (config('site-review.cursors.dedicated_reverb', true)) {
                throw new ConnectionUnauthorized;
            }

            return parent::findOrCreate($channelName);
        }

        if ($channel = $this->find($channelName)) {
            return $channel;
        }

        $channel = new ReviewPresenceChannel($channelName);
        $this->applications[$this->application->id()][$channelName] = $channel;
        ChannelCreated::dispatch($channel);

        return $channel;
    }
}
