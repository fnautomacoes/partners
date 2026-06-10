---
feature: "System Configuration Management"
status: draft
owner: riseon
priority: P0
github_issue: ""
created: 2026-06-10
---

# Feature: System Config

## 1. Context & Motivation

O sistema precisa de configurações centralizadas para white-label (logos, cores, nome da empresa), SMTP e margens de PDF. Configurações públicas são carregadas no login; configurações administrativas incluem credenciais SMTP. SuperAdmin pode testar conexão SMTP antes de salvar.

## 2. User Stories (prioritized)

### US1 — Página de login carrega white-label (P1)

**As a** User, **I want** que a página de login exiba logo e cores da empresa, **so that** o sistema tenha identidade visual customizada.

**Independent test:** GET /api/system-config retorna configurações públicas sem expor SMTP.

**Acceptance Scenarios:**
1. **Given** sistema configurado, **When** GET /system-config, **Then** retorna businessName, logos, cores
2. **Given** chaves SMTP, **When** GET /system-config (público), **Then** chaves SMTP não são expostas

### US2 — SuperAdmin gerencia configurações (P1)

**As a** SuperAdmin, **I want** visualizar e editar todas as configurações, **so that** eu possa customizar o sistema.

**Independent test:** PUT /api/system-config com novas cores, verificar atualização.

**Acceptance Scenarios:**
1. **Given** SuperAdmin autenticado, **When** GET /system-config/admin, **Then** todas as chaves incluindo SMTP
2. **Given** dados válidos, **When** PUT /system-config, **Then** chaves atualizadas

### US3 — SuperAdmin testa conexão SMTP (P2)

**As a** SuperAdmin, **I want** testar a conexão SMTP antes de salvar, **so that** eu possa verificar credenciais.

**Independent test:** POST /api/system-config/smtp-test retorna sucesso ou erro de conexão.

**Acceptance Scenarios:**
1. **Given** credenciais SMTP válidas, **When** POST /smtp-test, **Then** sucesso
2. **Given** credenciais SMTP inválidas, **When** POST /smtp-test, **Then** erro com mensagem

## 3. Non-Goals

- Configurações por parceiro (white-label é global)
- Upload de arquivos de logo (usa URLs externas)
- Histórico de alterações de configuração
- Validação de URLs de logo
- Criptografia de credenciais SMTP no banco

## 4. Functional Requirements

- **FR-001**: System MUST return public config (logos, colors, businessName) without auth
- **FR-002**: System MUST hide SMTP keys from public endpoint
- **FR-003**: System MUST return all config keys on admin endpoint (SuperAdmin only)
- **FR-004**: System MUST allow SuperAdmin to update config keys
- **FR-005**: System MUST validate that only ALLOWED_KEYS can be saved
- **FR-006**: System MUST allow SuperAdmin to test SMTP connection
- **FR-007**: System MUST update updatedAt timestamp on each key update

## 5. Key Entities

- **SystemConfig** — {id, key, value, updatedAt}. UNIQUE on key. Simple key-value store.

## 6. Success Criteria

- **SC-001**: GET /system-config retorna em menos de 100ms
- **SC-002**: 0 chaves SMTP expostas no endpoint público
- **SC-003**: 100% das chaves atualizadas têm updatedAt correto

## 7. Constitution Check

- [x] **P1 Spec Before Code:** Esta spec define a feature antes de implementação
- [x] **P2 Verification Before Claim:** §9 requer testes manuais do golden path e edge cases
- [x] **P3 Anti-Drift:** Spec será atualizada junto com código; §10 Decisions Log presente
- [x] **P4 Concise Specs:** Spec < 250 linhas, Non-Goals em §3, SCs mensuráveis em §6
- [x] **P5 No Tech Debt Shortcuts:** Sem atalhos; ALLOWED_KEYS explícito per FR-005
- [x] **P6 Simplicity First:** Key-value simples; sem ORM complexo; §8 lista patterns
- [x] **P7 Partner Isolation:** N/A — SystemConfig é global, não há dados por parceiro
- [x] **P8 Frozen Production Schema:** Sem ALTER TABLE; usa tabela SystemConfig existente
- [x] **P9 Immutable API Response Contract:** Usa Response::success() e Response::error()
- [x] **P10 External API Fault Tolerance:** FR-006 testa SMTP sem afetar dados; retorna erro

## 8. Technical Plan

**Stack touches:**
- `backend/src/Controllers/` — 1 novo controller (SystemConfigController)
- `backend/src/Services/` — 1 novo service (MailService para smtp-test)
- `backend/public/index.php` — 4 novas rotas

**New files to create:**
- `backend/src/Services/MailService.php`
  - `testConnection()` — conecta SMTP e retorna true/false + mensagem
- `backend/src/Controllers/SystemConfigController.php`
  - `index()` — FR-001/002: public config, filter SMTP keys
  - `admin()` — FR-003: all config (SuperAdmin)
  - `update()` — FR-004/005/007: upsert allowed keys
  - `testSmtp()` — FR-006: test SMTP connection

**Files to modify:**
- `backend/public/index.php` — add system-config routes

**Reference patterns to copy:**
- `ClientController.php:24-70` — index() pattern

**ALLOWED_KEYS constant:**
```php
const ALLOWED_KEYS = [
    'businessName', 'appUrl', 'logoLogin', 'logoInternal', 'logoPdf',
    'favicon', 'logoLoginWidth', 'colorBrandPrimary', 'colorBrandHover',
    'colorBrandMist', 'colorAccent', 'colorPartner', 'colorDarkBase',
    'webhookPlanSaved', 'smtpHost', 'smtpPort', 'smtpMode', 'smtpUser',
    'smtpPass', 'smtpFrom', 'pdfMarginTop', 'pdfMarginBottom',
    'pdfMarginLeft', 'pdfMarginRight',
];
const SMTP_KEYS = ['smtpHost', 'smtpPort', 'smtpMode', 'smtpUser', 'smtpPass', 'smtpFrom'];
```

**Migration:** Nenhuma — tabela SystemConfig existe per handoff.md §3.20

**New dependencies:** Nenhuma (PHPMailer já no composer.json)

## 9. Verification

> **Note:** Verification deferred until environment setup (Docker + PostgreSQL + Redis).

- [ ] Manual test — golden path: GET /system-config retorna cores e logos
- [ ] Manual test — golden path: GET /system-config/admin inclui SMTP
- [ ] Manual test — golden path: PUT /system-config atualiza businessName
- [ ] Manual test — golden path: POST /smtp-test com credenciais válidas
- [ ] Manual test — edge case: GET público não expõe smtpPass
- [ ] Manual test — edge case: PUT com chave não permitida é ignorada
- [ ] DB verification: SELECT confirma updatedAt atualizado
- [ ] Regression: PDF endpoints continuam funcionando

## 10. Decisions Log

- 2026-06-10: System Config escolhido como nona feature (necessário para white-label e email)
- 2026-06-10: Implementation complete (4/4 tasks), verification deferred until environment setup
