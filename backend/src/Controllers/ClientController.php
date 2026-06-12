<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Services\CommissionService;
use Services\PacoTicketApiService;

class ClientController
{
    private CommissionService $commissionService;
    private PacoTicketApiService $pacoTicketService;

    public function __construct()
    {
        $this->commissionService = new CommissionService();
        $this->pacoTicketService = new PacoTicketApiService();
    }

    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $where = [];
        $params = [];

        if ($role !== 'SUPERADMIN') {
            $where[] = 'c."partnerId" = :partnerId';
            $params[':partnerId'] = $partnerId;
        } else {
            if (!empty($request->query['partnerId'])) {
                $where[] = 'c."partnerId" = :partnerId';
                $params[':partnerId'] = $request->query['partnerId'];
            }
        }

        if (!empty($request->query['status'])) {
            $where[] = 'c.status = :status';
            $params[':status'] = $request->query['status'];
        }

        if (!empty($request->query['planId'])) {
            $where[] = 'c."planId" = :planId';
            $params[':planId'] = $request->query['planId'];
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = '
            SELECT c.*, p.name as "planName", p."totalPrice" as "planPrice", pt.name as "partnerName",
                   (SELECT i.status FROM "Invoice" i WHERE i."clientId" = c.id ORDER BY i."dueDate" DESC LIMIT 1) as "lastInvoiceStatus"
            FROM "Client" c
            LEFT JOIN "Plan" p ON p.id = c."planId"
            LEFT JOIN "Partner" pt ON pt.id = c."partnerId"
            ' . $whereClause . '
            ORDER BY c."createdAt" DESC
        ';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $clients = $stmt->fetchAll();

        $result = array_map(fn($c) => $this->formatClient($c), $clients);

        $response->success($result);
    }

    public function show(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT c.*, p.name as "planName", p."totalPrice" as "planPrice", p."setupFee" as "planSetupFee"
            FROM "Client" c
            LEFT JOIN "Plan" p ON p.id = c."planId"
            WHERE c.id = :id
        ');
        $stmt->execute([':id' => $id]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $client['partnerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'Access denied', 403);
            return;
        }

        $stmt = $pdo->prepare('SELECT * FROM "ClientAddon" WHERE "clientId" = :clientId ORDER BY "createdAt" ASC');
        $stmt->execute([':clientId' => $id]);
        $addons = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT * FROM "ClientCommissionRule" WHERE "clientId" = :clientId');
        $stmt->execute([':clientId' => $id]);
        $commissionRule = $stmt->fetch();

        $result = $this->formatClient($client);
        $result['plan'] = [
            'id' => $client['planId'],
            'name' => $client['planName'],
            'totalPrice' => (float) ($client['planPrice'] ?? 0),
            'setupFee' => (float) ($client['planSetupFee'] ?? 0),
        ];
        $result['addons'] = array_map(fn($a) => [
            'id' => $a['id'],
            'addonType' => $a['addonType'],
            'key' => $a['key'],
            'label' => $a['label'],
            'quantity' => (int) $a['quantity'],
            'unitPrice' => (float) $a['unitPrice'],
            'discountPct' => (float) $a['discountPct'],
            'setupFee' => (float) $a['setupFee'],
            'createdAt' => $a['createdAt'],
        ], $addons);
        $result['commissionRule'] = $commissionRule ? [
            'id' => $commissionRule['id'],
            'tierName' => $commissionRule['tierName'],
            'percentage' => (float) $commissionRule['percentage'],
            'commissionOnSetup' => (bool) $commissionRule['commissionOnSetup'],
            'setupCommissionPct' => (float) $commissionRule['setupCommissionPct'],
            'startedAt' => $commissionRule['startedAt'],
            'expiresAt' => $commissionRule['expiresAt'],
        ] : null;

        $response->success($result);
    }

    public function store(Request $request, Response $response): void
    {
        $role = $request->user['role'] ?? '';
        $jwtPartnerId = $request->user['partnerId'] ?? null;

        $partnerId = ($role === 'SUPERADMIN' && !empty($request->body['partnerId']))
            ? $request->body['partnerId']
            : $jwtPartnerId;

        if (!$partnerId) {
            $response->error('FORBIDDEN', 'Partner access required', 403);
            return;
        }

        $companyName = $request->body['companyName'] ?? '';
        $contactName = $request->body['contactName'] ?? '';
        $email = $request->body['email'] ?? '';
        $phone = $request->body['phone'] ?? '';
        $planId = $request->body['planId'] ?? '';
        $recurrence = $request->body['recurrence'] ?? 'MONTHLY';
        $dueDate = $request->body['dueDate'] ?? '';
        $password = $request->body['password'] ?? '';

        if (!$companyName || !$contactName || !$email || !$phone || !$planId || !$dueDate) {
            $response->error('INVALID_INPUT', 'Missing required fields', 400);
            return;
        }

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT * FROM "Plan" WHERE id = :id');
        $stmt->execute([':id' => $planId]);
        $plan = $stmt->fetch();

        if (!$plan) {
            $response->error('NOT_FOUND', 'Plan not found', 404);
            return;
        }

        if (!$plan['isActive']) {
            $response->error('INVALID_INPUT', 'Plan is not active', 400);
            return;
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('
                INSERT INTO "Client" (id, "partnerId", "planId", "companyName", "contactName", email, phone, recurrence, "dueDate")
                VALUES (gen_random_uuid(), :partnerId, :planId, :companyName, :contactName, :email, :phone, :recurrence, :dueDate)
                RETURNING *
            ');
            $stmt->execute([
                ':partnerId' => $partnerId,
                ':planId' => $planId,
                ':companyName' => $companyName,
                ':contactName' => $contactName,
                ':email' => $email,
                ':phone' => $phone,
                ':recurrence' => $recurrence,
                ':dueDate' => $dueDate,
            ]);
            $client = $stmt->fetch();

            $tier = $this->commissionService->calculateTier($partnerId);

            $setupFee = (float) $plan['setupFee'];
            $basePlanSetupFee = 0;
            if ($plan['basePlanId']) {
                $stmtBase = $pdo->prepare('SELECT "setupFee" FROM "Plan" WHERE id = :id');
                $stmtBase->execute([':id' => $plan['basePlanId']]);
                $basePlan = $stmtBase->fetch();
                $basePlanSetupFee = $basePlan ? (float) $basePlan['setupFee'] : 0;
            }
            $setupFeeExtra = $setupFee - $basePlanSetupFee;
            $setupCommissionPct = $tier['percentage'];
            $setupCommissionAmount = $setupFeeExtra * $setupCommissionPct / 100;

            $stmt = $pdo->prepare('
                INSERT INTO "ClientCommissionRule" (id, "clientId", "partnerId", "tierConfigId", "tierName", percentage, "commissionOnSetup", "setupCommissionPct", "setupFeeAmount", "setupCommissionAmount")
                VALUES (gen_random_uuid(), :clientId, :partnerId, :tierConfigId, :tierName, :percentage, :commissionOnSetup, :setupCommissionPct, :setupFeeAmount, :setupCommissionAmount)
            ');
            $stmt->execute([
                ':clientId' => $client['id'],
                ':partnerId' => $partnerId,
                ':tierConfigId' => $tier['id'],
                ':tierName' => $tier['name'],
                ':percentage' => $tier['percentage'],
                ':commissionOnSetup' => $setupFeeExtra > 0 ? 'true' : 'false',
                ':setupCommissionPct' => $setupCommissionPct,
                ':setupFeeAmount' => $setupFeeExtra,
                ':setupCommissionAmount' => $setupCommissionAmount,
            ]);

            $pdo->commit();

            $pacoticketId = null;
            try {
                $pacoticketId = $this->pacoTicketService->createCompany([
                    'companyName' => $companyName,
                    'contactName' => $contactName,
                    'email' => $email,
                    'phone' => $phone,
                    'partnerId' => $partnerId,
                    'dueDate' => $dueDate,
                    'recurrence' => $recurrence,
                    'password' => $password,
                    'pacoticketPlanId' => $plan['pacoticketPlanId'],
                ]);

                if ($pacoticketId) {
                    $stmt = $pdo->prepare('UPDATE "Client" SET "pacoticketId" = :pacoticketId WHERE id = :id');
                    $stmt->execute([':pacoticketId' => $pacoticketId, ':id' => $client['id']]);
                    $client['pacoticketId'] = $pacoticketId;
                }
            } catch (\Exception $e) {
                $stmt = $pdo->prepare('
                    INSERT INTO "ActivityLog" (id, "partnerId", action, description)
                    VALUES (gen_random_uuid(), :partnerId, :action, :description)
                ');
                $stmt->execute([
                    ':partnerId' => $partnerId,
                    ':action' => 'PACOTICKET_ERROR',
                    ':description' => json_encode(['error' => $e->getMessage(), 'clientId' => $client['id']]),
                ]);
            }

            $response->status(201)->success($this->formatClient($client));
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to create client', 500);
        }
    }

    public function update(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT * FROM "Client" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $client['partnerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'Access denied', 403);
            return;
        }

        $updates = [];
        $params = [':id' => $id];
        $mirrorData = [];

        $fields = ['companyName', 'contactName', 'email', 'phone'];
        foreach ($fields as $field) {
            if (isset($request->body[$field])) {
                $updates[] = '"' . $field . '" = :' . $field;
                $params[':' . $field] = $request->body[$field];
                $mirrorData[$field] = $request->body[$field];
            }
        }

        if (isset($request->body['dueDate'])) {
            $updates[] = '"dueDate" = :dueDate';
            $params[':dueDate'] = $request->body['dueDate'];
            $mirrorData['dueDate'] = $request->body['dueDate'];
        }

        if (isset($request->body['recurrence'])) {
            $updates[] = 'recurrence = :recurrence';
            $params[':recurrence'] = $request->body['recurrence'];
            $mirrorData['recurrence'] = $request->body['recurrence'];
        }

        if (empty($updates)) {
            $response->error('INVALID_INPUT', 'No fields to update', 400);
            return;
        }

        $updates[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "Client" SET ' . implode(', ', $updates) . ' WHERE id = :id RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $updated = $stmt->fetch();

        if ($client['pacoticketId'] && !empty($mirrorData)) {
            try {
                $this->pacoTicketService->updateCompany($client['pacoticketId'], $mirrorData);
            } catch (\Exception $e) {
                $stmt = $pdo->prepare('
                    INSERT INTO "ActivityLog" (id, "partnerId", action, description)
                    VALUES (gen_random_uuid(), :partnerId, :action, :description)
                ');
                $stmt->execute([
                    ':partnerId' => $client['partnerId'],
                    ':action' => 'PACOTICKET_UPDATE_ERROR',
                    ':description' => json_encode(['error' => $e->getMessage(), 'clientId' => $id]),
                ]);
            }
        }

        $response->success($this->formatClient($updated));
    }

    public function destroy(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, status FROM "Client" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($client['status'] === 'INACTIVE') {
            $response->success(['message' => 'Client already inactive']);
            return;
        }

        $stmt = $pdo->prepare('UPDATE "Client" SET status = :status, "updatedAt" = NOW() WHERE id = :id');
        $stmt->execute([':status' => 'INACTIVE', ':id' => $id]);

        $response->success(['message' => 'Client deactivated successfully']);
    }

    public function indexAddons(Request $request, Response $response): void
    {
        $clientId = $request->params['id'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT "partnerId" FROM "Client" WHERE id = :id');
        $stmt->execute([':id' => $clientId]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $client['partnerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'Access denied', 403);
            return;
        }

        $stmt = $pdo->prepare('SELECT * FROM "ClientAddon" WHERE "clientId" = :clientId ORDER BY "createdAt" ASC');
        $stmt->execute([':clientId' => $clientId]);
        $addons = $stmt->fetchAll();

        $result = array_map(fn($a) => [
            'id' => $a['id'],
            'clientId' => $a['clientId'],
            'addonType' => $a['addonType'],
            'key' => $a['key'],
            'label' => $a['label'],
            'quantity' => (int) $a['quantity'],
            'unitPrice' => (float) $a['unitPrice'],
            'discountPct' => (float) $a['discountPct'],
            'setupFee' => (float) $a['setupFee'],
            'createdAt' => $a['createdAt'],
            'updatedAt' => $a['updatedAt'],
        ], $addons);

        $response->success($result);
    }

    public function storeAddon(Request $request, Response $response): void
    {
        $clientId = $request->params['id'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT "partnerId" FROM "Client" WHERE id = :id');
        $stmt->execute([':id' => $clientId]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $client['partnerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'Access denied', 403);
            return;
        }

        $addonType = $request->body['addonType'] ?? '';
        $key = $request->body['key'] ?? '';
        $label = $request->body['label'] ?? '';
        $quantity = (int) ($request->body['quantity'] ?? 1);
        $unitPrice = (float) ($request->body['unitPrice'] ?? 0);
        $discountPct = (float) ($request->body['discountPct'] ?? 0);
        $setupFee = (float) ($request->body['setupFee'] ?? 0);

        if (!$addonType || !$key || !$label) {
            $response->error('INVALID_INPUT', 'addonType, key, and label are required', 400);
            return;
        }

        $stmt = $pdo->prepare('
            INSERT INTO "ClientAddon" (id, "clientId", "addonType", key, label, quantity, "unitPrice", "discountPct", "setupFee")
            VALUES (gen_random_uuid(), :clientId, :addonType, :key, :label, :quantity, :unitPrice, :discountPct, :setupFee)
            RETURNING *
        ');
        $stmt->execute([
            ':clientId' => $clientId,
            ':addonType' => $addonType,
            ':key' => $key,
            ':label' => $label,
            ':quantity' => $quantity,
            ':unitPrice' => $unitPrice,
            ':discountPct' => $discountPct,
            ':setupFee' => $setupFee,
        ]);
        $addon = $stmt->fetch();

        $response->status(201)->success([
            'id' => $addon['id'],
            'clientId' => $addon['clientId'],
            'addonType' => $addon['addonType'],
            'key' => $addon['key'],
            'label' => $addon['label'],
            'quantity' => (int) $addon['quantity'],
            'unitPrice' => (float) $addon['unitPrice'],
            'discountPct' => (float) $addon['discountPct'],
            'setupFee' => (float) $addon['setupFee'],
            'createdAt' => $addon['createdAt'],
        ]);
    }

    public function updateAddon(Request $request, Response $response): void
    {
        $clientId = $request->params['id'] ?? '';
        $addonId = $request->params['addonId'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT "partnerId" FROM "Client" WHERE id = :id');
        $stmt->execute([':id' => $clientId]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $client['partnerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'Access denied', 403);
            return;
        }

        $stmt = $pdo->prepare('SELECT id FROM "ClientAddon" WHERE id = :id AND "clientId" = :clientId');
        $stmt->execute([':id' => $addonId, ':clientId' => $clientId]);
        if (!$stmt->fetch()) {
            $response->error('NOT_FOUND', 'Addon not found', 404);
            return;
        }

        $updates = [];
        $params = [':id' => $addonId];

        $numericFields = ['quantity', 'unitPrice', 'discountPct', 'setupFee'];
        foreach ($numericFields as $field) {
            if (isset($request->body[$field])) {
                $col = in_array($field, ['unitPrice', 'discountPct', 'setupFee']) ? '"' . $field . '"' : $field;
                $updates[] = $col . ' = :' . $field;
                $params[':' . $field] = $request->body[$field];
            }
        }

        if (isset($request->body['label'])) {
            $updates[] = 'label = :label';
            $params[':label'] = $request->body['label'];
        }

        if (empty($updates)) {
            $response->error('INVALID_INPUT', 'No fields to update', 400);
            return;
        }

        $updates[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "ClientAddon" SET ' . implode(', ', $updates) . ' WHERE id = :id RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $addon = $stmt->fetch();

        $response->success([
            'id' => $addon['id'],
            'clientId' => $addon['clientId'],
            'addonType' => $addon['addonType'],
            'key' => $addon['key'],
            'label' => $addon['label'],
            'quantity' => (int) $addon['quantity'],
            'unitPrice' => (float) $addon['unitPrice'],
            'discountPct' => (float) $addon['discountPct'],
            'setupFee' => (float) $addon['setupFee'],
            'updatedAt' => $addon['updatedAt'],
        ]);
    }

    public function destroyAddon(Request $request, Response $response): void
    {
        $clientId = $request->params['id'] ?? '';
        $addonId = $request->params['addonId'] ?? '';
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT "partnerId" FROM "Client" WHERE id = :id');
        $stmt->execute([':id' => $clientId]);
        $client = $stmt->fetch();

        if (!$client) {
            $response->error('NOT_FOUND', 'Client not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $client['partnerId'] !== $partnerId) {
            $response->error('FORBIDDEN', 'Access denied', 403);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM "ClientAddon" WHERE id = :id AND "clientId" = :clientId');
        $stmt->execute([':id' => $addonId, ':clientId' => $clientId]);

        if ($stmt->rowCount() === 0) {
            $response->error('NOT_FOUND', 'Addon not found', 404);
            return;
        }

        $response->success(['message' => 'Addon deleted successfully']);
    }

    private function formatClient(array $client): array
    {
        $price = isset($client['planPrice']) ? (float) $client['planPrice'] : null;

        $dueDay = null;
        if (!empty($client['dueDate'])) {
            $date = new \DateTime($client['dueDate']);
            $dueDay = (int) $date->format('d');
        }

        return [
            'id' => $client['id'],
            'partnerId' => $client['partnerId'],
            'planId' => $client['planId'],
            'companyName' => $client['companyName'],
            'contactName' => $client['contactName'],
            'email' => $client['email'],
            'phone' => $client['phone'],
            'contactEmail' => $client['email'],
            'contactPhone' => $client['phone'],
            'recurrence' => $client['recurrence'],
            'dueDate' => $client['dueDate'],
            'dueDay' => $dueDay,
            'status' => $client['status'],
            'pacoticketId' => $client['pacoticketId'],
            'createdAt' => $client['createdAt'],
            'updatedAt' => $client['updatedAt'],
            'activationDate' => $client['createdAt'],
            'planName' => $client['planName'] ?? null,
            'planPrice' => $price,
            'monthlyPrice' => $price,
            'partnerName' => $client['partnerName'] ?? null,
            'lastInvoiceStatus' => $client['lastInvoiceStatus'] ?? null,
        ];
    }
}
