---
feature: "Commission Tiers CRUD"
status: draft
owner: riseon
priority: P1
github_issue: ""
created: 2026-06-10
---

# Feature: Commission Tiers

## 1. Context & Motivation

O sistema precisa de gestão de tiers de comissão para que SuperAdmin configure os níveis de comissionamento (Indicador, Parceiro, Master, etc.). Tiers definem o percentual de comissão baseado na quantidade de clientes ativos do parceiro. A lógica de cálculo de tier já existe em CommissionService.

## 2. User Stories (prioritized)

### US1 — SuperAdmin lista tiers de comissão (P1)

**As a** SuperAdmin, **I want** listar todos os tiers de comissão, **so that** eu possa visualizar a estrutura de comissionamento.

**Independent test:** GET /api/commission-tiers retorna array de tiers ordenados por order.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** GET /commission-tiers, **Then** todos os tiers retornados
2. **Given** tiers existentes, **When** GET /commission-tiers, **Then** ordenados por order ASC

### US2 — SuperAdmin cria novo tier (P1)

**As a** SuperAdmin, **I want** criar novos tiers de comissão, **so that** eu possa expandir os níveis de comissionamento.

**Independent test:** POST /api/commission-tiers com dados válidos, verificar tier criado.

**Acceptance Scenarios:**
1. **Given** dados válidos, **When** POST /commission-tiers, **Then** tier criado com id retornado
2. **Given** nome duplicado, **When** POST, **Then** erro ou aceita (sem restrição de unicidade)

### US3 — SuperAdmin edita tier existente (P2)

**As a** SuperAdmin, **I want** editar configurações de um tier, **so that** eu possa ajustar percentuais e regras.

**Independent test:** PUT /api/commission-tiers/:id, verificar campos atualizados.

**Acceptance Scenarios:**
1. **Given** tier existente, **When** PUT com novo percentage, **Then** percentage atualizado
2. **Given** tier inexistente, **When** PUT, **Then** 404 Not Found

### US4 — SuperAdmin remove tier (P2)

**As a** SuperAdmin, **I want** remover tiers não utilizados, **so that** eu possa manter a estrutura limpa.

**Independent test:** DELETE /api/commission-tiers/:id, verificar remoção.

**Acceptance Scenarios:**
1. **Given** tier sem vínculos, **When** DELETE, **Then** tier removido
2. **Given** tier vinculado a ClientCommissionRule, **When** DELETE, **Then** soft-delete (isActive=false)

## 3. Non-Goals

- Cálculo automático de tier ao salvar (feito em CommissionService)
- Recálculo de ClientCommissionRule existentes ao alterar tier
- Validação de sobreposição de faixas minClients/maxClients
- Interface para parceiros visualizarem tiers (apenas SuperAdmin)

## 4. Functional Requirements

- **FR-001**: System MUST list all commission tiers ordered by order ASC
- **FR-002**: System MUST allow SuperAdmin to create tiers with all fields
- **FR-003**: System MUST allow SuperAdmin to update tier fields
- **FR-004**: System MUST allow SuperAdmin to delete tiers (soft-delete if in use)
- **FR-005**: System MUST update updatedAt on tier modification
- **FR-006**: System MUST validate percentage is between 0 and 100

## 5. Key Entities

- **CommissionTier** — {id, name, minClients, maxClients, percentage, supportMode, notes, durationMonths, isActive, order, acceptNewClients, commissionOnSetup, setupCommissionPct, createdAt, updatedAt}

## 6. Success Criteria

- **SC-001**: GET /commission-tiers retorna em menos de 100ms
- **SC-002**: 100% das operações de escrita atualizam updatedAt
- **SC-003**: Soft-delete preserva 100% dos tiers com vínculos

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; soft-delete preserva dados per FR-004/SC-003
- [x] **P6 Simplicity First:** CRUD padrão; §8 usa patterns existentes
- [x] **P7 Partner Isolation:** N/A — CommissionTier é global, gerenciado apenas por SuperAdmin
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabela CommissionTier existente
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** N/A — feature CRUD local sem integração externa

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (CommissionTierController)
- `backend/public/index.php` — 4 novas rotas

**New files to create:**
- `backend/src/Controllers/CommissionTierController.php`
  - `index()` — FR-001: list tiers ORDER BY order ASC
  - `store()` — FR-002/005/006: create tier with validation
  - `update()` — FR-003/005/006: update tier fields
  - `destroy()` — FR-004: delete or soft-delete if in use

**Files to modify:**
- `backend/public/index.php` — add commission-tiers routes

**Reference patterns to copy:**
- `PlanController.php:100-150` — store() with validation
- `PartnerController.php:255-282` — soft-delete pattern

**Soft-delete check (FR-004):**
```php
SELECT COUNT(*) FROM "ClientCommissionRule" WHERE "tierConfigId" = :id
→ if > 0: UPDATE isActive = false
→ else: DELETE
```

**Migration:** Nenhuma — tabela CommissionTier existe per handoff.md §3.9

**New dependencies:** Nenhuma

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: GET /commission-tiers lista tiers ordenados
- [ ] Manual test — golden path: POST cria tier com percentage válido
- [ ] Manual test — golden path: PUT atualiza tier existente
- [ ] Manual test — golden path: DELETE remove tier sem vínculos
- [ ] Manual test — edge case: DELETE tier com vínculos → soft-delete
- [ ] Manual test — edge case: POST com percentage > 100 → erro
- [ ] DB verification: SELECT confirma order correto
- [ ] Regression: Commissions endpoints funcionam

## 10. Decisions Log

- 2026-06-10: Commission Tiers escolhido como décima primeira feature (completa gestão de comissões)
- 2026-06-10: Implementation complete (2/2 tasks), verification deferred until environment setup
