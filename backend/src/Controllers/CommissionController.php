<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

class CommissionController
{
    public function summary(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $where = [];
        $params = [];

        if ($role !== 'SUPERADMIN') {
            $where[] = '"partnerId" = :partnerId';
            $params[':partnerId'] = $partnerId;
        } else {
            if (!empty($request->query['partnerId'])) {
                $where[] = '"partnerId" = :partnerId';
                $params[':partnerId'] = $request->query['partnerId'];
            }
        }

        if (!empty($request->query['month'])) {
            $where[] = '"periodMonth" = :month';
            $params[':month'] = (int) $request->query['month'];
        }

        if (!empty($request->query['year'])) {
            $where[] = '"periodYear" = :year';
            $params[':year'] = (int) $request->query['year'];
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = '
            SELECT
                COALESCE(SUM(CASE WHEN status = \'PENDING\' THEN "commissionAmount" + "setupCommission" ELSE 0 END), 0) as pending,
                COALESCE(SUM(CASE WHEN status = \'PAID\' THEN "commissionAmount" + "setupCommission" ELSE 0 END), 0) as paid,
                COALESCE(SUM("commissionAmount" + "setupCommission"), 0) as total,
                COUNT(*) as count
            FROM "Commission"
            ' . $whereClause;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $result = $stmt->fetch();

        $response->success([
            'pending' => (float) $result['pending'],
            'paid' => (float) $result['paid'],
            'total' => (float) $result['total'],
            'count' => (int) $result['count'],
        ]);
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

        if (!empty($request->query['month'])) {
            $where[] = 'c."periodMonth" = :month';
            $params[':month'] = (int) $request->query['month'];
        }

        if (!empty($request->query['year'])) {
            $where[] = 'c."periodYear" = :year';
            $params[':year'] = (int) $request->query['year'];
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = '
            SELECT c.*, cl."companyName" as "clientName", p.name as "partnerName"
            FROM "Commission" c
            LEFT JOIN "Client" cl ON cl.id = c."clientId"
            LEFT JOIN "Partner" p ON p.id = c."partnerId"
            ' . $whereClause . '
            ORDER BY c."periodYear" DESC, c."periodMonth" DESC, c."createdAt" DESC
        ';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $commissions = $stmt->fetchAll();

        $result = array_map(fn($c) => [
            'id' => $c['id'],
            'partnerId' => $c['partnerId'],
            'partnerName' => $c['partnerName'],
            'clientId' => $c['clientId'],
            'clientName' => $c['clientName'],
            'invoiceId' => $c['invoiceId'],
            'periodMonth' => (int) $c['periodMonth'],
            'periodYear' => (int) $c['periodYear'],
            'tier' => (int) $c['tier'],
            'percentage' => (float) $c['percentage'],
            'baseAmount' => (float) $c['baseAmount'],
            'commissionAmount' => (float) $c['commissionAmount'],
            'setupCommission' => (float) $c['setupCommission'],
            'totalCommission' => (float) $c['commissionAmount'] + (float) $c['setupCommission'],
            'status' => $c['status'],
            'paidAt' => $c['paidAt'],
            'createdAt' => $c['createdAt'],
        ], $commissions);

        $response->success($result);
    }

    public function calculate(Request $request, Response $response): void
    {
        $month = (int) ($request->body['month'] ?? 0);
        $year = (int) ($request->body['year'] ?? 0);

        if ($month < 1 || $month > 12 || $year < 2020) {
            $response->error('INVALID_INPUT', 'Valid month (1-12) and year required', 400);
            return;
        }

        $pdo = Database::getInstance();
        $periodStart = sprintf('%04d-%02d-01', $year, $month);

        $stmtPartners = $pdo->prepare('SELECT id FROM "Partner" WHERE status = :status');
        $stmtPartners->execute([':status' => 'ACTIVE']);
        $partners = $stmtPartners->fetchAll();

        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($partners as $partner) {
            $partnerId = $partner['id'];

            $stmtClients = $pdo->prepare('
                SELECT c.id as "clientId", c."planId", i.amount as "invoiceAmount", i.id as "invoiceId"
                FROM "Client" c
                JOIN "Invoice" i ON i."clientId" = c.id
                WHERE c."partnerId" = :partnerId
                  AND c.status = :clientStatus
                  AND i.status = :invoiceStatus
                  AND EXTRACT(MONTH FROM i."dueDate") = :month
                  AND EXTRACT(YEAR FROM i."dueDate") = :year
            ');
            $stmtClients->execute([
                ':partnerId' => $partnerId,
                ':clientStatus' => 'ACTIVE',
                ':invoiceStatus' => 'PAID',
                ':month' => $month,
                ':year' => $year,
            ]);
            $clientInvoices = $stmtClients->fetchAll();

            foreach ($clientInvoices as $ci) {
                $clientId = $ci['clientId'];
                $invoiceAmount = (float) $ci['invoiceAmount'];
                $invoiceId = $ci['invoiceId'];

                $stmtRule = $pdo->prepare('SELECT * FROM "ClientCommissionRule" WHERE "clientId" = :clientId');
                $stmtRule->execute([':clientId' => $clientId]);
                $rule = $stmtRule->fetch();

                if (!$rule) {
                    $skipped++;
                    continue;
                }

                if ($rule['frozenAtUpgrade']) {
                    $skipped++;
                    continue;
                }

                if ($rule['expiresAt'] !== null && strtotime($rule['expiresAt']) < strtotime($periodStart)) {
                    $skipped++;
                    continue;
                }

                $percentage = (float) $rule['percentage'];
                $commissionAmount = $invoiceAmount * $percentage / 100;

                $setupCommission = 0;
                if ($rule['commissionOnSetup']) {
                    $stmtPrior = $pdo->prepare('
                        SELECT COUNT(*) FROM "Commission"
                        WHERE "partnerId" = :partnerId AND "clientId" = :clientId
                    ');
                    $stmtPrior->execute([':partnerId' => $partnerId, ':clientId' => $clientId]);
                    $priorCount = (int) $stmtPrior->fetchColumn();

                    if ($priorCount === 0) {
                        $setupCommission = (float) $rule['setupCommissionAmount'];
                    }
                }

                $tierOrder = 1;
                if ($rule['tierConfigId']) {
                    $stmtTier = $pdo->prepare('SELECT "order" FROM "CommissionTier" WHERE id = :id');
                    $stmtTier->execute([':id' => $rule['tierConfigId']]);
                    $tierData = $stmtTier->fetch();
                    $tierOrder = $tierData ? (int) $tierData['order'] : 1;
                }

                $stmtUpsert = $pdo->prepare('
                    INSERT INTO "Commission" (id, "partnerId", "clientId", "invoiceId", "tierConfigId", "periodMonth", "periodYear", tier, percentage, "baseAmount", "commissionAmount", "setupCommission")
                    VALUES (gen_random_uuid(), :partnerId, :clientId, :invoiceId, :tierConfigId, :periodMonth, :periodYear, :tier, :percentage, :baseAmount, :commissionAmount, :setupCommission)
                    ON CONFLICT ("partnerId", "clientId", "periodMonth", "periodYear")
                    DO UPDATE SET
                        "invoiceId" = EXCLUDED."invoiceId",
                        "baseAmount" = EXCLUDED."baseAmount",
                        "commissionAmount" = EXCLUDED."commissionAmount",
                        "setupCommission" = CASE WHEN "Commission"."setupCommission" > 0 THEN "Commission"."setupCommission" ELSE EXCLUDED."setupCommission" END
                    RETURNING (xmax = 0) as inserted
                ');
                $stmtUpsert->execute([
                    ':partnerId' => $partnerId,
                    ':clientId' => $clientId,
                    ':invoiceId' => $invoiceId,
                    ':tierConfigId' => $rule['tierConfigId'],
                    ':periodMonth' => $month,
                    ':periodYear' => $year,
                    ':tier' => $tierOrder,
                    ':percentage' => $percentage,
                    ':baseAmount' => $invoiceAmount,
                    ':commissionAmount' => $commissionAmount,
                    ':setupCommission' => $setupCommission,
                ]);

                $upsertResult = $stmtUpsert->fetch();
                if ($upsertResult && $upsertResult['inserted']) {
                    $created++;
                } else {
                    $updated++;
                }
            }
        }

        $response->success([
            'period' => sprintf('%04d-%02d', $year, $month),
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
        ]);
    }

    public function pay(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, status, "paidAt" FROM "Commission" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $commission = $stmt->fetch();

        if (!$commission) {
            $response->error('NOT_FOUND', 'Commission not found', 404);
            return;
        }

        if ($commission['status'] === 'PAID') {
            $response->success([
                'message' => 'Commission already paid',
                'paidAt' => $commission['paidAt'],
            ]);
            return;
        }

        $stmt = $pdo->prepare('
            UPDATE "Commission"
            SET status = :status, "paidAt" = NOW()
            WHERE id = :id
            RETURNING "paidAt"
        ');
        $stmt->execute([':status' => 'PAID', ':id' => $id]);
        $result = $stmt->fetch();

        $response->success([
            'message' => 'Commission marked as paid',
            'paidAt' => $result['paidAt'],
        ]);
    }
}
