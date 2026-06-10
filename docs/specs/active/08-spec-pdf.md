---
feature: "PDF Proposal Generation via Gotenberg"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-10
---

# Feature: PDF Generation

## 1. Context & Motivation

O sistema precisa gerar propostas comerciais em PDF para que parceiros enviem documentos profissionais aos leads. PDFs são gerados via Gotenberg a partir de HTML enviado pelo frontend, salvos em disco e registrados para histórico. Opcionalmente podem ser vinculados a leads do funil.

## 2. User Stories (prioritized)

### US1 — Partner gera proposta em PDF (P1)

**As a** Partner, **I want** gerar uma proposta em PDF a partir de HTML, **so that** eu possa enviar documentos profissionais para meus leads.

**Independent test:** POST /api/pdf/plan com HTML válido, verificar PDF retornado e registro em ProposalPdf.

**Acceptance Scenarios:**
1. **Given** HTML válido, **When** POST /pdf/plan, **Then** PDF gerado via Gotenberg e retornado
2. **Given** leadId fornecido, **When** gera PDF, **Then** atividade PDF_SENT registrada no lead
3. **Given** mesmo HTML, **When** gera novamente, **Then** novo PDF criado (não deduplica)

### US2 — Partner lista e baixa propostas (P1)

**As a** Partner, **I want** listar e baixar minhas propostas geradas, **so that** eu possa acessar o histórico.

**Independent test:** GET /api/pdf/proposals retorna apenas propostas do próprio partnerId.

**Acceptance Scenarios:**
1. **Given** Partner autenticado, **When** GET /proposals, **Then** apenas propostas com partnerId = JWT
2. **Given** proposta existente, **When** GET /proposals/:id/download, **Then** arquivo PDF retornado

### US3 — SuperAdmin visualiza todas as propostas (P2)

**As a** SuperAdmin, **I want** listar todas as propostas com filtros, **so that** eu possa auditar a geração.

**Independent test:** GET /api/pdf/proposals/all como SuperAdmin com filtro ?partnerId=X.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** GET /proposals/all, **Then** todas as propostas
2. **Given** filtro por partnerId, **When** GET ?partnerId=X, **Then** apenas do parceiro X

### US4 — Partner remove proposta (P2)

**As a** Partner, **I want** remover propostas antigas, **so that** eu possa manter o histórico limpo.

**Independent test:** DELETE /api/pdf/proposals/:id remove registro e arquivo do disco.

**Acceptance Scenarios:**
1. **Given** proposta do parceiro, **When** DELETE, **Then** registro removido e arquivo deletado
2. **Given** proposta de outro parceiro, **When** DELETE, **Then** 404 Not Found

## 3. Non-Goals

- Edição de PDFs após geração
- Templates de proposta pré-definidos (HTML vem do frontend)
- Assinatura digital de PDFs
- Envio automático por email (feature separada)
- Compressão ou otimização de PDFs
- Versionamento de propostas

## 4. Functional Requirements

- **FR-001**: System MUST generate PDF from HTML via Gotenberg service
- **FR-002**: System MUST convert margin values from mm to cm before sending to Gotenberg
- **FR-003**: System MUST save PDF to disk at /data/pdfs/{partnerId}/{filename}
- **FR-004**: System MUST register PDF in ProposalPdf with SHA-256 hash of HTML
- **FR-005**: System MUST register PDF_SENT activity on lead if leadId provided
- **FR-006**: System MUST return PDF as application/pdf with X-Proposal-Id header
- **FR-007**: System MUST list proposals (Partner: own; SuperAdmin: all with filters)
- **FR-008**: System MUST allow download of PDF from disk with path traversal protection
- **FR-009**: System MUST allow Partner to delete own proposals (db + disk)

## 5. Key Entities

- **ProposalPdf** — {id, partnerId, leadId, planName, proposalCode, setupFeeBase, setupFeeExtra, filename, filePath, htmlHash, createdAt}

## 6. Success Criteria

- **SC-001**: Geração de PDF completa em menos de 5 segundos para HTML de até 100KB
- **SC-002**: 100% dos PDFs têm partnerId = JWT.partnerId (P7 compliance)
- **SC-003**: 100% das propostas com leadId registram atividade PDF_SENT
- **SC-004**: 0 vulnerabilidades de path traversal em download/delete

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; path traversal protection per FR-008/SC-004
- [x] **P6 Simplicity First:** Usa Gotenberg existente; curl nativo; §8 lista patterns
- [x] **P7 Partner Isolation:** FR-007 extrai partnerId do JWT; SC-002 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabela ProposalPdf existente
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** FR-001 usa Gotenberg (local, não PacoTicket); falha retorna erro

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (PdfController)
- `backend/src/Services/` — 1 novo service (GotenbergService)
- `backend/public/index.php` — 5 novas rotas

**New files to create:**
- `backend/src/Services/GotenbergService.php`
  - `generatePdf($html, $margins)` — POST multipart to Gotenberg, return binary or null
- `backend/src/Controllers/PdfController.php`
  - `generate()` — FR-001/002/003/004/005/006: full generation flow
  - `index()` — FR-007: list partner proposals
  - `indexAll()` — FR-007: list all proposals (SuperAdmin)
  - `download()` — FR-008: stream file with path traversal check
  - `destroy()` — FR-009: delete record + file

**Files to modify:**
- `backend/public/index.php` — add pdf routes

**Reference patterns to copy:**
- `ClientController.php:24-70` — index() role-based filtering
- `FunnelController.php:470-490` — storeActivity() for PDF_SENT

**Path traversal protection (FR-008):**
```php
$resolved = realpath(dirname($filePath));
if (!str_starts_with($resolved, PDF_STORAGE_PATH)) {
    throw new \RuntimeException('Path traversal detected');
}
```

**Migration:** Nenhuma — tabela ProposalPdf existe per handoff.md §3.19

**New dependencies:** Nenhuma (curl nativo)

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis + Gotenberg).

- [ ] Manual test — golden path: POST /pdf/plan gera PDF e salva em disco
- [ ] Manual test — golden path: GET /proposals lista apenas do parceiro
- [ ] Manual test — golden path: GET /proposals/:id/download retorna arquivo
- [ ] Manual test — golden path: DELETE /proposals/:id remove registro e arquivo
- [ ] Manual test — edge case: leadId válido registra atividade PDF_SENT
- [ ] Manual test — edge case: Path traversal attempt retorna erro
- [ ] Manual test — edge case: Gotenberg indisponível retorna 502
- [ ] DB verification: SELECT confirma htmlHash SHA-256 para cada proposta
- [ ] Regression: Funnel endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-10: PDF Generation escolhido como oitava feature (complementa funil CRM)
- 2026-06-10: Implementation complete (5/5 tasks), verification deferred until environment setup
