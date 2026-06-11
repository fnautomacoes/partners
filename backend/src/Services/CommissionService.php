<?php

declare(strict_types=1);

namespace Services;

use Core\Database;

class CommissionService
{
    public function calculateTier(string $partnerId): array
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT COUNT(*) as count FROM "Client"
            WHERE "partnerId" = :partnerId AND status = :status
        ');
        $stmt->execute([':partnerId' => $partnerId, ':status' => 'ACTIVE']);
        $activeCount = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare('
            SELECT * FROM "CommissionTier"
            WHERE "isActive" = true
            ORDER BY "order" ASC
        ');
        $stmt->execute();
        $tiers = $stmt->fetchAll();

        if (empty($tiers)) {
            return $this->getFallbackTier($activeCount);
        }

        $applicableTier = null;
        foreach ($tiers as $tier) {
            $minClients = (int) $tier['minClients'];
            $maxClients = $tier['maxClients'] !== null ? (int) $tier['maxClients'] : PHP_INT_MAX;

            if ($activeCount >= $minClients && $activeCount <= $maxClients) {
                $applicableTier = $tier;
            }
        }

        if (!$applicableTier) {
            return $this->getFallbackTier($activeCount);
        }

        return [
            'id' => $applicableTier['id'],
            'name' => $applicableTier['name'],
            'percentage' => (float) $applicableTier['percentage'],
            'activeClients' => $activeCount,
        ];
    }

    private function getFallbackTier(int $activeCount): array
    {
        if ($activeCount >= 10) {
            return ['id' => null, 'name' => 'Master', 'percentage' => 35.0, 'activeClients' => $activeCount];
        } elseif ($activeCount >= 3) {
            return ['id' => null, 'name' => 'Parceiro', 'percentage' => 25.0, 'activeClients' => $activeCount];
        } else {
            return ['id' => null, 'name' => 'Indicador', 'percentage' => 15.0, 'activeClients' => $activeCount];
        }
    }

    public function getPendingCommission(string $partnerId): float
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT COALESCE(SUM("commissionAmount" + "setupCommission"), 0) as total FROM "Commission"
            WHERE "partnerId" = :partnerId AND status = :status
        ');
        $stmt->execute([':partnerId' => $partnerId, ':status' => 'PENDING']);

        return (float) $stmt->fetchColumn();
    }

    public function getActiveClientCount(string $partnerId): int
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT COUNT(*) FROM "Client"
            WHERE "partnerId" = :partnerId AND status = :status
        ');
        $stmt->execute([':partnerId' => $partnerId, ':status' => 'ACTIVE']);

        return (int) $stmt->fetchColumn();
    }

    public function getRecentActivity(string $partnerId, int $limit = 5): array
    {
        $pdo = Database::getInstance();

        $stmt = $pdo->prepare('
            SELECT action, details, "createdAt" FROM "ActivityLog"
            WHERE "partnerId" = :partnerId
            ORDER BY "createdAt" DESC
            LIMIT :limit
        ');
        $stmt->bindValue(':partnerId', $partnerId);
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
