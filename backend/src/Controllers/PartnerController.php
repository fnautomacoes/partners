<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Helpers\Crypto;
use Services\CommissionService;

class PartnerController
{
    private CommissionService $commissionService;

    public function __construct()
    {
        $this->commissionService = new CommissionService();
    }

    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT p.*, u.email
            FROM "Partner" p
            JOIN "User" u ON u.id = p."userId"
            ORDER BY p."createdAt" DESC
        ');
        $stmt->execute();
        $partners = $stmt->fetchAll();

        $result = [];
        foreach ($partners as $partner) {
            $tier = $this->commissionService->calculateTier($partner['id']);
            $pending = $this->commissionService->getPendingCommission($partner['id']);

            $result[] = [
                'id' => $partner['id'],
                'userId' => $partner['userId'],
                'email' => $partner['email'],
                'name' => $partner['name'],
                'phone' => $partner['phone'],
                'document' => $partner['document'],
                'status' => $partner['status'],
                'canSetRecurrence' => (bool) $partner['canSetRecurrence'],
                'canSetDueDate' => (bool) $partner['canSetDueDate'],
                'createdAt' => $partner['createdAt'],
                'tier' => $tier['name'],
                'tierPercentage' => $tier['percentage'],
                'activeClients' => $tier['activeClients'],
                'pendingCommission' => $pending,
            ];
        }

        $response->success($result);
    }

    public function store(Request $request, Response $response): void
    {
        $email = $request->body['email'] ?? '';
        $name = $request->body['name'] ?? '';
        $phone = $request->body['phone'] ?? null;
        $document = $request->body['document'] ?? null;
        $password = $request->body['password'] ?? '';
        $canSetRecurrence = (bool) ($request->body['canSetRecurrence'] ?? false);
        $canSetDueDate = (bool) ($request->body['canSetDueDate'] ?? false);

        if (!$email || !$name) {
            $response->error('INVALID_INPUT', 'Email and name are required', 400);
            return;
        }

        if (!$password || strlen($password) < 8) {
            $response->error('INVALID_INPUT', 'Password must be at least 8 characters', 400);
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $response->error('INVALID_INPUT', 'Invalid email format', 400);
            return;
        }

        $pdo = Database::getInstance();
        $email = strtolower(trim($email));

        $stmt = $pdo->prepare('SELECT id FROM "User" WHERE email = :email');
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            $response->error('EMAIL_EXISTS', 'Email already registered', 409);
            return;
        }

        $passwordHash = Crypto::hashPassword($password);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('
                INSERT INTO "User" (id, email, "passwordHash", role)
                VALUES (gen_random_uuid(), :email, :passwordHash, :role)
                RETURNING id
            ');
            $stmt->execute([
                ':email' => $email,
                ':passwordHash' => $passwordHash,
                ':role' => 'PARTNER',
            ]);
            $userId = $stmt->fetchColumn();

            $stmt = $pdo->prepare('
                INSERT INTO "Partner" (id, "userId", name, phone, document, "canSetRecurrence", "canSetDueDate")
                VALUES (gen_random_uuid(), :userId, :name, :phone, :document, :canSetRecurrence, :canSetDueDate)
                RETURNING *
            ');
            $stmt->execute([
                ':userId' => $userId,
                ':name' => $name,
                ':phone' => $phone,
                ':document' => $document,
                ':canSetRecurrence' => $canSetRecurrence ? 'true' : 'false',
                ':canSetDueDate' => $canSetDueDate ? 'true' : 'false',
            ]);
            $partner = $stmt->fetch();

            $pdo->commit();

            $response->status(201)->success([
                'id' => $partner['id'],
                'userId' => $partner['userId'],
                'email' => $email,
                'name' => $partner['name'],
                'phone' => $partner['phone'],
                'document' => $partner['document'],
                'status' => $partner['status'],
                'canSetRecurrence' => (bool) $partner['canSetRecurrence'],
                'canSetDueDate' => (bool) $partner['canSetDueDate'],
                'createdAt' => $partner['createdAt'],
            ]);
        } catch (\Exception $e) {
            $pdo->rollBack();
            $response->error('SERVER_ERROR', 'Failed to create partner', 500);
        }
    }

    public function show(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT p.*, u.email
            FROM "Partner" p
            JOIN "User" u ON u.id = p."userId"
            WHERE p.id = :id
        ');
        $stmt->execute([':id' => $id]);
        $partner = $stmt->fetch();

        if (!$partner) {
            $response->error('NOT_FOUND', 'Partner not found', 404);
            return;
        }

        $tier = $this->commissionService->calculateTier($partner['id']);
        $pending = $this->commissionService->getPendingCommission($partner['id']);

        $response->success([
            'id' => $partner['id'],
            'userId' => $partner['userId'],
            'email' => $partner['email'],
            'name' => $partner['name'],
            'phone' => $partner['phone'],
            'document' => $partner['document'],
            'status' => $partner['status'],
            'canSetRecurrence' => (bool) $partner['canSetRecurrence'],
            'canSetDueDate' => (bool) $partner['canSetDueDate'],
            'createdAt' => $partner['createdAt'],
            'updatedAt' => $partner['updatedAt'],
            'tier' => $tier['name'],
            'tierPercentage' => $tier['percentage'],
            'activeClients' => $tier['activeClients'],
            'pendingCommission' => $pending,
        ]);
    }

    public function update(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id FROM "Partner" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            $response->error('NOT_FOUND', 'Partner not found', 404);
            return;
        }

        $updates = [];
        $params = [':id' => $id];

        if (isset($request->body['name'])) {
            $updates[] = 'name = :name';
            $params[':name'] = $request->body['name'];
        }
        if (isset($request->body['phone'])) {
            $updates[] = 'phone = :phone';
            $params[':phone'] = $request->body['phone'];
        }
        if (isset($request->body['document'])) {
            $updates[] = 'document = :document';
            $params[':document'] = $request->body['document'];
        }
        if (isset($request->body['canSetRecurrence'])) {
            $updates[] = '"canSetRecurrence" = :canSetRecurrence';
            $params[':canSetRecurrence'] = $request->body['canSetRecurrence'] ? 'true' : 'false';
        }
        if (isset($request->body['canSetDueDate'])) {
            $updates[] = '"canSetDueDate" = :canSetDueDate';
            $params[':canSetDueDate'] = $request->body['canSetDueDate'] ? 'true' : 'false';
        }
        if (isset($request->body['status'])) {
            $status = $request->body['status'];
            if (!in_array($status, ['ACTIVE', 'INACTIVE'], true)) {
                $response->error('INVALID_INPUT', 'Invalid status', 400);
                return;
            }
            $updates[] = 'status = :status';
            $params[':status'] = $status;
        }

        if (empty($updates)) {
            $response->error('INVALID_INPUT', 'No fields to update', 400);
            return;
        }

        $updates[] = '"updatedAt" = NOW()';
        $sql = 'UPDATE "Partner" SET ' . implode(', ', $updates) . ' WHERE id = :id RETURNING *';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $partner = $stmt->fetch();

        $stmt = $pdo->prepare('SELECT email FROM "User" WHERE id = :userId');
        $stmt->execute([':userId' => $partner['userId']]);
        $email = $stmt->fetchColumn();

        $tier = $this->commissionService->calculateTier($partner['id']);

        $response->success([
            'id' => $partner['id'],
            'userId' => $partner['userId'],
            'email' => $email,
            'name' => $partner['name'],
            'phone' => $partner['phone'],
            'document' => $partner['document'],
            'status' => $partner['status'],
            'canSetRecurrence' => (bool) $partner['canSetRecurrence'],
            'canSetDueDate' => (bool) $partner['canSetDueDate'],
            'updatedAt' => $partner['updatedAt'],
            'tier' => $tier['name'],
        ]);
    }

    public function destroy(Request $request, Response $response): void
    {
        $id = $request->params['id'] ?? '';

        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('SELECT id, status FROM "Partner" WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $partner = $stmt->fetch();

        if (!$partner) {
            $response->error('NOT_FOUND', 'Partner not found', 404);
            return;
        }

        if ($partner['status'] === 'INACTIVE') {
            $response->success(['message' => 'Partner already inactive']);
            return;
        }

        $stmt = $pdo->prepare('
            UPDATE "Partner" SET status = :status, "updatedAt" = NOW()
            WHERE id = :id
        ');
        $stmt->execute([':status' => 'INACTIVE', ':id' => $id]);

        $response->success(['message' => 'Partner deactivated successfully']);
    }

    public function dashboard(Request $request, Response $response): void
    {
        $partnerId = $request->user['partnerId'] ?? null;

        if (!$partnerId) {
            $response->error('FORBIDDEN', 'Partner access required', 403);
            return;
        }

        $pdo = Database::getInstance();

        $tier = $this->commissionService->calculateTier($partnerId);
        $pending = $this->commissionService->getPendingCommission($partnerId);

        $stmt = $pdo->prepare('
            SELECT c.id, c."companyName", c.status, p.name as "planName"
            FROM "Client" c
            LEFT JOIN "Plan" p ON p.id = c."planId"
            WHERE c."partnerId" = :partnerId
            ORDER BY c."createdAt" DESC
            LIMIT 5
        ');
        $stmt->execute([':partnerId' => $partnerId]);
        $recentClients = $stmt->fetchAll();

        $response->success([
            'tier' => $tier['name'],
            'tierPercentage' => $tier['percentage'],
            'activeClients' => $tier['activeClients'],
            'pendingCommission' => $pending,
            'recentClients' => $recentClients,
        ]);
    }

    public function adminDashboard(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $stmtPartners = $pdo->query('SELECT COUNT(*) FROM "Partner" WHERE status = \'ACTIVE\'');
        $activePartners = (int) $stmtPartners->fetchColumn();

        $stmtClients = $pdo->query('SELECT COUNT(*) FROM "Client" WHERE status = \'ACTIVE\'');
        $activeClients = (int) $stmtClients->fetchColumn();

        $stmtPending = $pdo->query('
            SELECT COALESCE(SUM("commissionAmount" + "setupCommission"), 0)
            FROM "Commission" WHERE status = \'PENDING\'
        ');
        $pendingCommissions = (float) $stmtPending->fetchColumn();

        $stmtRevenue = $pdo->query('
            SELECT COALESCE(SUM(p."basePrice"), 0)
            FROM "Client" c
            JOIN "Plan" p ON p.id = c."planId"
            WHERE c.status = \'ACTIVE\'
        ');
        $monthlyRevenue = (float) $stmtRevenue->fetchColumn();

        $stmtTiers = $pdo->query('
            SELECT id, name FROM "CommissionTier"
            WHERE "isActive" = true ORDER BY "order" ASC
        ');
        $tiers = $stmtTiers->fetchAll();

        $tierDistribution = [];
        foreach ($tiers as $tier) {
            $stmtCount = $pdo->prepare('
                SELECT COUNT(*) FROM "Partner" pa WHERE pa.status = \'ACTIVE\'
                AND (
                    SELECT COUNT(*) FROM "Client" c
                    WHERE c."partnerId" = pa.id AND c.status = \'ACTIVE\'
                ) BETWEEN :min AND COALESCE(
                    (SELECT "maxClients" FROM "CommissionTier" WHERE id = :tierId),
                    999999
                )
                AND (
                    SELECT COUNT(*) FROM "Client" c
                    WHERE c."partnerId" = pa.id AND c.status = \'ACTIVE\'
                ) >= (SELECT "minClients" FROM "CommissionTier" WHERE id = :tierId2)
            ');
            $stmtCount->execute([
                ':min' => 0,
                ':tierId' => $tier['id'],
                ':tierId2' => $tier['id']
            ]);
        }

        $tierDistribution = [];
        $stmtAllTiers = $pdo->query('
            SELECT ct.id, ct.name, ct."minClients", ct."maxClients"
            FROM "CommissionTier" ct
            WHERE ct."isActive" = true
            ORDER BY ct."order" ASC
        ');
        $allTiers = $stmtAllTiers->fetchAll();

        $stmtActivePartners = $pdo->query('SELECT id FROM "Partner" WHERE status = \'ACTIVE\'');
        $activePartnerIds = $stmtActivePartners->fetchAll(\PDO::FETCH_COLUMN);

        foreach ($allTiers as $tier) {
            $count = 0;
            foreach ($activePartnerIds as $pid) {
                $stmtClientCount = $pdo->prepare('
                    SELECT COUNT(*) FROM "Client" WHERE "partnerId" = :pid AND status = \'ACTIVE\'
                ');
                $stmtClientCount->execute([':pid' => $pid]);
                $clientCount = (int) $stmtClientCount->fetchColumn();

                $minClients = (int) $tier['minClients'];
                $maxClients = $tier['maxClients'] !== null ? (int) $tier['maxClients'] : PHP_INT_MAX;

                if ($clientCount >= $minClients && $clientCount <= $maxClients) {
                    $count++;
                }
            }
            $tierDistribution[] = [
                'name' => $tier['name'],
                'count' => $count,
            ];
        }

        $stmtTopPartners = $pdo->prepare('
            SELECT p.id, p.name,
                (SELECT COUNT(*) FROM "Client" c WHERE c."partnerId" = p.id AND c.status = \'ACTIVE\') as "activeClients",
                COALESCE(
                    (SELECT SUM("commissionAmount" + "setupCommission") FROM "Commission" com WHERE com."partnerId" = p.id),
                    0
                ) as "totalCommissions"
            FROM "Partner" p
            WHERE p.status = \'ACTIVE\'
            ORDER BY "activeClients" DESC
            LIMIT 5
        ');
        $stmtTopPartners->execute();
        $topPartners = $stmtTopPartners->fetchAll();

        $topPartnersResult = [];
        foreach ($topPartners as $tp) {
            $tier = $this->commissionService->calculateTier($tp['id']);
            $topPartnersResult[] = [
                'id' => $tp['id'],
                'name' => $tp['name'],
                'activeClients' => (int) $tp['activeClients'],
                'totalCommissions' => (float) $tp['totalCommissions'],
                'tier' => $tier['name'],
            ];
        }

        $stmtActivities = $pdo->prepare('
            SELECT a.id, a.action, a.description, a."createdAt", p.name as "partnerName"
            FROM "ActivityLog" a
            LEFT JOIN "Partner" p ON p.id = a."partnerId"
            ORDER BY a."createdAt" DESC
            LIMIT 10
        ');
        $stmtActivities->execute();
        $recentActivities = $stmtActivities->fetchAll();

        $response->success([
            'activePartners' => $activePartners,
            'activeClients' => $activeClients,
            'pendingCommissions' => $pendingCommissions,
            'monthlyRevenue' => $monthlyRevenue,
            'tierDistribution' => $tierDistribution,
            'topPartners' => $topPartnersResult,
            'recentActivities' => array_map(fn($a) => [
                'id' => $a['id'],
                'action' => $a['action'],
                'description' => $a['description'],
                'partnerName' => $a['partnerName'],
                'createdAt' => $a['createdAt'],
            ], $recentActivities),
        ]);
    }
}
