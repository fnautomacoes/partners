---
feature: "Client Management CRUD with PacoTicket Integration"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-10
---

# Feature: Client Management

## 1. Context & Motivation

O sistema precisa de gestão de clientes para que parceiros cadastrem empresas que utilizam o PacoTicket. Clientes são vinculados a planos e geram comissões para seus parceiros. A criação de cliente deve sincronizar com a API PacoTicket (tolerante a falha) e registrar regras de comissão imutáveis no momento da ativação.

## 2. User Stories (prioritized)

### US1 — Partner gerencia seus clientes (P1)

**As a** Partner, **I want** criar, listar e editar meus clientes, **so that** eu possa gerenciar as empresas que indico para o PacoTicket.

**Independent test:** POST /api/clients com dados válidos, verificar cliente criado com partnerId do JWT.

**Acceptance Scenarios:**
1. **Given** Partner autenticado, **When** POST /api/clients com plano válido, **Then** cliente criado com partnerId = JWT.partnerId
2. **Given** cliente existente do parceiro, **When** GET /api/clients, **Then** apenas clientes do próprio parceiro são listados
3. **Given** cliente existente, **When** PUT /api/clients/:id, **Then** dados atualizados no banco

### US2 — Criação de cliente registra regra de comissão (P1)

**As a** System, **I want** criar ClientCommissionRule automaticamente na criação do cliente, **so that** a comissão do parceiro fique travada no tier vigente.

**Independent test:** Criar cliente, verificar ClientCommissionRule com tier e percentage corretos.

**Acceptance Scenarios:**
1. **Given** parceiro com 2 clientes ACTIVE (tier Indicador), **When** cria terceiro cliente, **Then** CommissionRule criada com tier calculado
2. **Given** CommissionRule criada, **When** parceiro sobe de tier, **Then** regra anterior não é alterada (imutável)

### US3 — Integração PacoTicket tolerante a falha (P2)

**As a** System, **I want** criar cliente na API PacoTicket, **so that** a empresa seja provisionada na plataforma.

**Independent test:** POST /api/clients, verificar que falha na API externa não cancela criação local.

**Acceptance Scenarios:**
1. **Given** API PacoTicket disponível, **When** cria cliente, **Then** pacoticketId salvo no banco
2. **Given** API PacoTicket indisponível, **When** cria cliente, **Then** cliente criado com pacoticketId = NULL, erro logado

### US4 — SuperAdmin gerencia todos os clientes (P2)

**As a** SuperAdmin, **I want** listar, filtrar e soft-delete clientes de qualquer parceiro, **so that** eu possa administrar o sistema.

**Independent test:** GET /api/clients como SuperAdmin retorna clientes de todos os parceiros.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** GET /api/clients?partnerId=X, **Then** apenas clientes do parceiro X
2. **Given** cliente ativo, **When** DELETE /api/clients/:id, **Then** status = INACTIVE (soft delete)

## 3. Non-Goals

- Bulk import de clientes (feature separada)
- Migração de cliente entre parceiros
- Sincronização retroativa com PacoTicket (retry manual)
- Gestão de faturas (spec separada)
- Edição de ClientCommissionRule após criação (regra é imutável)

## 4. Functional Requirements

- **FR-001**: System MUST list clients (Partner: own; SuperAdmin: all with filters)
- **FR-002**: System MUST allow Partner to create client with partnerId from JWT
- **FR-003**: System MUST create ClientCommissionRule on client creation with current tier
- **FR-004**: System MUST integrate with PacoTicket API on create (fault-tolerant)
- **FR-005**: System MUST allow update of client contact info
- **FR-006**: System MUST mirror updates to PacoTicket if pacoticketId exists
- **FR-007**: System MUST allow SuperAdmin to soft-delete clients
- **FR-008**: System MUST return client with plan, addons, and commission rule on GET :id
- **FR-009**: System MUST validate plan is active before creating client
- **FR-010**: System MUST allow CRUD of ClientAddon for a client

## 5. Key Entities

- **Client** — {id, partnerId, planId, companyName, contactName, email, phone, recurrence, dueDate, status, pacoticketId}. Belongs to Partner, has one Plan.
- **ClientCommissionRule** — {clientId, partnerId, tierName, percentage, commissionOnSetup, setupCommissionPct}. Created once, never updated.
- **ClientAddon** — {clientId, addonType, key, quantity, unitPrice, discountPct, setupFee}. Extra modules/resources for client.

## 6. Success Criteria

- **SC-001**: Partner consegue criar cliente em menos de 3 segundos (excluindo latência PacoTicket)
- **SC-002**: 100% dos clientes criados têm ClientCommissionRule com tier correto
- **SC-003**: 100% dos clientes de parceiro têm partnerId = JWT.partnerId (P7 compliance)
- **SC-004**: Falha na API PacoTicket resulta em 0% de rollback local (tolerância total)
- **SC-005**: Listagem de clientes retorna em menos de 500ms para até 200 clientes

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; CommissionRule imutável per FR-003/Non-Goal
- [x] **P6 Simplicity First:** Reutiliza CommissionService existente; §8 lista patterns de PlanController
- [x] **P7 Partner Isolation:** FR-001 e FR-002 extraem partnerId do JWT; SC-003 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabelas existentes per handoff.md
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error() existentes
- [x] **P10 External API Fault Tolerance:** FR-004 e SC-004 garantem tolerância; Non-Goal exclui retry

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (ClientController)
- `backend/src/Services/` — 1 novo service (PacoTicketApiService)
- `backend/public/index.php` — 9 novas rotas

**New files to create:**
- `backend/src/Controllers/ClientController.php`
  - `index()` — FR-001: lista clientes (PARTNER: own via JWT; SUPERADMIN: all + filters ?partnerId, ?status, ?planId)
  - `show()` — FR-008: JOIN Plan, LEFT JOIN ClientAddon, LEFT JOIN ClientCommissionRule
  - `store()` — FR-002/003/004/009: transação (Client → CommissionRule → PacoTicket try/catch)
  - `update()` — FR-005/006: atualiza + conditionally mirror to PacoTicket
  - `destroy()` — FR-007: soft-delete (superadmin middleware)
  - `indexAddons()` — FR-010: SELECT * FROM "ClientAddon" WHERE "clientId"
  - `storeAddon()` — FR-010: INSERT with gen_random_uuid()
  - `updateAddon()` — FR-010: UPDATE + ownership check
  - `destroyAddon()` — FR-010: DELETE
- `backend/src/Services/PacoTicketApiService.php`
  - `createCompany($data)` — POST `{PACOTICKET_API_URL}/companies/add`, Bearer auth, returns pacoticketId or null
  - `updateCompany($id, $data)` — PUT `{PACOTICKET_API_URL}/companies/{$id}`
  - Uses `curl_init()` — no new dependency

**Files to modify:**
- `backend/public/index.php:35` — add after plan routes:
  - `GET /api/clients` → index [auth]
  - `POST /api/clients` → store [auth]
  - `GET /api/clients/:id` → show [auth]
  - `PUT /api/clients/:id` → update [auth]
  - `DELETE /api/clients/:id` → destroy [superadmin]
  - `GET /api/clients/:id/addons` → indexAddons [auth]
  - `POST /api/clients/:id/addons` → storeAddon [auth]
  - `PUT /api/clients/:id/addons/:addonId` → updateAddon [auth]
  - `DELETE /api/clients/:id/addons/:addonId` → destroyAddon [auth]

**Reference patterns to copy:**
- `PlanController.php:27-50` — index() role-based filtering pattern
- `PlanController.php:255-295` — storePartner() with partnerId from JWT
- `PartnerController.php:255-282` — soft-delete (status = INACTIVE)
- `CommissionService.php:11-54` — calculateTier() for FR-003

**Store logic (FR-002/003/004):**
1. Validate plan active (`SELECT "isActive" FROM "Plan" WHERE id = :planId`)
2. Extract partnerId from JWT (P7)
3. `BEGIN`
4. `INSERT INTO "Client"` with gen_random_uuid()
5. Call `CommissionService::calculateTier($partnerId)` — get tier after this client
6. `INSERT INTO "ClientCommissionRule"` with tier snapshot
7. `COMMIT`
8. Try PacoTicketApiService::createCompany() — on failure: log to ActivityLog, leave pacoticketId NULL
9. If success: `UPDATE "Client" SET "pacoticketId" = :id`

**PacoTicket payload (per handoff.md §7.3):**
```php
['name' => $companyName, 'namecomplete' => $contactName, 'email' => $email,
 'phone' => $phone, 'pais' => 'BR', 'indicator' => $partnerId,
 'status' => true, 'dueDate' => date('Y/m/d', strtotime($dueDate)),
 'recurrence' => RECURRENCE_MAP[$recurrence], 'password' => $password,
 'planId' => $plan['pacoticketPlanId']]
```

**Recurrence mapping:** MONTHLY→monthly, QUARTERLY→quarterly, SEMIANNUAL→semiannual, ANNUAL→annual

**Migration:** Nenhuma — tabelas Client, ClientAddon, ClientCommissionRule existem per handoff.md §3.10-3.12

**New dependencies:** Nenhuma (usa curl nativo)

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: Partner cria cliente, lista, edita
- [ ] Manual test — golden path: Criação gera ClientCommissionRule com tier correto
- [ ] Manual test — edge case: API PacoTicket falha → cliente criado sem pacoticketId
- [ ] Manual test — edge case: Partner tenta listar clientes de outro → lista vazia
- [ ] Manual test — edge case: Criar cliente com plano inativo → 400
- [ ] DB verification: SELECT confirma partnerId = JWT para todos clientes do parceiro
- [ ] DB verification: SELECT confirma CommissionRule existe para cada cliente
- [ ] Regression: Plans endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-10: Clients escolhido como quarta feature (depende de Plans, necessário para Commissions)
- 2026-06-10: Implementation complete (7/7 tasks), verification deferred until environment setup
