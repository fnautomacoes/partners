---
feature: "Plans & Pricing CRUD"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-09
---

# Feature: Plans & Pricing Management

## 1. Context & Motivation

O sistema precisa de gestão de planos e preços para que SuperAdmin configure pacotes de serviço e parceiros criem planos customizados baseados nos globais. Módulos e recursos têm preços unitários que compõem o preço final dos planos. Sem essa funcionalidade, não é possível cadastrar clientes com planos definidos.

## 2. User Stories (prioritized)

### US1 — SuperAdmin gerencia planos globais (P1)

**As a** SuperAdmin, **I want** criar, editar, listar e desativar planos globais, **so that** parceiros possam usar como base para seus clientes.

**Independent test:** Criar plano global via API, listar, verificar se aparece para parceiros.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** POST /api/plans com dados válidos, **Then** plano criado com id retornado
2. **Given** plano existente, **When** DELETE /api/plans/:id, **Then** plano marcado isActive=false (soft delete)

### US2 — SuperAdmin configura preços de módulos e recursos (P1)

**As a** SuperAdmin, **I want** configurar preços unitários de módulos e recursos, **so that** o cálculo de preço dos planos seja dinâmico.

**Independent test:** PUT /api/plans/modules/prices, verificar novo preço na listagem.

**Acceptance Scenarios:**
1. **Given** moduleKey existente, **When** PUT com novo price, **Then** preço atualizado
2. **Given** módulo em uso por plano, **When** DELETE, **Then** módulo apenas ocultado (isVisible=false)

### US3 — Parceiro cria planos customizados (P2)

**As a** Partner, **I want** criar meus próprios planos baseados em módulos disponíveis, **so that** eu possa oferecer pacotes personalizados aos meus clientes.

**Independent test:** POST /api/plans/partner como parceiro, verificar ownerId = partnerId do JWT.

**Acceptance Scenarios:**
1. **Given** parceiro autenticado, **When** POST /api/plans/partner, **Then** plano criado com ownerId = partnerId
2. **Given** plano de outro parceiro, **When** tentativa de edição, **Then** 403 Forbidden

## 3. Non-Goals

- Integração com PacoTicket API para sincronização de planos (planos são 100% internos)
- Cálculo automático de totalPrice no backend (frontend envia valor calculado)
- Histórico de alterações de preços
- Aprovação de planos de parceiros por SuperAdmin

## 4. Functional Requirements

- **FR-001**: System MUST list all plans (SuperAdmin: all; Partner: global active + own active)
- **FR-002**: System MUST allow SuperAdmin to create global plans (ownerId = NULL)
- **FR-003**: System MUST allow SuperAdmin to update plan details including addons
- **FR-004**: System MUST soft-delete plans (set isActive = false)
- **FR-005**: System MUST allow reordering plans via PUT /api/plans/reorder
- **FR-006**: System MUST list module prices (SuperAdmin: all; Partner: isVisible = true)
- **FR-007**: System MUST allow SuperAdmin to upsert module prices in batch
- **FR-008**: System MUST hide (not delete) modules in use when "deleted"
- **FR-009**: System MUST list resource prices
- **FR-010**: System MUST allow SuperAdmin to update resource prices in batch
- **FR-011**: System MUST allow Partner to create own plans with ownerId from JWT
- **FR-012**: System MUST allow Partner to update/delete only own plans (ownerId = partnerId)
- **FR-013**: System MUST return plan details with addons on GET /api/plans/:id

## 5. Key Entities

- **Plan** — {id, name, basePrice, totalPrice, setupFee, ownerId, basePlanId, modules*, resources*, isActive}. ownerId NULL = global.
- **ModulePrice** — {moduleKey, label, price, setupFee, isVisible, description}. Preço unitário de módulos.
- **ResourcePrice** — {key, label, price, setupFee, isVisible, sortOrder}. Preço de recursos extras.
- **PlanAddon** — {planId, addonType, key, discountPct, overridePrice}. Override de preço em plano específico.

## 6. Success Criteria

- **SC-001**: SuperAdmin consegue criar plano global em menos de 2 segundos
- **SC-002**: Listagem de planos retorna em menos de 500ms para até 100 planos
- **SC-003**: 100% dos planos criados por parceiro têm ownerId = partnerId do JWT (P7 compliance)
- **SC-004**: Soft-delete preserva 100% dos dados históricos do plano

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; soft-delete preserva dados (FR-004, SC-004)
- [x] **P6 Simplicity First:** Reutiliza padrões de PartnerController; §8 lista reference patterns
- [x] **P7 Partner Isolation:** FR-011 e FR-012 extraem partnerId do JWT; SC-003 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabelas existentes per handoff.md
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error() existentes
- [x] **P10 External API Fault Tolerance:** Non-Goal explicita que não há integração externa para planos

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 3 novos controllers
- `backend/public/index.php` — 15 novas rotas

**New files to create:**
- `backend/src/Controllers/PlanController.php`
  - `index()` — FR-001: lista planos (role-based filtering)
  - `show()` — FR-013: detalhe com addons
  - `store()` — FR-002: cria plano global (SuperAdmin)
  - `update()` — FR-003: atualiza plano + addons
  - `destroy()` — FR-004: soft-delete
  - `reorder()` — FR-005: atualiza sortOrder em lote
  - `storePartner()` — FR-011: parceiro cria plano próprio (ownerId = JWT)
  - `updatePartner()` — FR-012: parceiro edita próprio plano
  - `destroyPartner()` — FR-012: parceiro soft-delete próprio plano
- `backend/src/Controllers/ModulePriceController.php`
  - `index()` — FR-006: lista preços de módulos
  - `upsert()` — FR-007: upsert em lote
  - `destroy()` — FR-008: oculta ou deleta módulo
- `backend/src/Controllers/ResourcePriceController.php`
  - `index()` — FR-009: lista preços de recursos
  - `update()` — FR-010: atualiza em lote

**Files to modify:**
- `backend/public/index.php:28` — adicionar após Partner routes:
  - `GET /api/plans` → index [auth]
  - `GET /api/plans/:id` → show [auth]
  - `POST /api/plans` → store [superadmin]
  - `PUT /api/plans/:id` → update [superadmin]
  - `DELETE /api/plans/:id` → destroy [superadmin]
  - `PUT /api/plans/reorder` → reorder [superadmin]
  - `POST /api/plans/partner` → storePartner [auth]
  - `PUT /api/plans/partner/:id` → updatePartner [auth]
  - `DELETE /api/plans/partner/:id` → destroyPartner [auth]
  - `GET /api/plans/modules/prices` → ModulePriceController::index [auth]
  - `PUT /api/plans/modules/prices` → upsert [superadmin]
  - `DELETE /api/plans/modules/prices/:moduleKey` → destroy [superadmin]
  - `GET /api/resource-prices` → ResourcePriceController::index [auth]
  - `PUT /api/resource-prices` → update [superadmin]

**Reference patterns to copy:**
- `PartnerController.php:22-58` — index() com role-based data
- `PartnerController.php:93-122` — transação com gen_random_uuid()
- `PartnerController.php:185-232` — update dinâmico com params array
- `PartnerController.php:255-282` — soft-delete pattern

**Migration:** Nenhuma — tabelas já existem per handoff.md §3.5-3.8

**New dependencies:** Nenhuma

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: SuperAdmin cria plano, lista, edita, soft-delete
- [ ] Manual test — golden path: PUT module prices, GET lista atualizada
- [ ] Manual test — golden path: Partner cria plano próprio, verifica ownerId
- [ ] Manual test — edge case: Partner tenta editar plano de outro → 403
- [ ] Manual test — edge case: DELETE módulo em uso → isVisible=false, não deletado
- [ ] DB verification: SELECT de planos confirma ownerId correto
- [ ] Regression: Auth endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-09: Plans & Pricing escolhido como terceira feature (depende de Partners, necessário para Clients)
- 2026-06-10: Implementation complete (6/6 tasks), verification deferred until environment setup
