<?php

declare(strict_types=1);

namespace Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Core\Response;

class JwtService
{
    private string $secret;
    private string $refreshSecret;
    private int $accessExpiry;
    private int $refreshExpiry;
    private bool $isProduction;

    public function __construct()
    {
        $this->secret = env('JWT_SECRET', '');
        $this->refreshSecret = env('JWT_REFRESH_SECRET', '');
        $this->accessExpiry = (int) env('JWT_EXPIRES_IN', 28800);
        $this->refreshExpiry = (int) env('JWT_REFRESH_EXPIRES_IN', 604800);
        $this->isProduction = env('APP_ENV', 'development') === 'production';
    }

    public function generateAccessToken(array $payload): string
    {
        $payload['iat'] = time();
        $payload['exp'] = time() + $this->accessExpiry;
        $payload['type'] = 'access';

        return JWT::encode($payload, $this->secret, 'HS256');
    }

    public function generateRefreshToken(array $payload): string
    {
        $payload['iat'] = time();
        $payload['exp'] = time() + $this->refreshExpiry;
        $payload['type'] = 'refresh';

        return JWT::encode($payload, $this->refreshSecret, 'HS256');
    }

    public function verifyAccessToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->secret, 'HS256'));
            $payload = (array) $decoded;

            if (($payload['type'] ?? '') !== 'access') {
                return null;
            }

            return $payload;
        } catch (\Exception $e) {
            return null;
        }
    }

    public function verifyRefreshToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->refreshSecret, 'HS256'));
            $payload = (array) $decoded;

            if (($payload['type'] ?? '') !== 'refresh') {
                return null;
            }

            return $payload;
        } catch (\Exception $e) {
            return null;
        }
    }

    public function setAccessCookie(Response $response, string $token): void
    {
        $response->cookie(
            'access_token',
            $token,
            time() + $this->accessExpiry,
            '/',
            true,
            $this->isProduction,
            'Strict'
        );
    }

    public function setRefreshCookie(Response $response, string $token): void
    {
        $response->cookie(
            'refresh_token',
            $token,
            time() + $this->refreshExpiry,
            '/',
            true,
            $this->isProduction,
            'Strict'
        );
    }

    public function clearAuthCookies(Response $response): void
    {
        $response->clearCookie('access_token');
        $response->clearCookie('refresh_token');
    }

    public function getRefreshExpiry(): int
    {
        return $this->refreshExpiry;
    }
}
