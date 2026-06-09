<?php

declare(strict_types=1);

namespace Services;

use Predis\Client as RedisClient;

class RateLimiter
{
    private RedisClient $redis;
    private int $maxAttempts;
    private int $windowSeconds;

    public function __construct(int $maxAttempts = 10, int $windowSeconds = 900)
    {
        $redisUrl = env('REDIS_URL', 'tcp://127.0.0.1:6379');
        $this->redis = new RedisClient($redisUrl);
        $this->maxAttempts = $maxAttempts;
        $this->windowSeconds = $windowSeconds;
    }

    public function attempt(string $key): bool
    {
        $fullKey = "rate_limit:{$key}";

        $current = (int) $this->redis->get($fullKey);

        if ($current >= $this->maxAttempts) {
            return false;
        }

        $this->redis->incr($fullKey);

        if ($current === 0) {
            $this->redis->expire($fullKey, $this->windowSeconds);
        }

        return true;
    }

    public function remaining(string $key): int
    {
        $fullKey = "rate_limit:{$key}";
        $current = (int) $this->redis->get($fullKey);
        return max(0, $this->maxAttempts - $current);
    }

    public function reset(string $key): void
    {
        $fullKey = "rate_limit:{$key}";
        $this->redis->del([$fullKey]);
    }

    public function isBlocked(string $key): bool
    {
        return $this->remaining($key) === 0;
    }
}
