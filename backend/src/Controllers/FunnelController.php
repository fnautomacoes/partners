<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Services\CommissionService;
use Services\PacoTicketApiService;

class FunnelController
{
    private const DEFAULT_STAGES = [
        ['name' => 'Novo Lead', 'order' => 0, 'color' => '#6366f1', 'isDefault' => true],
        ['name' => 'Em Contato', 'order' => 1, 'color' => '#8b5cf6', 'isDefault' => false],
        ['name' => 'Proposta Enviada', 'order' => 2, 'color' => '#a855f7', 'isDefault' => false],
        ['name' => 'Negociação', 'order' => 3, 'color' => '#f59e0b', 'isDefault' => false],
        ['name' => 'Fechado', 'order' => 4, 'color' => '#22c55e', 'isDefault' => false],
        ['name' => 'Perdido', 'order' => 5, 'color' => '#ef4444', 'isDefault' => false],
    ];

    public function indexStages(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;

        $stmt = $pdo->prepare('SELECT * FROM "FunnelStage" WHERE "partnerId" = :partnerId ORDER BY "order" ASC');
        $stmt->execute([':partnerId' => $partnerId]);
        $stages = $stmt->fetchAll();

        if (empty($stages)) {
            $stmtInsert = $pdo->prepare('
                INSERT INTO "FunnelStage" (id, "partnerId", name, color, "order", "isDefault")
                VALUES (gen_random_uuid(), :partnerId, :name, :color, :order, :isDefault)
            ');

            foreach (self::DEFAULT_STAGES as $stage) {
                $stmtInsert->execute([
                    ':partnerId' => $partnerId,
                    ':name' => $stage['name'],
                    ':color' => $stage['color'],
                    ':order' => $stage['order'],
                    ':isDefault' => $stage['isDefault'] ? 'true' : 'false',
                ]);
            }

            $stmt->execute([':partnerId' => $partnerId]);
            $stages = $stmt->fetchAll();
        }

        $result = array_map(fn($s) => [
            'id' => $s['id'],
            'name' => $s['name'],
            'color' => $s['color'],
            'order' => (int) $s['order'],
            'isDefault' => (bool) $s['isDefault'],
            'createdAt' => $s['createdAt'],
        ], $stages);

        $response->success($result);
    }

    public function storeStage(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;

        $name = trim($request->body['name'] ?? '');
        $color = $request->body['color'] ?? '#6366f1';
        $order = (int) ($request->body['order'] ?? 0);

        if (!$name) {
            $response->error('INVALID_INPUT', 'Stage name is required', 400);
            return;
        }

        if (!preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
            $response->error('INVALID_INPUT', 'Color must be a valid hex color', 400);
            return;
        }

        $stmt = $pdo->prepare('
            INSERT INTO "FunnelStage" (id, "partnerId", name, color, "order")
            VALUES (gen_random_uuid(), :partnerId, :name, :color, :order)
            RETURNING id
        ');
        $stmt->execute([
            ':partnerId' => $partnerId,
            ':name' => $name,
            ':color' => $color,
            ':order' => $order,
        ]);

        $result = $stmt->fetch();
        $response->success(['id' => $result['id']], 201);
    }

    public function updateStage(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $stageId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "FunnelStage" WHERE id = :id AND "partnerId" = :partnerId');
        $stmt->execute([':id' => $stageId, ':partnerId' => $partnerId]);
        $stage = $stmt->fetch();

        if (!$stage) {
            $response->error('NOT_FOUND', 'Stage not found', 404);
            return;
        }

        $fields = [];
        $params = [':id' => $stageId];

        if (isset($request->body['name'])) {
            $fields[] = 'name = :name';
            $params[':name'] = trim($request->body['name']);
        }

        if (isset($request->body['color'])) {
            $color = $request->body['color'];
            if (!preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
                $response->error('INVALID_INPUT', 'Color must be a valid hex color', 400);
                return;
            }
            $fields[] = 'color = :color';
            $params[':color'] = $color;
        }

        if (isset($request->body['order'])) {
            $fields[] = '"order" = :order';
            $params[':order'] = (int) $request->body['order'];
        }

        if (empty($fields)) {
            $response->success(['message' => 'No changes']);
            return;
        }

        $fields[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "FunnelStage" SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $response->success(['message' => 'Stage updated']);
    }

    public function destroyStage(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $stageId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "FunnelStage" WHERE id = :id AND "partnerId" = :partnerId');
        $stmt->execute([':id' => $stageId, ':partnerId' => $partnerId]);
        $stage = $stmt->fetch();

        if (!$stage) {
            $response->error('NOT_FOUND', 'Stage not found', 404);
            return;
        }

        $stmtCount = $pdo->prepare('SELECT COUNT(*) FROM "FunnelStage" WHERE "partnerId" = :partnerId');
        $stmtCount->execute([':partnerId' => $partnerId]);
        $totalStages = (int) $stmtCount->fetchColumn();

        if ($totalStages <= 1) {
            $response->error('LAST_STAGE', 'Cannot delete the last stage', 400);
            return;
        }

        $stmtLeads = $pdo->prepare('SELECT COUNT(*) FROM "Lead" WHERE "stageId" = :stageId');
        $stmtLeads->execute([':stageId' => $stageId]);
        $leadCount = (int) $stmtLeads->fetchColumn();

        if ($leadCount > 0) {
            $stmtNext = $pdo->prepare('
                SELECT id FROM "FunnelStage"
                WHERE "partnerId" = :partnerId AND id != :stageId
                ORDER BY "order" ASC
                LIMIT 1
            ');
            $stmtNext->execute([':partnerId' => $partnerId, ':stageId' => $stageId]);
            $nextStage = $stmtNext->fetch();

            if ($nextStage) {
                $stmtMove = $pdo->prepare('UPDATE "Lead" SET "stageId" = :newStageId WHERE "stageId" = :oldStageId');
                $stmtMove->execute([':newStageId' => $nextStage['id'], ':oldStageId' => $stageId]);
            }
        }

        $stmt = $pdo->prepare('DELETE FROM "FunnelStage" WHERE id = :id');
        $stmt->execute([':id' => $stageId]);

        $response->success(['message' => 'Stage deleted', 'leadsMoved' => $leadCount]);
    }

    public function indexLeads(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;

        $where = ['l."partnerId" = :partnerId'];
        $params = [':partnerId' => $partnerId];

        if (!empty($request->query['stageId'])) {
            $where[] = 'l."stageId" = :stageId';
            $params[':stageId'] = $request->query['stageId'];
        }

        if (!empty($request->query['status'])) {
            $where[] = 'l.status = :status';
            $params[':status'] = $request->query['status'];
        }

        $whereClause = 'WHERE ' . implode(' AND ', $where);

        $sql = '
            SELECT l.*, s.name as "stageName", s.color as "stageColor"
            FROM "Lead" l
            LEFT JOIN "FunnelStage" s ON s.id = l."stageId"
            ' . $whereClause . '
            ORDER BY l."createdAt" DESC
        ';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $leads = $stmt->fetchAll();

        $result = array_map(function($l) {
            $formatted = $this->formatLead($l);
            $formatted['stageName'] = $l['stageName'] ?? null;
            $formatted['stageColor'] = $l['stageColor'] ?? null;
            return $formatted;
        }, $leads);
        $response->success($result);
    }

    public function storeLead(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;

        $name = trim($request->body['name'] ?? '');
        if (!$name) {
            $response->error('INVALID_INPUT', 'Lead name is required', 400);
            return;
        }

        $stageId = $request->body['stageId'] ?? null;
        if (!$stageId) {
            $stmt = $pdo->prepare('
                SELECT id FROM "FunnelStage"
                WHERE "partnerId" = :partnerId AND "isDefault" = true
                LIMIT 1
            ');
            $stmt->execute([':partnerId' => $partnerId]);
            $defaultStage = $stmt->fetch();

            if (!$defaultStage) {
                $stmt = $pdo->prepare('
                    SELECT id FROM "FunnelStage"
                    WHERE "partnerId" = :partnerId
                    ORDER BY "order" ASC
                    LIMIT 1
                ');
                $stmt->execute([':partnerId' => $partnerId]);
                $defaultStage = $stmt->fetch();
            }

            $stageId = $defaultStage ? $defaultStage['id'] : null;
        }

        if (!$stageId) {
            $response->error('NO_STAGE', 'No funnel stage available. Create stages first.', 400);
            return;
        }

        $stmt = $pdo->prepare('
            INSERT INTO "Lead" (id, "partnerId", "stageId", "planId", name, company, email, phone, notes, value, status)
            VALUES (gen_random_uuid(), :partnerId, :stageId, :planId, :name, :company, :email, :phone, :notes, :value, :status)
            RETURNING id
        ');
        $stmt->execute([
            ':partnerId' => $partnerId,
            ':stageId' => $stageId,
            ':planId' => $request->body['planId'] ?? null,
            ':name' => $name,
            ':company' => $request->body['company'] ?? null,
            ':email' => $request->body['email'] ?? null,
            ':phone' => $request->body['phone'] ?? null,
            ':notes' => $request->body['notes'] ?? null,
            ':value' => $request->body['value'] ?? null,
            ':status' => 'ACTIVE',
        ]);

        $result = $stmt->fetch();
        $response->success(['id' => $result['id']], 201);
    }

    public function showLead(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $leadId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('
            SELECT l.*, s.name as "stageName", s.color as "stageColor", p.name as "planName"
            FROM "Lead" l
            LEFT JOIN "FunnelStage" s ON s.id = l."stageId"
            LEFT JOIN "Plan" p ON p.id = l."planId"
            WHERE l.id = :id AND l."partnerId" = :partnerId
        ');
        $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
        $lead = $stmt->fetch();

        if (!$lead) {
            $response->error('NOT_FOUND', 'Lead not found', 404);
            return;
        }

        $stmtActivities = $pdo->prepare('
            SELECT * FROM "LeadActivity"
            WHERE "leadId" = :leadId
            ORDER BY "createdAt" DESC
            LIMIT 50
        ');
        $stmtActivities->execute([':leadId' => $leadId]);
        $activities = $stmtActivities->fetchAll();

        $result = $this->formatLead($lead);
        $result['stageName'] = $lead['stageName'];
        $result['stageColor'] = $lead['stageColor'];
        $result['planName'] = $lead['planName'];
        $result['activities'] = array_map(fn($a) => [
            'id' => $a['id'],
            'type' => $a['type'],
            'description' => $a['description'],
            'createdAt' => $a['createdAt'],
        ], $activities);

        $response->success($result);
    }

    public function updateLead(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $leadId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "Lead" WHERE id = :id AND "partnerId" = :partnerId');
        $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
        $lead = $stmt->fetch();

        if (!$lead) {
            $response->error('NOT_FOUND', 'Lead not found', 404);
            return;
        }

        $oldStageId = $lead['stageId'];
        $newStageId = $request->body['stageId'] ?? $oldStageId;

        $fields = [];
        $params = [':id' => $leadId];

        $allowedFields = ['stageId', 'planId', 'name', 'company', 'email', 'phone', 'notes', 'value', 'status'];
        foreach ($allowedFields as $field) {
            if (isset($request->body[$field])) {
                $dbField = $field === 'stageId' ? '"stageId"' : ($field === 'planId' ? '"planId"' : $field);
                $fields[] = "$dbField = :$field";
                $params[":$field"] = $request->body[$field];
            }
        }

        if (empty($fields)) {
            $response->success(['message' => 'No changes']);
            return;
        }

        $fields[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "Lead" SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($newStageId !== $oldStageId) {
            $stmtOld = $pdo->prepare('SELECT name FROM "FunnelStage" WHERE id = :id');
            $stmtOld->execute([':id' => $oldStageId]);
            $oldStageName = $stmtOld->fetchColumn() ?: 'Unknown';

            $stmtNew = $pdo->prepare('SELECT name FROM "FunnelStage" WHERE id = :id');
            $stmtNew->execute([':id' => $newStageId]);
            $newStageName = $stmtNew->fetchColumn() ?: 'Unknown';

            $stmtActivity = $pdo->prepare('
                INSERT INTO "LeadActivity" (id, "leadId", "partnerId", type, description)
                VALUES (gen_random_uuid(), :leadId, :partnerId, :type, :description)
            ');
            $stmtActivity->execute([
                ':leadId' => $leadId,
                ':partnerId' => $partnerId,
                ':type' => 'STAGE_CHANGE',
                ':description' => "Stage changed from '$oldStageName' to '$newStageName'",
            ]);
        }

        $response->success(['message' => 'Lead updated']);
    }

    public function destroyLead(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $leadId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT id FROM "Lead" WHERE id = :id AND "partnerId" = :partnerId');
        $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
        $lead = $stmt->fetch();

        if (!$lead) {
            $response->error('NOT_FOUND', 'Lead not found', 404);
            return;
        }

        $pdo->prepare('DELETE FROM "LeadActivity" WHERE "leadId" = :leadId')->execute([':leadId' => $leadId]);
        $pdo->prepare('DELETE FROM "Lead" WHERE id = :id')->execute([':id' => $leadId]);

        $response->success(['message' => 'Lead deleted']);
    }

    public function indexActivities(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $leadId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT id FROM "Lead" WHERE id = :id AND "partnerId" = :partnerId');
        $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
        if (!$stmt->fetch()) {
            $response->error('NOT_FOUND', 'Lead not found', 404);
            return;
        }

        $stmt = $pdo->prepare('
            SELECT * FROM "LeadActivity"
            WHERE "leadId" = :leadId
            ORDER BY "createdAt" DESC
        ');
        $stmt->execute([':leadId' => $leadId]);
        $activities = $stmt->fetchAll();

        $result = array_map(fn($a) => [
            'id' => $a['id'],
            'type' => $a['type'],
            'description' => $a['description'],
            'createdAt' => $a['createdAt'],
        ], $activities);

        $response->success($result);
    }

    public function storeActivity(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $leadId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT id FROM "Lead" WHERE id = :id AND "partnerId" = :partnerId');
        $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
        if (!$stmt->fetch()) {
            $response->error('NOT_FOUND', 'Lead not found', 404);
            return;
        }

        $type = $request->body['type'] ?? 'NOTE';
        $description = trim($request->body['description'] ?? $request->body['content'] ?? '');

        $validTypes = ['NOTE', 'STAGE_CHANGE', 'PDF_SENT', 'CALL', 'EMAIL', 'WHATSAPP'];
        if (!in_array($type, $validTypes, true)) {
            $response->error('INVALID_INPUT', 'Invalid activity type', 400);
            return;
        }

        $stmt = $pdo->prepare('
            INSERT INTO "LeadActivity" (id, "leadId", "partnerId", type, description)
            VALUES (gen_random_uuid(), :leadId, :partnerId, :type, :description)
            RETURNING id
        ');
        $stmt->execute([
            ':leadId' => $leadId,
            ':partnerId' => $partnerId,
            ':type' => $type,
            ':description' => $description,
        ]);

        $result = $stmt->fetch();
        $response->success(['id' => $result['id']], 201);
    }

    public function promote(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $leadId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('
            SELECT l.*, p.name as "planName", p."totalPrice", p."setupFee"
            FROM "Lead" l
            LEFT JOIN "Plan" p ON p.id = l."planId"
            WHERE l.id = :id AND l."partnerId" = :partnerId
        ');
        $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
        $lead = $stmt->fetch();

        if (!$lead) {
            $response->error('NOT_FOUND', 'Lead not found', 404);
            return;
        }

        if ($lead['status'] === 'WON') {
            $response->error('ALREADY_PROMOTED', 'Lead already converted to client', 400);
            return;
        }

        $missing = [];
        if (empty($lead['email'])) $missing[] = 'email';
        if (empty($lead['phone'])) $missing[] = 'phone';
        if (empty($lead['planId'])) $missing[] = 'planId';

        if (!empty($missing)) {
            $response->error('MISSING_FIELDS', 'Lead is missing required fields: ' . implode(', ', $missing), 400);
            return;
        }

        $password = $request->body['password'] ?? bin2hex(random_bytes(8));
        $recurrence = $request->body['recurrence'] ?? 'MONTHLY';
        $dueDate = $request->body['dueDate'] ?? date('Y-m-d', strtotime('+30 days'));

        $pdo->beginTransaction();

        try {
            $stmtClient = $pdo->prepare('
                INSERT INTO "Client" (id, "partnerId", "planId", "companyName", "contactName", email, phone, recurrence, "dueDate", status)
                VALUES (gen_random_uuid(), :partnerId, :planId, :companyName, :contactName, :email, :phone, :recurrence, :dueDate, :status)
                RETURNING id
            ');
            $stmtClient->execute([
                ':partnerId' => $partnerId,
                ':planId' => $lead['planId'],
                ':companyName' => $lead['company'] ?? $lead['name'],
                ':contactName' => $lead['name'],
                ':email' => $lead['email'],
                ':phone' => $lead['phone'],
                ':recurrence' => $recurrence,
                ':dueDate' => $dueDate,
                ':status' => 'ACTIVE',
            ]);
            $clientResult = $stmtClient->fetch();
            $clientId = $clientResult['id'];

            $commissionService = new CommissionService();
            $tierInfo = $commissionService->calculateTier($partnerId);

            $setupCommissionAmount = 0;
            if ($tierInfo['setupCommissionPct'] > 0 && $lead['setupFee'] > 0) {
                $setupCommissionAmount = (float) $lead['setupFee'] * $tierInfo['setupCommissionPct'] / 100;
            }

            $stmtRule = $pdo->prepare('
                INSERT INTO "ClientCommissionRule" (id, "clientId", "partnerId", "tierConfigId", "tierName", percentage, "setupCommissionPct", "setupCommissionAmount", "commissionOnSetup")
                VALUES (gen_random_uuid(), :clientId, :partnerId, :tierConfigId, :tierName, :percentage, :setupPct, :setupAmount, :commissionOnSetup)
            ');
            $stmtRule->execute([
                ':clientId' => $clientId,
                ':partnerId' => $partnerId,
                ':tierConfigId' => $tierInfo['id'],
                ':tierName' => $tierInfo['name'],
                ':percentage' => $tierInfo['percentage'],
                ':setupPct' => $tierInfo['setupCommissionPct'],
                ':setupAmount' => $setupCommissionAmount,
                ':commissionOnSetup' => $tierInfo['commissionOnSetup'] ? 'true' : 'false',
            ]);

            $stmtLead = $pdo->prepare('UPDATE "Lead" SET status = :status, "updatedAt" = NOW() WHERE id = :id');
            $stmtLead->execute([':status' => 'WON', ':id' => $leadId]);

            $stmtActivity = $pdo->prepare('
                INSERT INTO "LeadActivity" (id, "leadId", "partnerId", type, description)
                VALUES (gen_random_uuid(), :leadId, :partnerId, :type, :description)
            ');
            $stmtActivity->execute([
                ':leadId' => $leadId,
                ':partnerId' => $partnerId,
                ':type' => 'NOTE',
                ':description' => 'Lead promoted to client (ID: ' . $clientId . ')',
            ]);

            $pdo->commit();

            $pacoTicketService = new PacoTicketApiService();
            $pacoticketId = $pacoTicketService->createCompany([
                'companyName' => $lead['company'] ?? $lead['name'],
                'contactName' => $lead['name'],
                'email' => $lead['email'],
                'phone' => $lead['phone'],
                'partnerId' => $partnerId,
                'dueDate' => $dueDate,
                'recurrence' => $recurrence,
                'password' => $password,
            ]);

            if ($pacoticketId) {
                $pdo->prepare('UPDATE "Client" SET "pacoticketId" = :pacoticketId WHERE id = :id')
                    ->execute([':pacoticketId' => $pacoticketId, ':id' => $clientId]);
            }

            $response->success([
                'clientId' => $clientId,
                'pacoticketId' => $pacoticketId,
                'message' => 'Lead promoted to client',
            ], 201);

        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('PROMOTE_FAILED', 'Failed to promote lead: ' . $e->getMessage(), 500);
        }
    }

    private function formatLead(array $lead): array
    {
        return [
            'id' => $lead['id'],
            'partnerId' => $lead['partnerId'],
            'stageId' => $lead['stageId'],
            'planId' => $lead['planId'],
            'name' => $lead['name'],
            'company' => $lead['company'],
            'email' => $lead['email'],
            'phone' => $lead['phone'],
            'notes' => $lead['notes'],
            'value' => $lead['value'] ? (float) $lead['value'] : null,
            'status' => $lead['status'],
            'createdAt' => $lead['createdAt'],
            'updatedAt' => $lead['updatedAt'],
        ];
    }
}
