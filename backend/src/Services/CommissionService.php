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
            'commissionOnSetup' => (bool) ($applicableTier['commissionOnSetup'] ?? false),
            'setupCommissionPct' => (float) ($applicableTier['setupCommissionPct'] ?? $applicableTier['percentage']),
        ];
    }

    private function getFallbackTier(int $activeCount): array
    {
        $percentage = $activeCount >= 10 ? 35.0 : ($activeCount >= 3 ? 25.0 : 15.0);
        $name = $activeCount >= 10 ? 'Master' : ($activeCount >= 3 ? 'Parceiro' : 'Indicador');

        return [
            'id' => null,
            'name' => $name,
            'percentage' => $percentage,
            'activeClients' => $activeCount,
            'commissionOnSetup' => false,
            'setupCommissionPct' => $percentage,
        ];
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
            SELECT action, description, "createdAt" FROM "ActivityLog"
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
