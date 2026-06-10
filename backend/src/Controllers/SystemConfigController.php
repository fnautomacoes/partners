<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Services\MailService;

class SystemConfigController
{
    private const ALLOWED_KEYS = [
        'businessName', 'appUrl', 'logoLogin', 'logoInternal', 'logoPdf',
        'favicon', 'logoLoginWidth', 'colorBrandPrimary', 'colorBrandHover',
        'colorBrandMist', 'colorAccent', 'colorPartner', 'colorDarkBase',
        'webhookPlanSaved', 'smtpHost', 'smtpPort', 'smtpMode', 'smtpUser',
        'smtpPass', 'smtpFrom', 'pdfMarginTop', 'pdfMarginBottom',
        'pdfMarginLeft', 'pdfMarginRight',
    ];

    private const SMTP_KEYS = ['smtpHost', 'smtpPort', 'smtpMode', 'smtpUser', 'smtpPass', 'smtpFrom'];
    private const PRIVATE_KEYS = ['smtpHost', 'smtpPort', 'smtpMode', 'smtpUser', 'smtpPass', 'smtpFrom', 'apiBaseUrl'];

    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->query('SELECT key, value FROM "SystemConfig"');
        $rows = $stmt->fetchAll();

        $config = [];
        foreach ($rows as $row) {
            if (!in_array($row['key'], self::PRIVATE_KEYS, true)) {
                $config[$row['key']] = $row['value'];
            }
        }

        $response->success($config);
    }

    public function admin(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->query('SELECT key, value, "updatedAt" FROM "SystemConfig"');
        $rows = $stmt->fetchAll();

        $config = [];
        foreach ($rows as $row) {
            $config[$row['key']] = [
                'value' => $row['value'],
                'updatedAt' => $row['updatedAt'],
            ];
        }

        $response->success($config);
    }

    public function update(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $data = $request->body;

        if (empty($data) || !is_array($data)) {
            $response->error('INVALID_INPUT', 'Configuration data required', 400);
            return;
        }

        $updated = 0;
        $ignored = [];

        $stmtUpsert = $pdo->prepare('
            INSERT INTO "SystemConfig" (id, key, value, "updatedAt")
            VALUES (gen_random_uuid(), :key, :value, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()
        ');

        foreach ($data as $key => $value) {
            if (!in_array($key, self::ALLOWED_KEYS, true)) {
                $ignored[] = $key;
                continue;
            }

            $stmtUpsert->execute([
                ':key' => $key,
                ':value' => $value,
            ]);
            $updated++;
        }

        $response->success([
            'updated' => $updated,
            'ignored' => $ignored,
        ]);
    }

    public function testSmtp(Request $request, Response $response): void
    {
        $config = [
            'host' => $request->body['smtpHost'] ?? null,
            'port' => $request->body['smtpPort'] ?? 587,
            'mode' => $request->body['smtpMode'] ?? 'starttls',
            'user' => $request->body['smtpUser'] ?? null,
            'pass' => $request->body['smtpPass'] ?? null,
        ];

        if (empty($config['host'])) {
            $pdo = Database::getInstance();
            $stmt = $pdo->query('SELECT key, value FROM "SystemConfig" WHERE key LIKE \'smtp%\'');
            $rows = $stmt->fetchAll();

            foreach ($rows as $row) {
                $shortKey = lcfirst(str_replace('smtp', '', $row['key']));
                if (isset($config[$shortKey]) && $config[$shortKey] === null) {
                    $config[$shortKey] = $row['value'];
                }
            }
        }

        $mailService = new MailService();
        $result = $mailService->testConnection($config);

        if ($result['success']) {
            $response->success(['message' => $result['message']]);
        } else {
            $response->error('SMTP_ERROR', $result['message'], 400);
        }
    }
}
