<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

class ActivityLogController
{
    private const DEFAULT_LIMIT = 100;
    private const MAX_LIMIT = 500;

    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $role = $request->user['role'] ?? '';
        $partnerId = $request->user['partnerId'] ?? null;

        $where = [];
        $params = [];

        if ($role !== 'SUPERADMIN') {
            $where[] = 'a."partnerId" = :partnerId';
            $params[':partnerId'] = $partnerId;
        } else {
            if (!empty($request->query['partnerId'])) {
                $where[] = 'a."partnerId" = :partnerId';
                $params[':partnerId'] = $request->query['partnerId'];
            }
        }

        if (!empty($request->query['action'])) {
            $where[] = 'a.action = :action';
            $params[':action'] = $request->query['action'];
        }

        $limit = (int) ($request->query['limit'] ?? self::DEFAULT_LIMIT);
        $limit = min(max($limit, 1), self::MAX_LIMIT);

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = '
            SELECT a.*, p.name as "partnerName"
            FROM "ActivityLog" a
            LEFT JOIN "Partner" p ON p.id = a."partnerId"
            ' . $whereClause . '
            ORDER BY a."createdAt" DESC
            LIMIT :limit
        ';

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        $logs = $stmt->fetchAll();

        $result = array_map(fn($log) => [
            'id' => $log['id'],
            'partnerId' => $log['partnerId'],
            'partnerName' => $log['partnerName'],
            'action' => $log['action'],
            'description' => $log['description'],
            'metadata' => $log['metadata'] ? json_decode($log['metadata'], true) : null,
            'createdAt' => $log['createdAt'],
        ], $logs);

        $response->success($result);
    }
}
