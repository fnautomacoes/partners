<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Services\PacoTicketApiService;

class InvoiceController
{
    private PacoTicketApiService $pacoTicketService;

    public function __construct()
    {
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
        }

        if (!empty($request->query['clientId'])) {
            $where[] = 'i."clientId" = :clientId';
            $params[':clientId'] = $request->query['clientId'];
        }

        if (!empty($request->query['status'])) {
            $where[] = 'i.status = :status';
            $params[':status'] = $request->query['status'];
        }

        if (!empty($request->query['month'])) {
            $where[] = 'EXTRACT(MONTH FROM i."dueDate") = :month';
            $params[':month'] = (int) $request->query['month'];
        }

        if (!empty($request->query['year'])) {
            $where[] = 'EXTRACT(YEAR FROM i."dueDate") = :year';
            $params[':year'] = (int) $request->query['year'];
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = '
            SELECT i.*, c."companyName" as "clientName", c."partnerId"
            FROM "Invoice" i
            JOIN "Client" c ON c.id = i."clientId"
            ' . $whereClause . '
            ORDER BY i."dueDate" DESC, i."createdAt" DESC
        ';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll();

        $result = array_map(fn($inv) => [
            'id' => $inv['id'],
            'clientId' => $inv['clientId'],
            'clientName' => $inv['clientName'],
            'partnerId' => $inv['partnerId'],
            'amount' => (float) $inv['amount'],
            'status' => $inv['status'],
            'dueDate' => $inv['dueDate'],
            'paidAt' => $inv['paidAt'],
            'pacoticketRef' => $inv['pacoticketRef'],
            'createdAt' => $inv['createdAt'],
        ], $invoices);

        $response->success($result);
    }

    public function sync(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $invoices = $this->pacoTicketService->listInvoices();

        if ($invoices === null) {
            $response->error('EXTERNAL_API_ERROR', 'Failed to fetch invoices from PacoTicket', 502);
            return;
        }

        $stmtClient = $pdo->prepare('SELECT id FROM "Client" WHERE "pacoticketId" = :pacoticketId');
        $stmtUpsert = $pdo->prepare('
            INSERT INTO "Invoice" (id, "clientId", amount, status, "dueDate", "paidAt", "pacoticketRef")
            VALUES (gen_random_uuid(), :clientId, :amount, :status, :dueDate, :paidAt, :pacoticketRef)
            ON CONFLICT ("pacoticketRef")
            DO UPDATE SET
                amount = EXCLUDED.amount,
                status = EXCLUDED.status,
                "dueDate" = EXCLUDED."dueDate",
                "paidAt" = EXCLUDED."paidAt"
            RETURNING (xmax = 0) as inserted
        ');

        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($invoices as $inv) {
            $pacoticketRef = $inv['id'] ?? $inv['invoiceId'] ?? null;
            $companyId = $inv['companyId'] ?? $inv['empresa_id'] ?? null;

            if (!$pacoticketRef || !$companyId) {
                $skipped++;
                continue;
            }

            $stmtClient->execute([':pacoticketId' => (string) $companyId]);
            $client = $stmtClient->fetch();

            if (!$client) {
                $skipped++;
                continue;
            }

            $status = $this->mapInvoiceStatus($inv['status'] ?? $inv['situacao'] ?? 'pending');
            $amount = (float) ($inv['amount'] ?? $inv['valor'] ?? 0);
            $dueDate = $inv['dueDate'] ?? $inv['vencimento'] ?? date('Y-m-d');
            $paidAt = null;
            if ($status === 'PAID' && isset($inv['paidAt'])) {
                $paidAt = $inv['paidAt'];
            } elseif ($status === 'PAID' && isset($inv['dataPagamento'])) {
                $paidAt = $inv['dataPagamento'];
            }

            try {
                $stmtUpsert->execute([
                    ':clientId' => $client['id'],
                    ':amount' => $amount,
                    ':status' => $status,
                    ':dueDate' => $dueDate,
                    ':paidAt' => $paidAt,
                    ':pacoticketRef' => (string) $pacoticketRef,
                ]);

                $result = $stmtUpsert->fetch();
                if ($result && $result['inserted']) {
                    $created++;
                } else {
                    $updated++;
                }
            } catch (\Exception $e) {
                $skipped++;
            }
        }

        $response->success([
            'synced' => count($invoices),
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
        ]);
    }

    private function mapInvoiceStatus(string $status): string
    {
        $status = strtolower($status);

        $map = [
            'paid' => 'PAID',
            'pago' => 'PAID',
            'pending' => 'PENDING',
            'pendente' => 'PENDING',
            'overdue' => 'OVERDUE',
            'vencido' => 'OVERDUE',
            'atrasado' => 'OVERDUE',
            'cancelled' => 'CANCELLED',
            'cancelado' => 'CANCELLED',
        ];

        return $map[$status] ?? 'PENDING';
    }
}
