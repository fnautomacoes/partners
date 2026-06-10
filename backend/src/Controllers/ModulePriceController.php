<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

class ModulePriceController
{
    public function index(Request $request, Response $response): void
    {
        $role = $request->user['role'] ?? '';

        $pdo = Database::getInstance();

        if ($role === 'SUPERADMIN') {
            $stmt = $pdo->prepare('SELECT * FROM "ModulePrice" ORDER BY "moduleKey" ASC');
        } else {
            $stmt = $pdo->prepare('SELECT * FROM "ModulePrice" WHERE "isVisible" = true ORDER BY "moduleKey" ASC');
        }

        $stmt->execute();
        $modules = $stmt->fetchAll();

        $result = array_map(fn($m) => [
            'id' => $m['id'],
            'moduleKey' => $m['moduleKey'],
            'label' => $m['label'],
            'price' => (float) $m['price'],
            'setupFee' => (float) $m['setupFee'],
            'isVisible' => (bool) $m['isVisible'],
            'description' => $m['description'],
            'updatedAt' => $m['updatedAt'],
        ], $modules);

        $response->success($result);
    }

    public function upsert(Request $request, Response $response): void
    {
        $modules = $request->body['modules'] ?? [];

        if (!is_array($modules) || empty($modules)) {
            $response->error('INVALID_INPUT', 'Modules array is required', 400);
            return;
        }

        $pdo = Database::getInstance();
        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare('
                INSERT INTO "ModulePrice" (id, "moduleKey", label, price, "setupFee", "isVisible", description, "updatedAt")
                VALUES (gen_random_uuid(), :moduleKey, :label, :price, :setupFee, :isVisible, :description, NOW())
                ON CONFLICT ("moduleKey") DO UPDATE SET
                    label = EXCLUDED.label,
                    price = EXCLUDED.price,
                    "setupFee" = EXCLUDED."setupFee",
                    "isVisible" = EXCLUDED."isVisible",
                    description = EXCLUDED.description,
                    "updatedAt" = NOW()
            ');

            foreach ($modules as $module) {
                if (!isset($module['moduleKey']) || !isset($module['label'])) {
                    continue;
                }
                $stmt->execute([
                    ':moduleKey' => $module['moduleKey'],
                    ':label' => $module['label'],
                    ':price' => (float) ($module['price'] ?? 0),
                    ':setupFee' => (float) ($module['setupFee'] ?? 0),
                    ':isVisible' => isset($module['isVisible']) ? ($module['isVisible'] ? 'true' : 'false') : 'true',
                    ':description' => $module['description'] ?? null,
                ]);
            }

            $pdo->commit();
            $response->success(['message' => 'Module prices updated successfully']);
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to update module prices', 500);
        }
    }

    public function destroy(Request $request, Response $response): void
    {
        $moduleKey = $request->params['moduleKey'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id FROM "ModulePrice" WHERE "moduleKey" = :moduleKey');
        $stmt->execute([':moduleKey' => $moduleKey]);
        $module = $stmt->fetch();

        if (!$module) {
            $response->error('NOT_FOUND', 'Module not found', 404);
            return;
        }

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM "PlanAddon" WHERE "addonType" = :type AND key = :key');
        $stmt->execute([':type' => 'MODULE', ':key' => $moduleKey]);
        $inUse = (int) $stmt->fetchColumn() > 0;

        if ($inUse) {
            $stmt = $pdo->prepare('UPDATE "ModulePrice" SET "isVisible" = false, "updatedAt" = NOW() WHERE "moduleKey" = :moduleKey');
            $stmt->execute([':moduleKey' => $moduleKey]);
            $response->success(['message' => 'Module hidden (in use by plans)', 'action' => 'hidden']);
        } else {
            $stmt = $pdo->prepare('DELETE FROM "ModulePrice" WHERE "moduleKey" = :moduleKey');
            $stmt->execute([':moduleKey' => $moduleKey]);
            $response->success(['message' => 'Module deleted successfully', 'action' => 'deleted']);
        }
    }
}
