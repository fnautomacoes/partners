<?php

declare(strict_types=1);

namespace Core;

class Response
{
    private int $statusCode = 200;
    private array $headers = [];

    public function status(int $code): self
    {
        $this->statusCode = $code;
        return $this;
    }

    public function header(string $name, string $value): self
    {
        $this->headers[$name] = $value;
        return $this;
    }

    public function cookie(
        string $name,
        string $value,
        int $expires = 0,
        string $path = '/',
        bool $httpOnly = true,
        bool $secure = false,
        string $sameSite = 'Strict'
    ): self {
        setcookie($name, $value, [
            'expires' => $expires,
            'path' => $path,
            'httponly' => $httpOnly,
            'secure' => $secure,
            'samesite' => $sameSite,
        ]);
        return $this;
    }

    public function clearCookie(string $name, string $path = '/'): self
    {
        setcookie($name, '', [
            'expires' => time() - 3600,
            'path' => $path,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        return $this;
    }

    public function json(array $data): void
    {
        http_response_code($this->statusCode);
        foreach ($this->headers as $name => $value) {
            header("{$name}: {$value}");
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public function success(mixed $data): void
    {
        $this->json(['success' => true, 'data' => $data]);
    }

    public function error(string $code, string $message, int $status = 400): void
    {
        $this->status($status)->json([
            'success' => false,
            'error' => $code,
            'message' => $message,
        ]);
    }
}
