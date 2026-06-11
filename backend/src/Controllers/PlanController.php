<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

class PlanController
{
    private const MODULE_FIELDS = [
        'useWhatsapp', 'useFacebook', 'useInstagram', 'useCampaigns', 'useSchedules',
        'useInternalChat', 'useExternalApi', 'useKanban', 'usePixel', 'usePerfex',
        'useRD', 'useCV', 'useIXC', 'useAI', 'useCHAMA', 'useTYPE', 'useZAIA',
        'useGPT', 'useGPTA', 'useHS', 'useNNN', 'useHUB', 'useCRM', 'useFLOW',
        'useBTN', 'useCALL', 'useVOIP', 'useDIFY', 'usePUSH', 'useWABAOWN',
        'useWABAAINI', 'useProducts', 'useServices', 'useWEBCHAT', 'useInternal',
    ];

    private const RESOURCE_FIELDS = [
        'users', 'connections', 'queues',
        'connectionsWhatsappUnofficial', 'connectionsWhatsappOfficial', 'connectionsInstagram',
    ];

    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        if ($role === 'SUPERADMIN') {
            $stmt = $pdo->prepare('SELECT * FROM "Plan" ORDER BY "sortOrder" ASC, "createdAt" DESC');
            $stmt->execute();
        } else {
            $stmt = $pdo->prepare('
                SELECT * FROM "Plan"
                WHERE ("ownerId" IS NULL AND "isActive" = true)
                   OR ("ownerId" = :partnerId AND "isActive" = true)
                ORDER BY "sortOrder" ASC, "createdAt" DESC
            ');
            $stmt->execute([':partnerId' => $partnerId]);
        }

        $plans = $stmt->fetchAll();
        $result = array_map(fn($p) => $this->formatPlan($p), $plans);

        $response->success($result);
    }

    public function show(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT * FROM "Plan" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $plan = $stmt->fetch();

        if (!$plan) {
            $response->error('NOT_FOUND', 'Plan not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN') {
            $isGlobal = $plan['ownerId'] === null;
            $isOwn = $plan['ownerId'] === $partnerId;
            if (!$isGlobal && !$isOwn) {
                $response->error('FORBIDDEN', 'Access denied', 403);
                return;
            }
        }

        $addons = $this->getAddons($pdo, $id);

        $result = $this->formatPlan($plan);
        $result['addons'] = $addons;

        $response->success($result);
    }

    public function store(Request $request, Response $response): void
    {
        $name = $request->body['name'] ?? '';
        $description = $request->body['description'] ?? null;
        $basePrice = $request->body['basePrice'] ?? 0;
        $totalPrice = $request->body['totalPrice'] ?? 0;
        $setupFee = $request->body['setupFee'] ?? 0;
        $sortOrder = (int) ($request->body['sortOrder'] ?? 0);

        if (!$name) {
            $response->error('INVALID_INPUT', 'Name is required', 400);
            return;
        }

        $pdo = Database::getInstance();

        $columns = ['id', 'name', 'description', '"basePrice"', '"totalPrice"', '"setupFee"', '"sortOrder"'];
        $placeholders = ['gen_random_uuid()', ':name', ':description', ':basePrice', ':totalPrice', ':setupFee', ':sortOrder'];
        $params = [
            ':name' => $name,
            ':description' => $description,
            ':basePrice' => $basePrice,
            ':totalPrice' => $totalPrice,
            ':setupFee' => $setupFee,
            ':sortOrder' => $sortOrder,
        ];

        foreach (self::RESOURCE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $columns[] = $field === 'users' || $field === 'connections' || $field === 'queues'
                    ? $field : '"' . $field . '"';
                $placeholders[] = ':' . $field;
                $params[':' . $field] = (int) $request->body[$field];
            }
        }

        foreach (self::MODULE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $columns[] = '"' . $field . '"';
                $placeholders[] = ':' . $field;
                $params[':' . $field] = $request->body[$field] ? 'true' : 'false';
            }
        }

        $sql = 'INSERT INTO "Plan" (' . implode(', ', $columns) . ') VALUES (' . implode(', ', $placeholders) . ') RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $plan = $stmt->fetch();

        $response->status(201)->success($this->formatPlan($plan));
    }

    public function update(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id FROM "Plan" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            $response->error('NOT_FOUND', 'Plan not found', 404);
            return;
        }

        $updates = [];
        $params = [':id' => $id];

        $textFields = ['name', 'description'];
        foreach ($textFields as $field) {
            if (isset($request->body[$field])) {
                $updates[] = $field . ' = :' . $field;
                $params[':' . $field] = $request->body[$field];
            }
        }

        $numericFields = ['basePrice', 'totalPrice', 'setupFee', 'sortOrder', 'pacoticketPlanId'];
        foreach ($numericFields as $field) {
            if (isset($request->body[$field])) {
                $updates[] = '"' . $field . '" = :' . $field;
                $params[':' . $field] = $request->body[$field];
            }
        }

        foreach (self::RESOURCE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $col = $field === 'users' || $field === 'connections' || $field === 'queues'
                    ? $field : '"' . $field . '"';
                $updates[] = $col . ' = :' . $field;
                $params[':' . $field] = (int) $request->body[$field];
            }
        }

        foreach (self::MODULE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $updates[] = '"' . $field . '" = :' . $field;
                $params[':' . $field] = $request->body[$field] ? 'true' : 'false';
            }
        }

        if (empty($updates)) {
            $response->error('INVALID_INPUT', 'No fields to update', 400);
            return;
        }

        $updates[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "Plan" SET ' . implode(', ', $updates) . ' WHERE id = :id RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $plan = $stmt->fetch();

        $response->success($this->formatPlan($plan));
    }

    public function destroy(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, "isActive" FROM "Plan" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $plan = $stmt->fetch();

        if (!$plan) {
            $response->error('NOT_FOUND', 'Plan not found', 404);
            return;
        }

        if (!$plan['isActive']) {
            $response->success(['message' => 'Plan already inactive']);
            return;
        }

        $stmt = $pdo->prepare('UPDATE "Plan" SET "isActive" = false, "updatedAt" = NOW() WHERE id = :id');
        $stmt->execute([':id' => $id]);

        $response->success(['message' => 'Plan deactivated successfully']);
    }

    public function reorder(Request $request, Response $response): void
    {
        $orders = $request->body['orders'] ?? [];

        if (!is_array($orders) || empty($orders)) {
            $response->error('INVALID_INPUT', 'Orders array is required', 400);
            return;
        }

        $pdo = Database::getInstance();
        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare('UPDATE "Plan" SET "sortOrder" = :order, "updatedAt" = NOW() WHERE id = :id');
            foreach ($orders as $item) {
                if (!isset($item['id']) || !isset($item['sortOrder'])) {
                    continue;
                }
                $stmt->execute([':id' => $item['id'], ':order' => (int) $item['sortOrder']]);
            }
            $pdo->commit();
            $response->success(['message' => 'Plans reordered successfully']);
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to reorder plans', 500);
        }
    }

    public function storePartner(Request $request, Response $response): void
    {
        $partnerId = $request->user['partnerId'] ?? null;

        if (!$partnerId) {
            $response->error('FORBIDDEN', 'Partner access required', 403);
            return;
        }

        $name = $request->body['name'] ?? '';
        $description = $request->body['description'] ?? null;
        $basePrice = $request->body['basePrice'] ?? 0;
        $totalPrice = $request->body['totalPrice'] ?? 0;
        $setupFee = $request->body['setupFee'] ?? 0;
        $basePlanId = $request->body['basePlanId'] ?? null;

        if (!$name) {
            $response->error('INVALID_INPUT', 'Name is required', 400);
            return;
        }

        $pdo = Database::getInstance();

        $columns = ['id', 'name', 'description', '"basePrice"', '"totalPrice"', '"setupFee"', '"ownerId"'];
        $placeholders = ['gen_random_uuid()', ':name', ':description', ':basePrice', ':totalPrice', ':setupFee', ':ownerId'];
        $params = [
            ':name' => $name,
            ':description' => $description,
            ':basePrice' => $basePrice,
            ':totalPrice' => $totalPrice,
            ':setupFee' => $setupFee,
            ':ownerId' => $partnerId,
        ];

        if ($basePlanId) {
            $columns[] = '"basePlanId"';
            $placeholders[] = ':basePlanId';
            $params[':basePlanId'] = $basePlanId;
        }

        foreach (self::RESOURCE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $columns[] = $field === 'users' || $field === 'connections' || $field === 'queues'
                    ? $field : '"' . $field . '"';
                $placeholders[] = ':' . $field;
                $params[':' . $field] = (int) $request->body[$field];
            }
        }

        foreach (self::MODULE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $columns[] = '"' . $field . '"';
                $placeholders[] = ':' . $field;
                $params[':' . $field] = $request->body[$field] ? 'true' : 'false';
            }
        }

        $sql = 'INSERT INTO "Plan" (' . implode(', ', $columns) . ') VALUES (' . implode(', ', $placeholders) . ') RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $plan = $stmt->fetch();

        $response->status(201)->success($this->formatPlan($plan));
    }

    public function updatePartner(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        if (!$partnerId) {
            $response->error('FORBIDDEN', 'Partner access required', 403);
            return;
        }

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, "ownerId" FROM "Plan" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $plan = $stmt->fetch();

        if (!$plan) {
            $response->error('NOT_FOUND', 'Plan not found', 404);
            return;
        }

        if ($plan['ownerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'You can only edit your own plans', 403);
            return;
        }

        $updates = [];
        $params = [':id' => $id];

        $textFields = ['name', 'description'];
        foreach ($textFields as $field) {
            if (isset($request->body[$field])) {
                $updates[] = $field . ' = :' . $field;
                $params[':' . $field] = $request->body[$field];
            }
        }

        $numericFields = ['basePrice', 'totalPrice', 'setupFee'];
        foreach ($numericFields as $field) {
            if (isset($request->body[$field])) {
                $updates[] = '"' . $field . '" = :' . $field;
                $params[':' . $field] = $request->body[$field];
            }
        }

        foreach (self::RESOURCE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $col = $field === 'users' || $field === 'connections' || $field === 'queues'
                    ? $field : '"' . $field . '"';
                $updates[] = $col . ' = :' . $field;
                $params[':' . $field] = (int) $request->body[$field];
            }
        }

        foreach (self::MODULE_FIELDS as $field) {
            if (isset($request->body[$field])) {
                $updates[] = '"' . $field . '" = :' . $field;
                $params[':' . $field] = $request->body[$field] ? 'true' : 'false';
            }
        }

        if (empty($updates)) {
            $response->error('INVALID_INPUT', 'No fields to update', 400);
            return;
        }

        $updates[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "Plan" SET ' . implode(', ', $updates) . ' WHERE id = :id RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $updated = $stmt->fetch();

        $response->success($this->formatPlan($updated));
    }

    public function destroyPartner(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        if (!$partnerId) {
            $response->error('FORBIDDEN', 'Partner access required', 403);
            return;
        }

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, "ownerId", "isActive" FROM "Plan" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $plan = $stmt->fetch();

        if (!$plan) {
            $response->error('NOT_FOUND', 'Plan not found', 404);
            return;
        }

        if ($plan['ownerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'You can only delete your own plans', 403);
            return;
        }

        if (!$plan['isActive']) {
            $response->success(['message' => 'Plan already inactive']);
            return;
        }

        $stmt = $pdo->prepare('UPDATE "Plan" SET "isActive" = false, "updatedAt" = NOW() WHERE id = :id');
        $stmt->execute([':id' => $id]);

        $response->success(['message' => 'Plan deactivated successfully']);
    }

    private function formatPlan(array $plan): array
    {
        $modules = [];
        foreach (self::MODULE_FIELDS as $field) {
            $modules[$field] = (bool) ($plan[$field] ?? false);
        }

        $resources = [];
        foreach (self::RESOURCE_FIELDS as $field) {
            $resources[$field] = (int) ($plan[$field] ?? 0);
        }

        return [
            'id' => $plan['id'],
            'name' => $plan['name'],
            'description' => $plan['description'],
            'basePrice' => (float) $plan['basePrice'],
            'totalPrice' => (float) $plan['totalPrice'],
            'setupFee' => (float) $plan['setupFee'],
            'sortOrder' => (int) $plan['sortOrder'],
            'ownerId' => $plan['ownerId'],
            'basePlanId' => $plan['basePlanId'],
            'pacoticketPlanId' => $plan['pacoticketPlanId'] ? (int) $plan['pacoticketPlanId'] : null,
            'isActive' => (bool) $plan['isActive'],
            'createdAt' => $plan['createdAt'],
            'updatedAt' => $plan['updatedAt'],
            'modules' => $modules,
            'resources' => $resources,
            'usersIncluded' => (int) ($plan['users'] ?? 1),
            'queuesIncluded' => (int) ($plan['queues'] ?? 1),
            'whatsappIncluded' => (int) ($plan['connections'] ?? 1),
        ];
    }

    private function getAddons(\PDO $pdo, string $planId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM "PlanAddon" WHERE "planId" = :planId ORDER BY "createdAt" ASC');
        $stmt->execute([':planId' => $planId]);
        $addons = $stmt->fetchAll();

        return array_map(fn($a) => [
            'id' => $a['id'],
            'addonType' => $a['addonType'],
            'key' => $a['key'],
            'label' => $a['label'],
            'discountPct' => (float) $a['discountPct'],
            'overridePrice' => $a['overridePrice'] !== null ? (float) $a['overridePrice'] : null,
            'createdAt' => $a['createdAt'],
        ], $addons);
    }
}
