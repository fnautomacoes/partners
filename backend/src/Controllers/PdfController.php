<?php

declare(strict_types=1);

namespace Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use Services\GotenbergService;

class PdfController
{
    private GotenbergService $gotenbergService;
    private string $storagePath;

    public function __construct()
    {
        $this->gotenbergService = new GotenbergService();
        $this->storagePath = getenv('PDF_STORAGE_PATH') ?: '/data/pdfs';
    }

    public function generate(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;

        $html = $request->body['html'] ?? '';
        if (empty($html)) {
            $response->error('INVALID_INPUT', 'HTML content is required', 400);
            return;
        }

        $planName = $request->body['planName'] ?? 'Proposta';
        $leadId = $request->body['leadId'] ?? null;
        $proposalCode = $request->body['proposalCode'] ?? $this->generateProposalCode();
        $setupFeeBase = $request->body['setupFeeBase'] ?? null;
        $setupFeeExtra = $request->body['setupFeeExtra'] ?? null;

        $margins = [
            'top' => $request->body['pdfMarginTop'] ?? 10,
            'bottom' => $request->body['pdfMarginBottom'] ?? 10,
            'left' => $request->body['pdfMarginLeft'] ?? 10,
            'right' => $request->body['pdfMarginRight'] ?? 10,
        ];

        if ($leadId) {
            $stmt = $pdo->prepare('SELECT id FROM "Lead" WHERE id = :id AND "partnerId" = :partnerId');
            $stmt->execute([':id' => $leadId, ':partnerId' => $partnerId]);
            if (!$stmt->fetch()) {
                $response->error('INVALID_LEAD', 'Lead not found or not owned by partner', 400);
                return;
            }
        }

        $pdfContent = $this->gotenbergService->generatePdf($html, $margins);

        if ($pdfContent === null) {
            $response->error('PDF_GENERATION_FAILED', 'Failed to generate PDF via Gotenberg', 502);
            return;
        }

        $partnerDir = $this->storagePath . '/' . $partnerId;
        if (!is_dir($partnerDir)) {
            mkdir($partnerDir, 0755, true);
        }

        $timestamp = date('Ymd_His');
        $safePlanName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $planName);
        $filename = "{$safePlanName}_{$timestamp}.pdf";
        $filePath = $partnerDir . '/' . $filename;

        $resolved = realpath($partnerDir);
        if ($resolved === false || !str_starts_with($resolved, realpath($this->storagePath))) {
            $response->error('STORAGE_ERROR', 'Invalid storage path', 500);
            return;
        }

        file_put_contents($filePath, $pdfContent);

        $htmlHash = hash('sha256', $html);

        $stmt = $pdo->prepare('
            INSERT INTO "ProposalPdf" (id, "partnerId", "leadId", "planName", "proposalCode", "setupFeeBase", "setupFeeExtra", filename, "filePath", "htmlHash")
            VALUES (gen_random_uuid(), :partnerId, :leadId, :planName, :proposalCode, :setupFeeBase, :setupFeeExtra, :filename, :filePath, :htmlHash)
            RETURNING id
        ');
        $stmt->execute([
            ':partnerId' => $partnerId,
            ':leadId' => $leadId,
            ':planName' => $planName,
            ':proposalCode' => $proposalCode,
            ':setupFeeBase' => $setupFeeBase,
            ':setupFeeExtra' => $setupFeeExtra,
            ':filename' => $filename,
            ':filePath' => $filePath,
            ':htmlHash' => $htmlHash,
        ]);
        $result = $stmt->fetch();
        $proposalId = $result['id'];

        if ($leadId) {
            $stmtActivity = $pdo->prepare('
                INSERT INTO "LeadActivity" (id, "leadId", "partnerId", type, description)
                VALUES (gen_random_uuid(), :leadId, :partnerId, :type, :description)
            ');
            $stmtActivity->execute([
                ':leadId' => $leadId,
                ':partnerId' => $partnerId,
                ':type' => 'PDF_SENT',
                ':description' => "Proposal PDF generated: $planName ($proposalCode)",
            ]);
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('X-Proposal-Id: ' . $proposalId);
        header('Content-Length: ' . strlen($pdfContent));
        echo $pdfContent;
        exit;
    }

    public function index(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;

        $stmt = $pdo->prepare('
            SELECT p.*, l.name as "leadName"
            FROM "ProposalPdf" p
            LEFT JOIN "Lead" l ON l.id = p."leadId"
            WHERE p."partnerId" = :partnerId
            ORDER BY p."createdAt" DESC
        ');
        $stmt->execute([':partnerId' => $partnerId]);
        $proposals = $stmt->fetchAll();

        $result = array_map(fn($p) => $this->formatProposal($p), $proposals);
        $response->success($result);
    }

    public function indexAll(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();

        $where = [];
        $params = [];

        if (!empty($request->query['partnerId'])) {
            $where[] = 'p."partnerId" = :partnerId';
            $params[':partnerId'] = $request->query['partnerId'];
        }

        $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql = '
            SELECT p.*, l.name as "leadName", pa.name as "partnerName"
            FROM "ProposalPdf" p
            LEFT JOIN "Lead" l ON l.id = p."leadId"
            LEFT JOIN "Partner" pa ON pa.id = p."partnerId"
            ' . $whereClause . '
            ORDER BY p."createdAt" DESC
        ';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $proposals = $stmt->fetchAll();

        $result = array_map(fn($p) => array_merge($this->formatProposal($p), [
            'partnerName' => $p['partnerName'] ?? null,
        ]), $proposals);

        $response->success($result);
    }

    public function download(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $role = $request->user['role'] ?? '';
        $proposalId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "ProposalPdf" WHERE id = :id');
        $stmt->execute([':id' => $proposalId]);
        $proposal = $stmt->fetch();

        if (!$proposal) {
            $response->error('NOT_FOUND', 'Proposal not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $proposal['partnerId'] !== $partnerId) {
            $response->error('NOT_FOUND', 'Proposal not found', 404);
            return;
        }

        $filePath = $proposal['filePath'];

        $resolvedPath = realpath($filePath);
        $resolvedStorage = realpath($this->storagePath);

        if ($resolvedPath === false || $resolvedStorage === false || !str_starts_with($resolvedPath, $resolvedStorage)) {
            $response->error('PATH_TRAVERSAL', 'Invalid file path', 403);
            return;
        }

        if (!file_exists($filePath)) {
            $response->error('FILE_NOT_FOUND', 'PDF file not found on disk', 404);
            return;
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $proposal['filename'] . '"');
        header('Content-Length: ' . filesize($filePath));
        readfile($filePath);
        exit;
    }

    public function destroy(Request $request, Response $response): void
    {
        $pdo = Database::getInstance();
        $partnerId = $request->user['partnerId'] ?? null;
        $role = $request->user['role'] ?? '';
        $proposalId = $request->params['id'] ?? '';

        $stmt = $pdo->prepare('SELECT * FROM "ProposalPdf" WHERE id = :id');
        $stmt->execute([':id' => $proposalId]);
        $proposal = $stmt->fetch();

        if (!$proposal) {
            $response->error('NOT_FOUND', 'Proposal not found', 404);
            return;
        }

        if ($role !== 'SUPERADMIN' && $proposal['partnerId'] !== $partnerId) {
            $response->error('NOT_FOUND', 'Proposal not found', 404);
            return;
        }

        $filePath = $proposal['filePath'];

        $resolvedPath = realpath($filePath);
        $resolvedStorage = realpath($this->storagePath);

        if ($resolvedPath !== false && $resolvedStorage !== false && str_starts_with($resolvedPath, $resolvedStorage)) {
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }

        $stmt = $pdo->prepare('DELETE FROM "ProposalPdf" WHERE id = :id');
        $stmt->execute([':id' => $proposalId]);

        $response->success(['message' => 'Proposal deleted']);
    }

    private function formatProposal(array $p): array
    {
        return [
            'id' => $p['id'],
            'partnerId' => $p['partnerId'],
            'leadId' => $p['leadId'],
            'leadName' => $p['leadName'] ?? null,
            'planName' => $p['planName'],
            'proposalCode' => $p['proposalCode'],
            'setupFeeBase' => $p['setupFeeBase'] ? (float) $p['setupFeeBase'] : null,
            'setupFeeExtra' => $p['setupFeeExtra'] ? (float) $p['setupFeeExtra'] : null,
            'filename' => $p['filename'],
            'createdAt' => $p['createdAt'],
        ];
    }

    private function generateProposalCode(): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $code = '';
        for ($i = 0; $i < 5; $i++) {
            $code .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $code . '_' . date('dmY');
    }
}
