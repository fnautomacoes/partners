<?php

declare(strict_types=1);

namespace Helpers;

class Crypto
{
    public static function sha256(string $data): string
    {
        return hash('sha256', $data);
    }

    public static function randomHex(int $length = 32): string
    {
        return bin2hex(random_bytes($length));
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }
}
