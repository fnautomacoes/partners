---
feature: "Funnel CRM for Lead Management"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-10
---

# Feature: Funnel CRM

## 1. Context & Motivation

O sistema precisa de gestão de leads para que parceiros acompanhem prospects através de um funil de vendas configurável. Leads podem ser promovidos a clientes quando fechados. Estágios são criados automaticamente no primeiro acesso e podem ser customizados pelo parceiro.

## 2. User Stories (prioritized)

### US1 — Partner gerencia estágios do funil (P1)

**As a** Partner, **I want** gerenciar os estágios do meu funil de vendas, **so that** eu possa customizar o fluxo de acordo com meu processo.

**Independent test:** GET /api/funnel/stages pela primeira vez cria 6 estágios padrão automaticamente.

**Acceptance Scenarios:**
1. **Given** Partner sem estágios, **When** GET /stages, **Then** 6 estágios padrão criados automaticamente
2. **Given** estágio existente, **When** PUT /stages/:id, **Then** nome/cor/ordem atualizados
3. **Given** estágio com leads, **When** DELETE, **Then** leads movidos para próximo estágio

### US2 — Partner gerencia leads (P1)

**As a** Partner, **I want** criar, listar e editar leads, **so that** eu possa acompanhar prospects no funil.

**Independent test:** POST /api/funnel/leads cria lead com partnerId do JWT.

**Acceptance Scenarios:**
1. **Given** Partner autenticado, **When** POST /leads, **Then** lead criado com partnerId = JWT.partnerId
2. **Given** lead existente, **When** PUT com stageId diferente, **Then** atividade STAGE_CHANGE registrada
3. **Given** leads de outro parceiro, **When** GET /leads, **Then** não aparecem na lista

### US3 — Partner registra atividades em leads (P2)

**As a** Partner, **I want** registrar notas e atividades em leads, **so that** eu tenha histórico de interações.

**Independent test:** POST /api/funnel/leads/:id/activities cria atividade com type e content.

**Acceptance Scenarios:**
1. **Given** lead existente, **When** POST /activities com type NOTE, **Then** atividade criada
2. **Given** mudança de estágio, **When** PUT /leads/:id com novo stageId, **Then** atividade STAGE_CHANGE automática

### US4 — Partner promove lead a cliente (P2)

**As a** Partner, **I want** converter um lead em cliente, **so that** o prospect se torne um cliente ativo.

**Independent test:** POST /api/funnel/leads/:id/promote cria Client e marca lead como WON.

**Acceptance Scenarios:**
1. **Given** lead com email/phone/planId, **When** POST /promote, **Then** Client criado com CommissionRule
2. **Given** lead sem email, **When** POST /promote, **Then** erro 400 com campos faltantes
3. **Given** promote bem sucedido, **When** verifica lead, **Then** status = WON

## 3. Non-Goals

- Integração com email/WhatsApp para envio automático
- Importação em massa de leads
- Múltiplos funis por parceiro (apenas um funil)
- Automação de movimentação entre estágios
- Dashboard de métricas do funil (feature separada)

## 4. Functional Requirements

- **FR-001**: System MUST create 6 default stages on first GET /stages (Novo Lead → Perdido)
- **FR-002**: System MUST allow Partner to CRUD stages with name, color, order
- **FR-003**: System MUST move leads to next stage when deleting a stage with leads
- **FR-004**: System MUST error when deleting the last stage
- **FR-005**: System MUST allow Partner to CRUD leads with partnerId from JWT
- **FR-006**: System MUST filter leads by stageId and status
- **FR-007**: System MUST auto-register STAGE_CHANGE activity on lead stageId update
- **FR-008**: System MUST allow Partner to add/list activities on leads
- **FR-009**: System MUST promote lead to client (create Client + CommissionRule + PacoTicket)
- **FR-010**: System MUST validate lead has email, phone, planId before promote
- **FR-011**: System MUST mark lead as WON after successful promote

## 5. Key Entities

- **FunnelStage** — {id, partnerId, name, color, order, isDefault}. UNIQUE on (partnerId, order).
- **Lead** — {id, partnerId, stageId, planId, name, company, email, phone, notes, value, status}
- **LeadActivity** — {id, leadId, type, content, createdAt}. Types: NOTE, STAGE_CHANGE, PDF_SENT, CALL, EMAIL, WHATSAPP.

## 6. Success Criteria

- **SC-001**: Primeiro acesso GET /stages cria 6 estágios em menos de 500ms
- **SC-002**: 100% dos leads têm partnerId = JWT.partnerId (P7 compliance)
- **SC-003**: 100% das mudanças de estágio geram atividade STAGE_CHANGE
- **SC-004**: Promote de lead cria Client com CommissionRule em menos de 3 segundos

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; promote reutiliza lógica de ClientController
- [x] **P6 Simplicity First:** Reutiliza CommissionService e PacoTicketApiService; §8 lista patterns
- [x] **P7 Partner Isolation:** FR-005 extrai partnerId do JWT; SC-002 verifica compliance
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabelas existentes per handoff.md
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** FR-009 usa PacoTicket com tolerância (como ClientController)

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (FunnelController)
- `backend/public/index.php` — 11 novas rotas

**New files to create:**
- `backend/src/Controllers/FunnelController.php`
  - `indexStages()` — FR-001/002: list stages, auto-create if empty
  - `storeStage()` — FR-002: create stage with partnerId from JWT
  - `updateStage()` — FR-002: update stage (name, color, order)
  - `destroyStage()` — FR-003/004: delete stage, move leads or error
  - `indexLeads()` — FR-005/006: list leads with filters
  - `storeLead()` — FR-005: create lead with partnerId from JWT
  - `showLead()` — FR-005: get lead with stage, plan, activities
  - `updateLead()` — FR-005/007: update lead, auto-register STAGE_CHANGE
  - `destroyLead()` — FR-005: delete lead (CASCADE activities)
  - `indexActivities()` — FR-008: list activities for lead
  - `storeActivity()` — FR-008: create activity
  - `promote()` — FR-009/010/011: convert lead to client

**Files to modify:**
- `backend/public/index.php` — add funnel routes

**Reference patterns to copy:**
- `ClientController.php:24-70` — index() role-based filtering
- `ClientController.php:130-280` — store() with transaction + CommissionRule + PacoTicket

**Default stages (FR-001):**
1. Novo Lead (order: 0, isDefault: true, color: #6366f1)
2. Em Contato (order: 1)
3. Proposta Enviada (order: 2)
4. Negociação (order: 3)
5. Fechado (order: 4)
6. Perdido (order: 5)

**Migration:** Nenhuma — tabelas FunnelStage, Lead, LeadActivity existem per handoff.md §3.17-3.19

**New dependencies:** Nenhuma

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: GET /stages cria 6 estágios padrão
- [ ] Manual test — golden path: Partner cria lead, move entre estágios
- [ ] Manual test — golden path: POST /activities registra nota
- [ ] Manual test — golden path: POST /promote converte lead em cliente
- [ ] Manual test — edge case: DELETE estágio com leads → move para próximo
- [ ] Manual test — edge case: DELETE último estágio → erro LAST_STAGE
- [ ] Manual test — edge case: Promote sem email → erro 400
- [ ] DB verification: SELECT confirma partnerId = JWT para leads
- [ ] DB verification: SELECT confirma STAGE_CHANGE em LeadActivity
- [ ] Regression: Clients endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-10: Funnel CRM escolhido como sétima feature (complementa gestão de parceiros)
- 2026-06-10: Implementation complete (5/5 tasks), verification deferred until environment setup
