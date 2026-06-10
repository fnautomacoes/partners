<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

class ResourcePriceController
{
    public function index(Request $request, Response $response): void
    {
        $role = $request->user['role'] ?? '';

        $pdo = Database::getInstance();

        if ($role === 'SUPERADMIN') {
            $stmt = $pdo->prepare('SELECT * FROM "ResourcePrice" ORDER BY "sortOrder" ASC, key ASC');
        } else {
            $stmt = $pdo->prepare('SELECT * FROM "ResourcePrice" WHERE "isVisible" = true ORDER BY "sortOrder" ASC, key ASC');
        }

        $stmt->execute();
        $resources = $stmt->fetchAll();

        $result = array_map(fn($r) => [
            'id' => $r['id'],
            'key' => $r['key'],
            'label' => $r['label'],
            'price' => (float) $r['price'],
            'setupFee' => (float) $r['setupFee'],
            'isVisible' => (bool) $r['isVisible'],
            'sortOrder' => (int) $r['sortOrder'],
            'updatedAt' => $r['updatedAt'],
        ], $resources);

        $response->success($result);
    }

    public function update(Request $request, Response $response): void
    {
        $resources = $request->body['resources'] ?? [];

        if (!is_array($resources) || empty($resources)) {
            $response->error('INVALID_INPUT', 'Resources array is required', 400);
            return;
        }

        $pdo = Database::getInstance();
        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare('
                UPDATE "ResourcePrice"
                SET price = :price,
                    "setupFee" = :setupFee,
                    "isVisible" = :isVisible,
                    "sortOrder" = :sortOrder,
                    label = :label,
                    "updatedAt" = NOW()
                WHERE key = :key
            ');

            foreach ($resources as $resource) {
                if (!isset($resource['key'])) {
                    continue;
                }

                $checkStmt = $pdo->prepare('SELECT id FROM "ResourcePrice" WHERE key = :key');
                $checkStmt->execute([':key' => $resource['key']]);
                if (!$checkStmt->fetch()) {
                    continue;
                }

                $stmt->execute([
                    ':key' => $resource['key'],
                    ':label' => $resource['label'] ?? $resource['key'],
                    ':price' => (float) ($resource['price'] ?? 0),
                    ':setupFee' => (float) ($resource['setupFee'] ?? 0),
                    ':isVisible' => isset($resource['isVisible']) ? ($resource['isVisible'] ? 'true' : 'false') : 'true',
                    ':sortOrder' => (int) ($resource['sortOrder'] ?? 0),
                ]);
            }

            $pdo->commit();
            $response->success(['message' => 'Resource prices updated successfully']);
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to update resource prices', 500);
        }
    }
}
