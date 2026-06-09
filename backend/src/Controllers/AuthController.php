<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Helpers\Crypto;
use Services\JwtService;
use Services\RateLimiter;
use Services\MailService;

class AuthController
{
    private JwtService $jwtService;

    public function __construct()
    {
        $this->jwtService = new JwtService();
    }

    public function login(Request $request, Response $response): void
    {
        $rateLimiter = new RateLimiter(10, 900);
        $ip = $request->ip();

        if (!$rateLimiter->attempt("login:{$ip}")) {
            $response->error('RATE_LIMITED', 'Too many login attempts. Try again later.', 429);
            return;
        }

        $email = $request->body['email'] ?? '';
        $password = $request->body['password'] ?? '';

        if (!$email || !$password) {
            $response->error('INVALID_INPUT', 'Email and password are required', 400);
            return;
        }

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT u.id, u.email, u."passwordHash", u.role, p.id as "partnerId", p.status as "partnerStatus"
            FROM "User" u
            LEFT JOIN "Partner" p ON p."userId" = u.id
            WHERE u.email = :email
        ');
        $stmt->execute([':email' => strtolower(trim($email))]);
        $user = $stmt->fetch();

        if (!$user || !Crypto::verifyPassword($password, $user['passwordHash'])) {
            $response->error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
            return;
        }

        if ($user['role'] === 'PARTNER' && $user['partnerStatus'] === 'INACTIVE') {
            $response->error('ACCOUNT_INACTIVE', 'Your account has been deactivated', 401);
            return;
        }

        $rateLimiter->reset("login:{$ip}");

        $payload = [
            'userId' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'partnerId' => $user['partnerId'],
        ];

        $accessToken = $this->jwtService->generateAccessToken($payload);
        $refreshToken = $this->jwtService->generateRefreshToken($payload);

        $refreshHash = Crypto::sha256($refreshToken);
        $expiresAt = date('Y-m-d H:i:s', time() + $this->jwtService->getRefreshExpiry());

        $stmt = $pdo->prepare('
            INSERT INTO "RefreshToken" ("userId", "tokenHash", "expiresAt")
            VALUES (:userId, :tokenHash, :expiresAt)
        ');
        $stmt->execute([
            ':userId' => $user['id'],
            ':tokenHash' => $refreshHash,
            ':expiresAt' => $expiresAt,
        ]);

        $this->jwtService->setAccessCookie($response, $accessToken);
        $this->jwtService->setRefreshCookie($response, $refreshToken);

        $response->success([
            'userId' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'partnerId' => $user['partnerId'],
        ]);
    }

    public function me(Request $request, Response $response): void
    {
        $response->success([
            'userId' => $request->user['userId'],
            'email' => $request->user['email'],
            'role' => $request->user['role'],
            'partnerId' => $request->user['partnerId'],
        ]);
    }

    public function refresh(Request $request, Response $response): void
    {
        $refreshToken = $request->cookie('refresh_token');

        if (!$refreshToken) {
            $response->error('UNAUTHORIZED', 'Refresh token required', 401);
            return;
        }

        $payload = $this->jwtService->verifyRefreshToken($refreshToken);

        if (!$payload) {
            $this->jwtService->clearAuthCookies($response);
            $response->error('UNAUTHORIZED', 'Invalid or expired refresh token', 401);
            return;
        }

        $pdo = Database::getInstance();
        $tokenHash = Crypto::sha256($refreshToken);

        $stmt = $pdo->prepare('
            SELECT id, "userId" FROM "RefreshToken"
            WHERE "tokenHash" = :tokenHash AND "expiresAt" > NOW()
        ');
        $stmt->execute([':tokenHash' => $tokenHash]);
        $storedToken = $stmt->fetch();

        if (!$storedToken) {
            $this->jwtService->clearAuthCookies($response);
            $response->error('UNAUTHORIZED', 'Token reuse detected or expired', 401);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM "RefreshToken" WHERE id = :id');
        $stmt->execute([':id' => $storedToken['id']]);

        $stmt = $pdo->prepare('
            SELECT u.id, u.email, u.role, p.id as "partnerId"
            FROM "User" u
            LEFT JOIN "Partner" p ON p."userId" = u.id
            WHERE u.id = :userId
        ');
        $stmt->execute([':userId' => $storedToken['userId']]);
        $user = $stmt->fetch();

        if (!$user) {
            $this->jwtService->clearAuthCookies($response);
            $response->error('UNAUTHORIZED', 'User not found', 401);
            return;
        }

        $newPayload = [
            'userId' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'partnerId' => $user['partnerId'],
        ];

        $newAccessToken = $this->jwtService->generateAccessToken($newPayload);
        $newRefreshToken = $this->jwtService->generateRefreshToken($newPayload);

        $newRefreshHash = Crypto::sha256($newRefreshToken);
        $expiresAt = date('Y-m-d H:i:s', time() + $this->jwtService->getRefreshExpiry());

        $stmt = $pdo->prepare('
            INSERT INTO "RefreshToken" ("userId", "tokenHash", "expiresAt")
            VALUES (:userId, :tokenHash, :expiresAt)
        ');
        $stmt->execute([
            ':userId' => $user['id'],
            ':tokenHash' => $newRefreshHash,
            ':expiresAt' => $expiresAt,
        ]);

        $this->jwtService->setAccessCookie($response, $newAccessToken);
        $this->jwtService->setRefreshCookie($response, $newRefreshToken);

        $response->success([
            'userId' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
            'partnerId' => $user['partnerId'],
        ]);
    }

    public function logout(Request $request, Response $response): void
    {
        $refreshToken = $request->cookie('refresh_token');

        if ($refreshToken) {
            $pdo = Database::getInstance();
            $tokenHash = Crypto::sha256($refreshToken);

            $stmt = $pdo->prepare('DELETE FROM "RefreshToken" WHERE "tokenHash" = :tokenHash');
            $stmt->execute([':tokenHash' => $tokenHash]);
        }

        $this->jwtService->clearAuthCookies($response);
        $response->success(['message' => 'Logged out successfully']);
    }

    public function changePassword(Request $request, Response $response): void
    {
        $currentPassword = $request->body['currentPassword'] ?? '';
        $newPassword = $request->body['newPassword'] ?? '';

        if (!$currentPassword || !$newPassword) {
            $response->error('INVALID_INPUT', 'Current and new password are required', 400);
            return;
        }

        if (strlen($newPassword) < 8) {
            $response->error('INVALID_INPUT', 'Password must be at least 8 characters', 400);
            return;
        }

        $pdo = Database::getInstance();
        $userId = $request->user['userId'];

        $stmt = $pdo->prepare('SELECT "passwordHash" FROM "User" WHERE id = :id');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();

        if (!$user || !Crypto::verifyPassword($currentPassword, $user['passwordHash'])) {
            $response->error('INVALID_CREDENTIALS', 'Current password is incorrect', 401);
            return;
        }

        $newHash = Crypto::hashPassword($newPassword);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('UPDATE "User" SET "passwordHash" = :hash, "updatedAt" = NOW() WHERE id = :id');
            $stmt->execute([':hash' => $newHash, ':id' => $userId]);

            $stmt = $pdo->prepare('DELETE FROM "RefreshToken" WHERE "userId" = :userId');
            $stmt->execute([':userId' => $userId]);

            $pdo->commit();
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to update password', 500);
            return;
        }

        $this->jwtService->clearAuthCookies($response);
        $response->success(['message' => 'Password changed. Please log in again.']);
    }

    public function forgotPassword(Request $request, Response $response): void
    {
        $email = $request->body['email'] ?? '';

        $response->success(['message' => 'If the email exists, a reset link will be sent.']);

        if (!$email) {
            return;
        }

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, email FROM "User" WHERE email = :email');
        $stmt->execute([':email' => strtolower(trim($email))]);
        $user = $stmt->fetch();

        if (!$user) {
            return;
        }

        $rawToken = Crypto::randomHex(32);
        $tokenHash = Crypto::sha256($rawToken);
        $expiresAt = date('Y-m-d H:i:s', time() + 900);

        $stmt = $pdo->prepare('
            INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt")
            VALUES (:userId, :tokenHash, :expiresAt)
        ');
        $stmt->execute([
            ':userId' => $user['id'],
            ':tokenHash' => $tokenHash,
            ':expiresAt' => $expiresAt,
        ]);

        $appUrl = env('APP_URL', 'http://localhost');
        $resetLink = "{$appUrl}/reset-password.html?token={$rawToken}";

        try {
            $mailService = new MailService();
            $mailService->send(
                $user['email'],
                'Redefinição de Senha - PacoTicket Parceiros',
                "<p>Clique no link abaixo para redefinir sua senha:</p><p><a href=\"{$resetLink}\">{$resetLink}</a></p><p>Este link expira em 15 minutos.</p>"
            );
        } catch (\Exception $e) {
            // Email failure does not cancel the operation (FR-009 + P10)
        }
    }

    public function resetPassword(Request $request, Response $response): void
    {
        $token = $request->body['token'] ?? '';
        $newPassword = $request->body['newPassword'] ?? '';

        if (!$token || !$newPassword) {
            $response->error('INVALID_INPUT', 'Token and new password are required', 400);
            return;
        }

        if (strlen($newPassword) < 8) {
            $response->error('INVALID_INPUT', 'Password must be at least 8 characters', 400);
            return;
        }

        $pdo = Database::getInstance();
        $tokenHash = Crypto::sha256($token);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('
                SELECT id, "userId" FROM "PasswordResetToken"
                WHERE "tokenHash" = :tokenHash
                  AND "expiresAt" > NOW()
                  AND "usedAt" IS NULL
                FOR UPDATE
            ');
            $stmt->execute([':tokenHash' => $tokenHash]);
            $resetToken = $stmt->fetch();

            if (!$resetToken) {
                $pdo->rollBack();
                $response->error('INVALID_TOKEN', 'Token is invalid, expired, or already used', 400);
                return;
            }

            $stmt = $pdo->prepare('UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE id = :id');
            $stmt->execute([':id' => $resetToken['id']]);

            $newHash = Crypto::hashPassword($newPassword);
            $stmt = $pdo->prepare('UPDATE "User" SET "passwordHash" = :hash, "updatedAt" = NOW() WHERE id = :id');
            $stmt->execute([':hash' => $newHash, ':id' => $resetToken['userId']]);

            $stmt = $pdo->prepare('DELETE FROM "RefreshToken" WHERE "userId" = :userId');
            $stmt->execute([':userId' => $resetToken['userId']]);

            $pdo->commit();
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to reset password', 500);
            return;
        }

        $response->success(['message' => 'Password reset successfully. Please log in.']);
    }
}
