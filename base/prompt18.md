# Feature: Reordenação de Menus, Funil→Cliente, Editor de Plano,
#           Propostas, Webhook e Correções

## Regras Gerais
- Linguagem: português (variáveis/funções em camelCase pt-BR)
- Arquivo por vez, str_replace cirúrgico
- Parceiro = "parceiro" (nunca "reseller/revendedor")
- Backend é fonte de verdade

---

## FASE 1 — Reordenar abas do portal parceiro

Arquivo: `frontend/partner.html`

Ordem desejada das abas:
  Dashboard | Funil | Meus Clientes | Comissões | Tabela de Preços | Propostas | Meu Perfil

Reordenar os <button data-tab="..."> e os <div id="tab-..."> correspondentes
na mesma sequência.

---

## FASE 2 — SuperAdmin: filtro por parceiro na aba "De Parceiros"

Arquivo: `frontend/superadmin-plans.js` (ou onde estiver a seção de planos de
parceiros no superadmin.js)

Adicionar um <select id="filterPartnerPlans"> acima da tabela de planos de
parceiros com opção "— Todos os parceiros —" mais uma opção por parceiro
(id/name). Ao mudar o select, filtrar a listagem client-side (ou refazer a
chamada GET /plans?ownerId=X se preferir server-side).

---

## FASE 3 — Editor de plano do parceiro: preço auto-calculado e setup correto

Arquivo: `frontend/partner-pricing.js`

### 3a — Preço Mensal (pPlanPreco) → somente leitura, auto-calculado

- Tornar o campo `#pPlanPreco` `readonly` e visualmente não editável
  (cursor-not-allowed, fundo cinza).
- Calcular o valor sempre que houver mudança em módulos ou recursos extras:
    totalMensal = Number(basePlan.totalPrice)
                + Σ (módulos extras marcados × price)
                + Σ (recursos extras × qty × price)
- Atualizar `#pPlanPreco` com esse valor via `_pEditorRecalcular()`.
- Remover o aviso de "preço mínimo" (não faz mais sentido).

### 3b — Setup: separar base (read-only) de acréscimo (editável, sempre zero ao abrir)

Ao **abrir o modal para criar** (criarPlanoBaseadoEm):
  - `pSetupBaseDisplay` = basePlan.setupFee  (já feito, manter)
  - `pPlanSetupExtra.value = 0`              (já feito, manter)

Ao **abrir o modal para editar** (editarMeuPlano):
  - `pSetupBaseDisplay` = basePlan.setupFee   ← valor do plano base (não do plano editado)
  - `pPlanSetupExtra.value = 0`               ← SEMPRE zero ao editar
    (o setupFee salvo no DB = base + acréscimo anterior;
     ao reabrir, o parceiro reconstrói o acréscimo do zero se quiser)

No `salvarPlanoPartner()`:
  - setupFee enviado = setupBase (do basePlan) + setupExtra (do campo)

---

## FASE 4 — Funil: botão "Promover a Cliente" no estágio "Fechado"

### 4a — Backend: POST /funnel/leads/:id/promote

Arquivo: `backend/src/routes/funnel.routes.js`

Novo endpoint:
  POST /api/funnel/leads/:id/promote
  Body: { password, recurrence?, dueDate? }
  - Valida que o lead pertence ao parceiro
  - Valida que o lead tem: name (contactName), email, phone, planId
  - Se company estiver vazio, usa name como companyName
  - Cria o Client normalmente (mesmo fluxo do POST /clients, inclusive
    chamada PacoTicket e ClientCommissionRule)
  - Atualiza lead.status = 'WON'
  - Cria LeadActivity type='NOTE', description='Convertido em cliente'
  - Retorna { success: true, data: { clientId, ... } }

### 4b — Frontend: botão no detalhe do lead (apenas estágio "Fechado")

Arquivo: `frontend/partner-funnel.js`

Em `_renderDetalheContent(lead)`:
  - Verificar se `lead.stage.name === 'Fechado'` (case-insensitive) OU
    criar um campo `isFinalStage` baseado no estágio ser o último antes de
    "Perdido".
  - Se sim, adicionar botão "🎉 Promover a Cliente" na seção de ações.
  - Ao clicar: abrir mini-modal inline com campos:
      Senha (PacoTicket) *
      Recorrência (se canSetRecurrence)
      Vencimento (se canSetDueDate)
  - Submit chama POST /api/funnel/leads/:id/promote
  - Sucesso: fechar modal, _funnelToast('Lead convertido em cliente!'), loadFunnel()

---

## FASE 5 — Propostas: nome do plano opcional + listagem de PDFs

### 5a — Backend: tornar planName nullable

Arquivo: `backend/prisma/schema.prisma`

  planName    String?    ← era String

Rodar: cd backend && npx prisma generate

### 5b — Backend: pdf.routes.js — planName opcional

Arquivo: `backend/src/routes/pdf.routes.js`

  planName: planName || 'Proposta sem título'

### 5c — Frontend: campo nome do plano opcional no simulador

Arquivo: `frontend/partner-simulator.js`

- Remover `required` / validação de nome obrigatório em `simSalvarPlano()`
- Se nome vazio, usar 'Proposta sem título' como fallback para o filename
- Permitir gerar PDF sem salvar plano (botão "📄 Gerar PDF" independente)

### 5d — Frontend: listagem de PDFs no topo da aba Propostas

Arquivo: `frontend/partner-simulator.js`, função `loadSimulator()`

- Antes de renderizar o seletor de planos, buscar GET /api/pdf/proposals
- Renderizar uma seção colapsável "📄 Propostas Geradas" com tabela paginada
  (10 por página):
    | Nome do plano | Lead | Data | Download |
  - Botão de download chama GET /api/pdf/proposals/:id/download
- Se lista vazia, não exibir a seção

### 5e — Frontend: nome do lead em preto na proposta PDF

Arquivo: `frontend/partner-simulator.js`, função `gerarHtmlProposta()`

Localizar onde o nome do lead/plano aparece no HTML gerado e garantir:
  color: #111827  (não branco, não transparente)

---

## FASE 6 — Webhook ao salvar plano

### 6a — Backend: ALLOWED_KEYS

Arquivo: `backend/src/routes/system-config.routes.js`

Adicionar à lista: `'webhookPlanSaved'`

### 6b — SuperAdmin: campo webhook nas Configurações

Arquivo: `frontend/superadmin-config.js`, função `renderSysConfig(cfg)`

Adicionar campo:
  <label>Webhook — Plano Salvo (URL)</label>
  <input type="url" id="cfgWebhookPlanSaved" value="${cfg.webhookPlanSaved || ''}"
    placeholder="https://n8n.exemplo.com/webhook/...">
  <p class="hint">POST disparado ao parceiro salvar um plano personalizado.
  Payload: { event, partnerId, partnerName, plan, lead? }</p>

Incluir `webhookPlanSaved` no `salvarSysConfig()`.

### 6c — Backend: disparar webhook ao criar/editar plano de parceiro

Arquivo: `backend/src/routes/plans.routes.js`

Após criar ou editar um plano com ownerId != null (plano de parceiro):
  1. Buscar SystemConfig onde key = 'webhookPlanSaved'
  2. Se existir e tiver valor, fazer fetch POST assíncrono (fire-and-forget,
     não bloquear a resposta) com body JSON:
     {
       event: 'PLAN_SAVED',
       partnerId: plan.ownerId,
       partnerName: partner.name,
       plan: { id, name, basePrice, totalPrice, setupFee, modules[] },
       timestamp: new Date().toISOString()
     }
  3. Logar erros de webhook no console mas não retornar erro ao cliente

---

## FASE 7 — schema_update.sql

Gerar o arquivo `schema_update_funnel_v2.sql` na raiz do repositório com:

```sql
-- Tornar planName opcional em ProposalPdf
ALTER TABLE "ProposalPdf" ALTER COLUMN "planName" DROP NOT NULL;