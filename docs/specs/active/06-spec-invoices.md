---
feature: "Invoice Sync with PacoTicket API"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-10
---

# Feature: Invoices

## 1. Context & Motivation

O sistema precisa sincronizar faturas da API PacoTicket para calcular comissões dos parceiros. Faturas são associadas a clientes pelo pacoticketId e armazenadas localmente via upsert idempotente. SuperAdmin dispara a sincronização manualmente; parceiros visualizam faturas de seus clientes.

## 2. User Stories (prioritized)

### US1 — SuperAdmin sincroniza faturas (P1)

**As a** SuperAdmin, **I want** sincronizar faturas da API PacoTicket, **so that** os dados de faturamento estejam atualizados para cálculo de comissões.

**Independent test:** POST /api/invoices/sync, verificar faturas criadas/atualizadas em Invoice.

**Acceptance Scenarios:**
1. **Given** API PacoTicket retorna faturas, **When** POST /sync, **Then** Invoice criada para cada fatura com pacoticketRef único
2. **Given** fatura já existe (mesmo pacoticketRef), **When** POST /sync, **Then** upsert atualiza status/amount sem duplicar
3. **Given** API PacoTicket indisponível, **When** POST /sync, **Then** erro retornado sem afetar dados existentes

### US2 — Partner visualiza faturas de seus clientes (P1)

**As a** Partner, **I want** listar faturas dos meus clientes, **so that** eu possa acompanhar o faturamento.

**Independent test:** GET /api/invoices como Partner, verificar que retorna apenas faturas de clientes do próprio partnerId.

**Acceptance Scenarios:**
1. **Given** Partner autenticado, **When** GET /api/invoices, **Then** apenas faturas de clientes com partnerId = JWT.partnerId
2. **Given** filtros aplicados, **When** GET /api/invoices?status=PAID&month=6, **Then** resultado filtrado corretamente

### US3 — SuperAdmin visualiza todas as faturas (P2)

**As a** SuperAdmin, **I want** listar e filtrar faturas de qualquer cliente, **so that** eu possa auditar o faturamento.

**Independent test:** GET /api/invoices como SuperAdmin com filtro ?clientId=X.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** GET /api/invoices, **Then** todas as faturas
2. **Given** filtro por clientId, **When** GET ?clientId=X, **Then** apenas faturas do cliente X

## 3. Non-Goals

- Criação manual de faturas (apenas via sync com PacoTicket)
- Edição de faturas localmente (fonte de verdade é PacoTicket)
- Webhook para sincronização automática (sync manual pelo SuperAdmin)
- Envio de faturas por email
- Geração de PDF de fatura

## 4. Functional Requirements

- **FR-001**: System MUST sync invoices from PacoTicket API via POST /api/invoices/sync
- **FR-002**: System MUST match invoices to clients by pacoticketId
- **FR-003**: System MUST upsert invoices by pacoticketRef (idempotent)
- **FR-004**: System MUST list invoices (Partner: own clients; SuperAdmin: all with filters)
- **FR-005**: System MUST support filters: clientId, status, month, year
- **FR-006**: System MUST handle PacoTicket API failure gracefully (return error, no data corruption)

## 5. Key Entities

- **Invoice** — {id, clientId, amount, status, dueDate, paidAt, pacoticketRef, createdAt}. UNIQUE on pacoticketRef.
- **Client** — (existing) has pacoticketId for matching.

## 6. Success Criteria

- **SC-001**: Sync de 500 faturas completa em menos de 30 segundos
- **SC-002**: 100% das faturas têm pacoticketRef único (zero duplicatas)
- **SC-003**: Partner vê apenas faturas de seus clientes (100% compliance P7)
- **SC-004**: Falha na API PacoTicket resulta em 0% de corrupção de dados locais

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; usa upsert idempotente per FR-003
- [x] **P6 Simplicity First:** Reutiliza PacoTicketApiService existente; §8 lista patterns
- [x] **P7 Partner Isolation:** FR-004 extrai partnerId do JWT; SC-003 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabela Invoice existente
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** FR-006 e SC-004 garantem tolerância

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller
- `backend/src/Services/` — extend PacoTicketApiService
- `backend/public/index.php` — 2 novas rotas

**New files to create:**
- `backend/src/Controllers/InvoiceController.php`
  - `index()` — FR-004/005: list with role-based filtering
  - `sync()` — FR-001/002/003/006: fetch from PacoTicket, upsert by pacoticketRef

**Files to modify:**
- `backend/src/Services/PacoTicketApiService.php` — add listInvoices() method
- `backend/public/index.php` — add invoice routes

**Reference patterns to copy:**
- `ClientController.php:24-70` — index() role-based filtering
- `CommissionController.php:140-260` — batch processing pattern

**Migration:** Nenhuma — tabela Invoice existe per handoff.md §3.13

**New dependencies:** Nenhuma

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: POST /sync cria Invoice para cada fatura PacoTicket
- [ ] Manual test — golden path: GET /invoices retorna apenas do parceiro logado
- [ ] Manual test — edge case: Re-sync não duplica faturas (upsert idempotente)
- [ ] Manual test — edge case: API PacoTicket falha → erro retornado, dados intactos
- [ ] Manual test — edge case: Fatura sem cliente correspondente → ignorada/logada
- [ ] DB verification: SELECT confirma pacoticketRef único para todas as faturas
- [ ] Regression: Commissions endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-10: Invoices escolhido como sexta feature (necessário para cálculo de comissões)
- 2026-06-10: Implementation complete (4/4 tasks), verification deferred until environment setup
