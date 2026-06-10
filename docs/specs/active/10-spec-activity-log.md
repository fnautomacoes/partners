---
feature: "Activity Log Audit Trail"
status: draft
owner: riseon
priority: P1
github_issue: ""
created: 2026-06-10
---

# Feature: Activity Log

## 1. Context & Motivation

O sistema precisa de um log de auditoria para rastrear ações importantes realizadas por parceiros e administradores. Logs são criados automaticamente por outras features (criação de clientes, cálculo de comissões, etc.) e podem ser consultados para auditoria e debugging.

## 2. User Stories (prioritized)

### US1 — Partner visualiza seu log de atividades (P1)

**As a** Partner, **I want** ver o histórico de ações realizadas na minha conta, **so that** eu possa acompanhar a atividade.

**Independent test:** GET /api/activity-log como Partner retorna apenas logs do próprio partnerId.

**Acceptance Scenarios:**
1. **Given** Partner autenticado, **When** GET /activity-log, **Then** apenas logs com partnerId = JWT.partnerId
2. **Given** logs de outro parceiro, **When** GET /activity-log, **Then** não aparecem na lista

### US2 — SuperAdmin visualiza todos os logs (P1)

**As a** SuperAdmin, **I want** ver e filtrar logs de qualquer parceiro, **so that** eu possa auditar o sistema.

**Independent test:** GET /api/activity-log como SuperAdmin com filtro ?partnerId=X.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** GET /activity-log, **Then** todos os logs
2. **Given** filtro por action, **When** GET ?action=CLIENT_CREATED, **Then** apenas logs dessa ação
3. **Given** limite especificado, **When** GET ?limit=50, **Then** máximo 50 resultados

## 3. Non-Goals

- Interface de criação manual de logs (logs são criados automaticamente)
- Deleção de logs (audit trail é imutável)
- Exportação de logs em CSV/PDF
- Busca full-text no campo description
- Retenção/arquivamento de logs antigos

## 4. Functional Requirements

- **FR-001**: System MUST list activity logs (Partner: own; SuperAdmin: all)
- **FR-002**: System MUST support filter by partnerId (SuperAdmin only)
- **FR-003**: System MUST support filter by action type
- **FR-004**: System MUST support limit parameter (default 100, max 500)
- **FR-005**: System MUST order logs by createdAt DESC (most recent first)
- **FR-006**: System MUST include partner name when SuperAdmin lists all

## 5. Key Entities

- **ActivityLog** — {id, partnerId, action, description, metadata, createdAt}. partnerId NULL = ação de SuperAdmin.

## 6. Success Criteria

- **SC-001**: GET /activity-log retorna em menos de 200ms para até 500 logs
- **SC-002**: 100% dos logs de parceiro têm partnerId = JWT.partnerId (P7 compliance)
- **SC-003**: 100% dos logs retornados estão ordenados por createdAt DESC

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; logs são imutáveis per §3 Non-Goal
- [x] **P6 Simplicity First:** Read-only endpoint; §8 usa pattern existente
- [x] **P7 Partner Isolation:** FR-001 extrai partnerId do JWT; SC-002 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabela ActivityLog existente
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** N/A — feature read-only sem integração externa

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (ActivityLogController)
- `backend/public/index.php` — 1 nova rota

**New files to create:**
- `backend/src/Controllers/ActivityLogController.php`
  - `index()` — FR-001/002/003/004/005/006: list with role-based filtering

**Files to modify:**
- `backend/public/index.php` — add activity-log route

**Reference patterns to copy:**
- `ClientController.php:24-70` — index() role-based filtering pattern

**Action types (documentação):**
- CLIENT_CREATED, CLIENT_UPDATED, CLIENT_DELETED
- COMMISSIONS_CALCULATED, COMMISSION_PAID
- PLAN_CREATED, PLAN_UPDATED
- PDF_GENERATED
- PACOTICKET_ERROR, PACOTICKET_SUCCESS

**Migration:** Nenhuma — tabela ActivityLog existe per handoff.md §3.15

**New dependencies:** Nenhuma

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: GET /activity-log retorna logs do parceiro
- [ ] Manual test — golden path: SuperAdmin vê todos os logs
- [ ] Manual test — golden path: Filtro ?action=CLIENT_CREATED funciona
- [ ] Manual test — edge case: Partner não vê logs de outro parceiro
- [ ] Manual test — edge case: ?limit=10 retorna máximo 10 logs
- [ ] DB verification: SELECT confirma ordem DESC por createdAt
- [ ] Regression: System Config endpoints funcionam

## 10. Decisions Log

- 2026-06-10: Activity Log escolhido como décima feature (complementa auditoria)
- 2026-06-10: Implementation complete (2/2 tasks), verification deferred until environment setup
