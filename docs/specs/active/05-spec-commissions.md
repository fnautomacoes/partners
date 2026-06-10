---
feature: "Commission Calculation and Payment"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-10
---

# Feature: Commissions

## 1. Context & Motivation

O sistema precisa calcular e registrar comissões dos parceiros com base nas faturas pagas de seus clientes. Comissões são calculadas mensalmente usando a regra travada de cada cliente (ClientCommissionRule), não o tier atual do parceiro. SuperAdmin pode calcular comissões em lote e marcá-las como pagas.

## 2. User Stories (prioritized)

### US1 — SuperAdmin calcula comissões do período (P1)

**As a** SuperAdmin, **I want** calcular comissões de todos os parceiros para um mês/ano, **so that** as comissões sejam registradas de forma idempotente.

**Independent test:** POST /api/commissions/calculate com mês/ano, verificar registros criados em Commission.

**Acceptance Scenarios:**
1. **Given** faturas PAID no período, **When** POST /calculate, **Then** Commission criada para cada par parceiro×cliente
2. **Given** Commission já existe para o período, **When** POST /calculate novamente, **Then** upsert sem duplicação (idempotente)
3. **Given** ClientCommissionRule com frozenAtUpgrade=true, **When** /calculate, **Then** cliente ignorado

### US2 — Partner visualiza suas comissões (P1)

**As a** Partner, **I want** ver o resumo e listagem das minhas comissões, **so that** eu saiba quanto tenho a receber.

**Independent test:** GET /api/commissions como Partner, verificar que retorna apenas comissões do próprio partnerId.

**Acceptance Scenarios:**
1. **Given** Partner autenticado, **When** GET /api/commissions, **Then** apenas comissões com partnerId = JWT.partnerId
2. **Given** comissões pendentes e pagas, **When** GET /summary, **Then** totais corretos por status

### US3 — SuperAdmin marca comissão como paga (P2)

**As a** SuperAdmin, **I want** marcar comissões como pagas, **so that** o histórico de pagamentos fique registrado.

**Independent test:** PUT /api/commissions/:id/pay, verificar status = PAID e paidAt preenchido.

**Acceptance Scenarios:**
1. **Given** comissão PENDING, **When** PUT /pay, **Then** status = PAID, paidAt = now()
2. **Given** comissão já PAID, **When** PUT /pay, **Then** retorna sucesso sem alterar paidAt

## 3. Non-Goals

- Pagamento automático via gateway (registro manual pelo SuperAdmin)
- Recálculo retroativo de comissões já pagas
- Alteração de ClientCommissionRule após criação (regra é imutável per spec 04)
- Relatórios de comissão em PDF (feature separada)
- Notificação por email de comissão calculada

## 4. Functional Requirements

- **FR-001**: System MUST calculate commissions for a given month/year period
- **FR-002**: System MUST use ClientCommissionRule (locked rule) for percentage, not current tier
- **FR-003**: System MUST skip clients with frozenAtUpgrade=true or expired rules
- **FR-004**: System MUST calculate setup commission only on first period for each client
- **FR-005**: System MUST upsert Commission (idempotent via UNIQUE constraint)
- **FR-006**: System MUST list commissions (Partner: own; SuperAdmin: all with filters)
- **FR-007**: System MUST return summary with totals by status (pending, paid, total)
- **FR-008**: System MUST allow SuperAdmin to mark commission as PAID

## 5. Key Entities

- **Commission** — {id, partnerId, clientId, invoiceId, periodMonth, periodYear, percentage, baseAmount, commissionAmount, setupCommission, status, paidAt}. UNIQUE on (partnerId, clientId, periodMonth, periodYear).
- **ClientCommissionRule** — (existing) locked commission rules per client.

## 6. Success Criteria

- **SC-001**: Cálculo de 100 clientes completa em menos de 5 segundos
- **SC-002**: 100% das comissões usam percentual da ClientCommissionRule, não tier atual
- **SC-003**: 100% das comissões de setup são cobradas apenas uma vez por cliente
- **SC-004**: Recálculo do mesmo período resulta em 0 duplicações
- **SC-005**: Partner vê apenas suas comissões (100% compliance P7)

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; usa upsert idempotente per FR-005
- [x] **P6 Simplicity First:** Reutiliza CommissionService existente; §8 lista patterns
- [x] **P7 Partner Isolation:** FR-006 extrai partnerId do JWT; SC-005 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabela Commission existente
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** Non-Goal explicita que não há integração externa

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (CommissionController)
- `backend/public/index.php` — 4 novas rotas

**New files to create:**
- `backend/src/Controllers/CommissionController.php`
  - `summary()` — FR-007: SUM by status with partnerId filter
  - `index()` — FR-006: list with JOIN Client for companyName (role-based)
  - `calculate()` — FR-001/002/003/004/005: batch calculation
  - `pay()` — FR-008: UPDATE status=PAID, paidAt=NOW()

**Files to modify:**
- `backend/public/index.php:60` — add after resource-prices routes:
  - `GET /api/commissions/summary` → summary [auth]
  - `GET /api/commissions` → index [auth]
  - `POST /api/commissions/calculate` → calculate [superadmin]
  - `PUT /api/commissions/:id/pay` → pay [superadmin]

**Reference patterns to copy:**
- `ClientController.php:24-70` — index() role-based filtering with query params
- `PartnerController.php:255-282` — soft-delete pattern (for pay status update)

**Calculate logic (FR-001-005 per handoff.md §6.3):**
```
1. SELECT p.id FROM "Partner" WHERE status='ACTIVE'
2. For each partnerId:
   SELECT c.id, c."planId", i.amount as invoiceAmount, i.id as invoiceId
   FROM "Client" c
   JOIN "Invoice" i ON i."clientId" = c.id
   WHERE c."partnerId" = :pid AND c.status = 'ACTIVE'
   AND i.status = 'PAID'
   AND EXTRACT(MONTH FROM i."dueDate") = :month
   AND EXTRACT(YEAR FROM i."dueDate") = :year
3. For each client: SELECT * FROM "ClientCommissionRule" WHERE "clientId" = :cid
4. Skip if frozenAtUpgrade=true OR (expiresAt IS NOT NULL AND expiresAt < period_start)
5. commissionAmount = invoiceAmount * percentage / 100
6. setupCommission check:
   SELECT COUNT(*) FROM "Commission" WHERE "partnerId" = :pid AND "clientId" = :cid
   → if 0 AND commissionOnSetup=true → setupCommission = setupCommissionAmount
7. UPSERT:
   INSERT INTO "Commission" (...) VALUES (...)
   ON CONFLICT ("partnerId", "clientId", "periodMonth", "periodYear")
   DO UPDATE SET "baseAmount" = EXCLUDED."baseAmount", ...
```

**Migration:** Nenhuma — tabela Commission existe per handoff.md §3.14

**New dependencies:** Nenhuma

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: POST /calculate cria Commission para faturas PAID
- [ ] Manual test — golden path: GET /commissions retorna apenas do parceiro logado
- [ ] Manual test — golden path: GET /summary retorna totais corretos
- [ ] Manual test — edge case: Recálculo do mesmo período não duplica
- [ ] Manual test — edge case: Client com frozenAtUpgrade=true é ignorado
- [ ] Manual test — edge case: Setup commission apenas na primeira vez
- [ ] DB verification: SELECT confirma percentage = ClientCommissionRule.percentage
- [ ] Regression: Clients endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-10: Commissions escolhido como quinta feature (depende de Clients/Invoices para dados)
- 2026-06-10: Implementation complete (4/4 tasks), verification deferred until environment setup
