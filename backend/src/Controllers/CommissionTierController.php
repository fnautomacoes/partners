<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

class CommissionTierController
{
    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->query('SELECT * FROM "CommissionTier" ORDER BY "order" ASC');
        $tiers = $stmt->fetchAll();

        $result = array_map(fn($t) => $this->formatTier($t), $tiers);
        $response->success($result);
    }

    public function store(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $name = trim($request->body['name'] ?? '');
        if (!$name) {
            $response->error('INVALID_INPUT', 'Tier name is required', 400);
            return;
        }

        $percentage = (float) ($request->body['percentage'] ?? 0);
        if ($percentage < 0 || $percentage > 100) {
            $response->error('INVALID_INPUT', 'Percentage must be between 0 and 100', 400);
            return;
        }

        $setupCommissionPct = (float) ($request->body['setupCommissionPct'] ?? 0);
        if ($setupCommissionPct < 0 || $setupCommissionPct > 100) {
            $response->error('INVALID_INPUT', 'Setup commission percentage must be between 0 and 100', 400);
            return;
        }

        $stmt = $pdo->prepare('
            INSERT INTO "CommissionTier" (
                id, name, "minClients", "maxClients", percentage, "supportMode", notes,
                "durationMonths", "isActive", "order", "acceptNewClients", "commissionOnSetup", "setupCommissionPct"
            ) VALUES (
                gen_random_uuid(), :name, :minClients, :maxClients, :percentage, :supportMode, :notes,
                :durationMonths, :isActive, :order, :acceptNewClients, :commissionOnSetup, :setupCommissionPct
            ) RETURNING id
        ');

        $stmt->execute([
            ':name' => $name,
            ':minClients' => (int) ($request->body['minClients'] ?? 1),
            ':maxClients' => isset($request->body['maxClients']) ? (int) $request->body['maxClients'] : null,
            ':percentage' => $percentage,
            ':supportMode' => $request->body['supportMode'] ?? 'PACOTICKET_DIRECT',
            ':notes' => $request->body['notes'] ?? null,
            ':durationMonths' => (int) ($request->body['durationMonths'] ?? 0),
            ':isActive' => isset($request->body['isActive']) ? ($request->body['isActive'] ? 'true' : 'false') : 'true',
            ':order' => (int) ($request->body['order'] ?? 0),
            ':acceptNewClients' => isset($request->body['acceptNewClients']) ? ($request->body['acceptNewClients'] ? 'true' : 'false') : 'true',
            ':commissionOnSetup' => isset($request->body['commissionOnSetup']) ? ($request->body['commissionOnSetup'] ? 'true' : 'false') : 'false',
            ':setupCommissionPct' => $setupCommissionPct,
        ]);

        $result = $stmt->fetch();
        $response->success(['id' => $result['id']], 201);
    }

    public function update(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $tierId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "CommissionTier" WHERE id = :id');
        $stmt->execute([':id' => $tierId]);
        $tier = $stmt->fetch();

        if (!$tier) {
            $response->error('NOT_FOUND', 'Commission tier not found', 404);
            return;
        }

        $fields = [];
        $params = [':id' => $tierId];

        if (isset($request->body['name'])) {
            $fields[] = 'name = :name';
            $params[':name'] = trim($request->body['name']);
        }

        if (isset($request->body['minClients'])) {
            $fields[] = '"minClients" = :minClients';
            $params[':minClients'] = (int) $request->body['minClients'];
        }

        if (array_key_exists('maxClients', $request->body)) {
            $fields[] = '"maxClients" = :maxClients';
            $params[':maxClients'] = $request->body['maxClients'] !== null ? (int) $request->body['maxClients'] : null;
        }

        if (isset($request->body['percentage'])) {
            $percentage = (float) $request->body['percentage'];
            if ($percentage < 0 || $percentage > 100) {
                $response->error('INVALID_INPUT', 'Percentage must be between 0 and 100', 400);
                return;
            }
            $fields[] = 'percentage = :percentage';
            $params[':percentage'] = $percentage;
        }

        if (isset($request->body['supportMode'])) {
            $fields[] = '"supportMode" = :supportMode';
            $params[':supportMode'] = $request->body['supportMode'];
        }

        if (array_key_exists('notes', $request->body)) {
            $fields[] = 'notes = :notes';
            $params[':notes'] = $request->body['notes'];
        }

        if (isset($request->body['durationMonths'])) {
            $fields[] = '"durationMonths" = :durationMonths';
            $params[':durationMonths'] = (int) $request->body['durationMonths'];
        }

        if (isset($request->body['isActive'])) {
            $fields[] = '"isActive" = :isActive';
            $params[':isActive'] = $request->body['isActive'] ? 'true' : 'false';
        }

        if (isset($request->body['order'])) {
            $fields[] = '"order" = :order';
            $params[':order'] = (int) $request->body['order'];
        }

        if (isset($request->body['acceptNewClients'])) {
            $fields[] = '"acceptNewClients" = :acceptNewClients';
            $params[':acceptNewClients'] = $request->body['acceptNewClients'] ? 'true' : 'false';
        }

        if (isset($request->body['commissionOnSetup'])) {
            $fields[] = '"commissionOnSetup" = :commissionOnSetup';
            $params[':commissionOnSetup'] = $request->body['commissionOnSetup'] ? 'true' : 'false';
        }

        if (isset($request->body['setupCommissionPct'])) {
            $setupCommissionPct = (float) $request->body['setupCommissionPct'];
            if ($setupCommissionPct < 0 || $setupCommissionPct > 100) {
                $response->error('INVALID_INPUT', 'Setup commission percentage must be between 0 and 100', 400);
                return;
            }
            $fields[] = '"setupCommissionPct" = :setupCommissionPct';
            $params[':setupCommissionPct'] = $setupCommissionPct;
        }

        if (empty($fields)) {
            $response->success(['message' => 'No changes']);
            return;
        }

        $fields[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "CommissionTier" SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $response->success(['message' => 'Tier updated']);
    }

    public function destroy(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $tierId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "CommissionTier" WHERE id = :id');
        $stmt->execute([':id' => $tierId]);
        $tier = $stmt->fetch();

        if (!$tier) {
            $response->error('NOT_FOUND', 'Commission tier not found', 404);
            return;
        }

        $stmtCheck = $pdo->prepare('SELECT COUNT(*) FROM "ClientCommissionRule" WHERE "tierConfigId" = :id');
        $stmtCheck->execute([':id' => $tierId]);
        $linkedCount = (int) $stmtCheck->fetchColumn();

        if ($linkedCount > 0) {
            $stmt = $pdo->prepare('UPDATE "CommissionTier" SET "isActive" = false, "updatedAt" = NOW() WHERE id = :id');
            $stmt->execute([':id' => $tierId]);
            $response->success(['message' => 'Tier deactivated (has linked commission rules)', 'softDelete' => true]);
        } else {
            $stmt = $pdo->prepare('DELETE FROM "CommissionTier" WHERE id = :id');
            $stmt->execute([':id' => $tierId]);
            $response->success(['message' => 'Tier deleted', 'softDelete' => false]);
        }
    }

    private function formatTier(array $t): array
    {
        return [
            'id' => $t['id'],
            'name' => $t['name'],
            'minClients' => (int) $t['minClients'],
            'maxClients' => $t['maxClients'] !== null ? (int) $t['maxClients'] : null,
            'percentage' => (float) $t['percentage'],
            'supportMode' => $t['supportMode'],
            'notes' => $t['notes'],
            'durationMonths' => (int) $t['durationMonths'],
            'isActive' => (bool) $t['isActive'],
            'order' => (int) $t['order'],
            'acceptNewClients' => (bool) $t['acceptNewClients'],
            'commissionOnSetup' => (bool) $t['commissionOnSetup'],
            'setupCommissionPct' => (float) $t['setupCommissionPct'],
            'createdAt' => $t['createdAt'],
            'updatedAt' => $t['updatedAt'],
        ];
    }
}
