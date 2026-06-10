<?php

declare(strict_types=1);

namespace Services;

class PacoTicketApiService
{
    private string $baseUrl;
    private string $bearerToken;

    private const RECURRENCE_MAP = [
        'MONTHLY' => 'monthly',
        'QUARTERLY' => 'quarterly',
        'SEMIANNUAL' => 'semiannual',
        'ANNUAL' => 'annual',
    ];

    public function __construct()
    {
        $this->baseUrl = getenv('PACOTICKET_API_URL') ?: '';
        $this->bearerToken = getenv('PACOTICKET_BEARER_TOKEN') ?: '';
    }

    public function createCompany(array $data): ?string
    {
        if (!$this->baseUrl || !$this->bearerToken) {
            return null;
        }

        $payload = [
            'name' => $data['companyName'] ?? '',
            'namecomplete' => $data['contactName'] ?? '',
            'email' => $data['email'] ?? '',
            'phone' => $data['phone'] ?? '',
            'pais' => 'BR',
            'indicator' => $data['partnerId'] ?? '',
            'status' => true,
            'dueDate' => isset($data['dueDate']) ? date('Y/m/d', strtotime($data['dueDate'])) : '',
            'recurrence' => self::RECURRENCE_MAP[$data['recurrence'] ?? 'MONTHLY'] ?? 'monthly',
            'password' => $data['password'] ?? '',
            'planId' => $data['pacoticketPlanId'] ?? null,
        ];

        $url = rtrim($this->baseUrl, '/') . '/companies/add';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->bearerToken,
            ],
            CURLOPT_TIMEOUT => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error || $httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        $decoded = json_decode($response, true);
        return $decoded['id'] ?? $decoded['data']['id'] ?? null;
    }

    public function updateCompany(string $pacoticketId, array $data): bool
    {
        if (!$this->baseUrl || !$this->bearerToken) {
            return false;
        }

        $payload = [];

        if (isset($data['companyName'])) {
            $payload['name'] = $data['companyName'];
        }
        if (isset($data['contactName'])) {
            $payload['namecomplete'] = $data['contactName'];
        }
        if (isset($data['email'])) {
            $payload['email'] = $data['email'];
        }
        if (isset($data['phone'])) {
            $payload['phone'] = $data['phone'];
        }
        if (isset($data['dueDate'])) {
            $payload['dueDate'] = date('Y/m/d', strtotime($data['dueDate']));
        }
        if (isset($data['recurrence'])) {
            $payload['recurrence'] = self::RECURRENCE_MAP[$data['recurrence']] ?? 'monthly';
        }

        if (empty($payload)) {
            return true;
        }

        $url = rtrim($this->baseUrl, '/') . '/companies/' . $pacoticketId;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => 'PUT',
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->bearerToken,
            ],
            CURLOPT_TIMEOUT => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        return !$error && $httpCode >= 200 && $httpCode < 300;
    }

    public function listInvoices(): ?array
    {
        if (!$this->baseUrl || !$this->bearerToken) {
            return null;
        }

        $url = rtrim($this->baseUrl, '/') . '/invoices/listar';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->bearerToken,
            ],
            CURLOPT_TIMEOUT => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error || $httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        $decoded = json_decode($response, true);
        return $decoded['data'] ?? $decoded ?? [];
    }
}
