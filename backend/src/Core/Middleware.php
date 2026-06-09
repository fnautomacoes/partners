<?php

declare(strict_types=1);

namespace Core;

use Services\JwtService;

class Middleware
{
    public static function auth(Request $request, Response $response): bool
    {
        $token = $request->cookie('access_token');

        if (!$token) {
            $response->error('UNAUTHORIZED', 'Access token required', 401);
            return false;
        }

        $jwtService = new JwtService();
        $payload = $jwtService->verifyAccessToken($token);

        if (!$payload) {
            $response->error('UNAUTHORIZED', 'Invalid or expired token', 401);
            return false;
        }

        $request->user = [
            'userId' => $payload['userId'] ?? null,
            'email' => $payload['email'] ?? null,
            'role' => $payload['role'] ?? null,
            'partnerId' => $payload['partnerId'] ?? null,
        ];

        return true;
    }

    public static function role(string ...$allowedRoles): callable
    {
        return function (Request $request, Response $response) use ($allowedRoles): bool {
            if (!self::auth($request, $response)) {
                return false;
            }

            $userRole = $request->user['role'] ?? '';

            if (!in_array($userRole, $allowedRoles, true)) {
                $response->error('FORBIDDEN', 'Insufficient permissions', 403);
                return false;
            }

            return true;
        };
    }

    public static function superadmin(Request $request, Response $response): bool
    {
        return self::role('SUPERADMIN')($request, $response);
    }

    public static function partner(Request $request, Response $response): bool
    {
        return self::role('PARTNER', 'SUPERADMIN')($request, $response);
    }
}
