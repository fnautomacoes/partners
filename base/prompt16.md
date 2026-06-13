# Fix Cirúrgico — Tabela de Preços, Simulador e PDF do Parceiro

## Contexto

Correções específicas em `partner-pricing.js`, `partner-simulator.js` e na função `gerarHtmlProposta`. Nenhuma alteração de backend necessária.

**Regras absolutas:**
- Um arquivo por vez — `str_replace` cirúrgico
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- Não altere arquivos de infraestrutura

---

## FASE 1 — Diagnóstico antes de qualquer edição

```bash
# 1. Ver estrutura atual do modal de edição de plano
grep -n "editarPlanoProprioModal\|salvarEdicaoPlano\|modalEditarPlano\|setupExtra\|baseModuleKeys" \
  /home/user/parceiros/frontend/partner-pricing.js | head -30

# 2. Ver estrutura dos avisos no simulador
grep -n "tierDuration\|duracaoMsg\|setupComissionado\|_tierAvisoHTML\|temDuracao\|notice-amber\|notice-blue" \
  /home/user/parceiros/frontend/partner-simulator.js | head -30

# 3. Ver avisos na tabela de preços
grep -n "_tierAvisoHTML\|durationMonths\|setupComission\|Aviso\|notice" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20

# 4. Ver função gerarHtmlProposta — confirmar o que aparece hoje
grep -n "comiss\|setup\|acréscimo\|Comiss\|commission\|setupComm\|setupExtra" \
  /home/user/parceiros/frontend/partner-simulator.js | grep -i "gerarHtml\|proposta\|comm-row\|commission-box" | head -20

# 5. Ver onde _simTierDuration é declarado e usado
grep -n "_simTierDuration\|tierDuration\|durationMonths" \
  /home/user/parceiros/frontend/partner-simulator.js | head -15
```

---

## FASE 2 — Fix: Modal de edição de plano (sem valores base, só acréscimos)

O modal de edição deve deixar claro ao parceiro:
- Valores base do plano são fixos e informativos (não editáveis)
- Só o acréscimo de setup é editável em termos de comissão
- Adicionar módulos/recursos extra reflete no preço; remover itens base não remove do preço

### 2.1 — Localizar o bloco de composição do plano base no modal

```bash
sed -n '/renderEditModal\|function editarPlano/,/^}/p' \
  /home/user/parceiros/frontend/partner-pricing.js | head -120
```

### 2.2 — Corrigir o texto explicativo do campo de setup

Localize o bloco do campo de acréscimo de setup no modal e substitua o label e a descrição para deixar claro que é exclusivamente sobre comissão:

```javascript
// Encontrar este trecho no modal (aproximado):
// "Acréscimo de Taxa de Setup"

// Substituir a descrição do campo por:
`<p class="text-sm font-semibold text-amber-800">Acréscimo de Setup — Base de Comissão de Ativação</p>
<p class="text-xs text-amber-700 mt-0.5 leading-relaxed">
  O setup base do plano é <strong>${formatCurrency(baseSetupFee)}</strong> (já incluído, não editável).
  Se quiser receber comissão de ativação, informe um acréscimo abaixo.
  <strong>Somente esse acréscimo gera comissão para você.</strong>
  O valor total de setup cobrado do cliente será a soma dos dois.
</p>`
```

### 2.3 — Garantir que itens da base aparecem como somente leitura com visual claro

Na seção de composição do plano base, cada item deve ter um badge "Incluído no plano" e não ter nenhum controle de edição de preço:

```javascript
// Na grid de infraestrutura do plano base, cada item-card deve mostrar:
// - ícone + nome
// - "incluso no plano base" em cinza
// - SEM nenhum campo de preço editável
// - SEM botão de remover

// Exemplo correto para um item de infraestrutura:
`<div class="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
  <span class="text-blue-500">👤</span>
  <div>
    <p class="text-xs font-semibold text-blue-800">${(basePlan||plan).users} Usuário(s)</p>
    <p class="text-xs text-blue-400 font-medium">incluso no plano · não editável</p>
  </div>
</div>`

// Módulos da base também como somente leitura:
`<div class="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
  <span class="text-green-500 text-xs">✓</span>
  <div>
    <p class="text-xs font-semibold text-gray-700">${m.label||m.key}</p>
    <p class="text-xs text-gray-400">incluso · não editável</p>
  </div>
</div>`
```

### 2.4 — Corrigir o aviso no resumo de preço do modal

O resumo deve explicar que remover itens da base não afeta o preço:

```javascript
// No rodapé do resumo de preço (bg-gray-900), adicionar nota abaixo do total:
`<p class="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-700 leading-relaxed">
  ℹ️ O preço base é fixo e inclui todos os itens do plano original.
  Módulos e recursos extras adicionados acima são somados ao total.
  A remoção de itens da base não altera o preço.
</p>`
```

---

## FASE 3 — Fix: Avisos na seção "Regras de Comissionamento" da Tabela de Preços

### 3.1 — Localizar a função `_tierAvisoHTML` em `partner-pricing.js`

```bash
grep -n "_tierAvisoHTML\|function.*tier.*HTML\|function.*aviso" \
  /home/user/parceiros/frontend/partner-pricing.js
```

### 3.2 — Substituir `_tierAvisoHTML()` pela versão com dois avisos distintos

Use `str_replace` para substituir a função inteira:

```javascript
function _tierAvisoHTML() {
  const tier = _partnerTier;
  if (!tier) return '';
  const temDuracao = (tier.durationMonths || 0) > 0;

  return `
  <div class="space-y-3">

    <!-- Aviso 1: Comissão de setup -->
    <div class="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
      <span class="text-xl flex-shrink-0 mt-0.5">💡</span>
      <div>
        <p class="text-sm font-semibold text-blue-800 mb-1">
          Quando você recebe comissão de setup
        </p>
        <p class="text-xs text-blue-700 leading-relaxed">
          Você recebe comissão de ativação <strong>somente</strong> quando define uma taxa de setup
          própria <strong>no momento da criação do plano personalizado</strong>.
          Em todas as demais ativações, o comissionamento é
          <strong>apenas sobre a mensalidade</strong>, quando aplicável ao seu tier.
        </p>
      </div>
    </div>

    <!-- Aviso 2: Duração do comissionamento -->
    <div class="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <span class="text-xl flex-shrink-0 mt-0.5">⏱️</span>
      <div>
        <p class="text-sm font-semibold text-amber-800 mb-1">
          Por quanto tempo você recebe comissão — Tier ${tier.name}
        </p>
        <p class="text-xs text-amber-700 leading-relaxed">
          ${temDuracao
            ? `Seu tier atual gera comissão por <strong>${tier.durationMonths} meses</strong>
               a partir do cadastro de cada cliente. Após esse período,
               o cliente não gera mais comissão para você.`
            : `Seu tier atual gera comissão por <strong>tempo indeterminado</strong>,
               sem prazo de expiração.`
          }
        </p>
        ${temDuracao ? `
        <div class="mt-2 pt-2 border-t border-amber-200">
          <p class="text-xs text-amber-800 font-semibold leading-relaxed">
            ⚠️ Clientes adquiridos enquanto você está neste tier
            <strong>não gerarão comissão</strong> caso você faça upgrade de tier.
            A regra de comissão é travada na época do cadastro de cada cliente —
            o upgrade não muda retroativamente as regras dos clientes já cadastrados.
          </p>
        </div>` : ''}
      </div>
    </div>

  </div>`;
}
```

---

## FASE 4 — Fix: Avisos e duração no Simulador

### 4.1 — Garantir que `_simTierDuration` está declarado e carregado

```bash
grep -n "let _simTierDuration\|_simTierDuration\s*=" \
  /home/user/parceiros/frontend/partner-simulator.js | head -10
```

Se não existir a declaração no escopo do módulo, use `str_replace` para adicionar junto com as outras variáveis de módulo:

```javascript
// Junto com: let _simPlans = []; let _simModules = []; etc.
let _simTierDuration = 0;
```

Se não estiver sendo carregado no `loadSimulator()`, adicionar:

```javascript
// Após: _simTierPct = rDash?.data?.tier?.percentage || 15;
_simTierDuration = rDash?.data?.tier?.durationMonths ?? 0;
```

### 4.2 — Localizar os blocos de aviso atuais no `simResumo` e substituí-los

```bash
grep -n "notice-amber\|notice-blue\|duracaoMsg\|setupComissionadoMsg\|⏱️\|💡" \
  /home/user/parceiros/frontend/partner-simulator.js | head -20
```

Localize os dois blocos de aviso dentro do template do `resumoEl.innerHTML` e substitua com `str_replace`:

```javascript
// SUBSTITUIR os blocos de aviso existentes por:

// Bloco de duração do comissionamento
`<div class="flex gap-2.5 bg-amber-900/40 border border-amber-600/50 rounded-xl p-3 mb-3">
  <span class="text-base flex-shrink-0">⏱️</span>
  <div>
    <p class="text-xs text-amber-200 font-semibold mb-1">
      Por quanto tempo você recebe comissão
    </p>
    <p class="text-xs text-amber-100 leading-relaxed">
      ${_simTierDuration > 0
        ? `Tier atual: comissão por <strong>${_simTierDuration} meses</strong> a partir do cadastro de cada cliente.`
        : `Tier atual: comissão por <strong>tempo indeterminado</strong>, sem prazo de expiração.`
      }
    </p>
    ${_simTierDuration > 0 ? `
    <p class="text-xs text-amber-200 font-semibold mt-1.5">
      ⚠️ Clientes adquiridos neste tier não geram comissão após upgrade de tier.
      A regra é travada na época do cadastro.
    </p>` : ''}
  </div>
</div>

// Bloco de comissão de setup
<div class="flex gap-2.5 bg-blue-900/40 border border-blue-600/50 rounded-xl p-3 mb-5">
  <span class="text-base flex-shrink-0">💡</span>
  <div>
    <p class="text-xs text-blue-200 font-semibold mb-1">
      Comissão de setup: quando se aplica
    </p>
    <p class="text-xs text-blue-100 leading-relaxed">
      Você recebe comissão de ativação <strong>somente</strong> quando define uma taxa de setup
      ao criar o plano personalizado. Em demais ativações, o comissionamento é
      <strong>apenas sobre a mensalidade</strong>, quando couber.
    </p>
  </div>
</div>`
```

---

## FASE 5 — Fix: PDF para o cliente (sem informações de comissão)

O PDF é entregue ao **cliente final** — não deve conter nada sobre comissão, tier, acréscimo de setup ou qualquer dado interno do programa de parceiros.

### 5.1 — Localizar a função `gerarHtmlProposta`

```bash
grep -n "gerarHtmlProposta\|commission-box\|comm-row\|setupComm\|setupExtra\|Comiss\|comissão\|tierPct\|tierDuration\|notice-amber\|notice-blue\|Aviso\|aviso\|parceiro" \
  /home/user/parceiros/frontend/partner-simulator.js | head -40
```

### 5.2 — Substituir `gerarHtmlProposta` pela versão limpa (orientada ao cliente)

Use `str_replace` para substituir a função inteira. A nova versão:
- Mostra apenas o que o cliente precisa saber: nome do plano, composição, total mensal, taxa de setup
- **Não menciona** comissão, tier, acréscimo, programa de parceiros ou qualquer dado interno
- O acréscimo de setup já vem incorporado no `setupTotal` — o cliente vê apenas o valor final

```javascript
function gerarHtmlProposta(d) {
  const {
    nomePlano, planBase, baseTotal, modulesTotal, resourcesTotal,
    setupTotal,
    modulesInfo, resourcesInfo,
    logoPdf, businessName, brandColor,
  } = d;

  // Cores com fallback
  const brand   = brandColor || '#1B3FC4';
  const darkBg  = '#080C18';
  const darkSurf = '#0D1428';

  // Lista completa de infraestrutura
  const infraItems = [
    planBase.users > 0 ? { icon: '👤', label: 'Usuários', qty: planBase.users, detalhe: 'acesso ao sistema' } : null,
    planBase.queues > 0 ? { icon: '📋', label: 'Filas', qty: planBase.queues, detalhe: 'atendimento' } : null,
    (planBase.connectionsWhatsappUnofficial || planBase.connections || 0) > 0
      ? { icon: '💬', label: 'WhatsApp Não Oficial', qty: planBase.connectionsWhatsappUnofficial || planBase.connections, detalhe: 'conexões' } : null,
    (planBase.connectionsWhatsappOfficial || 0) > 0
      ? { icon: '✅', label: 'WhatsApp Oficial (WABA)', qty: planBase.connectionsWhatsappOfficial, detalhe: 'conexões' } : null,
    (planBase.connectionsInstagram || 0) > 0
      ? { icon: '📸', label: 'Instagram', qty: planBase.connectionsInstagram, detalhe: 'conexões' } : null,
  ].filter(Boolean);

  // Todos os módulos (base + extras)
  const todosModulos = [
    ...(planBase.activeModules || []).map(m => m.label || m.key),
    ...modulesInfo.map(m => m.label),
  ];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a2e;
    background: #fff;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Header */
  .header {
    background: linear-gradient(135deg, ${darkBg} 0%, ${darkSurf} 55%, ${brand} 100%);
    color: white;
    padding: 28px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .header-logo img { height: 36px; object-fit: contain; filter: brightness(0) invert(1); }
  .header-logo p   { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .header-right    { text-align: right; }
  .header-right h1 { font-size: 15px; font-weight: 700; }
  .header-right p  { font-size: 11px; opacity: 0.65; margin-top: 2px; }

  /* Body */
  .body { padding: 36px 40px; }

  /* Hero do plano */
  .plan-hero {
    background: linear-gradient(135deg, ${brand}12, ${brand}04);
    border: 1.5px solid ${brand}25;
    border-radius: 18px;
    padding: 28px 28px 22px;
    margin-bottom: 28px;
  }
  .plan-name { font-size: 26px; font-weight: 900; color: ${brand}; letter-spacing: -0.5px; }
  .plan-sub  { font-size: 12px; color: #6b7280; margin-top: 3px; }
  .price-block { display: flex; align-items: baseline; gap: 4px; margin-top: 14px; }
  .price-main  { font-size: 42px; font-weight: 900; color: ${brand}; letter-spacing: -1px; }
  .price-per   { font-size: 14px; color: #9ca3af; font-weight: 500; }
  .setup-badge {
    display: inline-block;
    margin-top: 8px;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    color: #c2410c;
    font-size: 11px;
    font-weight: 600;
    border-radius: 99px;
    padding: 3px 12px;
  }

  /* Seções */
  .section { margin-bottom: 24px; }
  .section-title {
    font-size: 10px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1.5px solid #f3f4f6;
  }

  /* Grid de infraestrutura */
  .infra-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .infra-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .infra-icon { font-size: 18px; flex-shrink: 0; line-height: 1; margin-top: 2px; }
  .infra-label { font-size: 11px; font-weight: 700; color: #374151; }
  .infra-qty   { font-size: 13px; font-weight: 800; color: ${brand}; margin-top: 2px; }
  .infra-detalhe { font-size: 10px; color: #9ca3af; }

  /* Módulos */
  .modules-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
  .module-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: ${brand}10;
    color: ${brand};
    border: 1px solid ${brand}25;
    border-radius: 99px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
  }
  .module-chip::before { content: '✓'; font-size: 10px; opacity: 0.7; }

  /* Resumo financeiro */
  .summary {
    background: linear-gradient(135deg, ${darkBg} 0%, ${darkSurf} 100%);
    color: white;
    border-radius: 16px;
    padding: 22px 26px;
    margin-bottom: 0;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 8px;
  }
  .summary-row span:last-child { color: #e2e8f0; font-weight: 600; }
  .summary-divider { border: none; border-top: 1px solid #ffffff15; margin: 12px 0; }
  .summary-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .summary-total-label { font-size: 14px; font-weight: 600; color: #e2e8f0; }
  .summary-total-value { font-size: 32px; font-weight: 900; color: #4ade80; letter-spacing: -1px; }
  .summary-note { font-size: 10px; color: #64748b; margin-top: 10px; }

  /* Footer */
  .footer {
    margin-top: 36px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #9ca3af;
    font-size: 10px;
  }
  .footer-brand { font-weight: 700; color: ${brand}; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-logo">
    ${logoPdf
      ? `<img src="${logoPdf}" alt="${businessName}">`
      : `<p>${businessName}</p>`
    }
  </div>
  <div class="header-right">
    <h1>Proposta Comercial</h1>
    <p>${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>
</div>

<div class="body">

  <!-- Hero: nome e preço -->
  <div class="plan-hero">
    <p class="plan-name">${nomePlano}</p>
    <p class="plan-sub">Plano personalizado</p>
    <div class="price-block">
      <span class="price-main">${formatCurrency(baseTotal)}</span>
      <span class="price-per">/ mês</span>
    </div>
    ${setupTotal > 0
      ? `<span class="setup-badge">Taxa de ativação: ${formatCurrency(setupTotal)} (cobrada 1× na contratação)</span>`
      : ''
    }
  </div>

  <!-- Infraestrutura -->
  ${infraItems.length > 0 ? `
  <div class="section">
    <p class="section-title">O que está incluído</p>
    <div class="infra-grid">
      ${infraItems.map(it => `
      <div class="infra-card">
        <span class="infra-icon">${it.icon}</span>
        <div>
          <p class="infra-label">${it.label}</p>
          <p class="infra-qty">${it.qty}</p>
          <p class="infra-detalhe">${it.detalhe}</p>
        </div>
      </div>`).join('')}
      ${resourcesInfo.map(r => `
      <div class="infra-card">
        <span class="infra-icon">➕</span>
        <div>
          <p class="infra-label">${r.label}</p>
          <p class="infra-qty">${r.qty}</p>
          <p class="infra-detalhe">adicional</p>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Módulos -->
  ${todosModulos.length > 0 ? `
  <div class="section">
    <p class="section-title">Recursos e integrações</p>
    <div class="modules-wrap">
      ${todosModulos.map(label => `<span class="module-chip">${label}</span>`).join('')}
    </div>
  </div>` : ''}

  <!-- Resumo financeiro -->
  <div class="summary">
    ${(modulesTotal > 0 || resourcesTotal > 0) ? `
    <div class="summary-row">
      <span>Plano base</span>
      <span>${formatCurrency(Number(planBase.basePrice))}/mês</span>
    </div>
    ${modulesTotal > 0 ? `
    <div class="summary-row">
      <span>Recursos adicionais</span>
      <span>+ ${formatCurrency(modulesTotal + resourcesTotal)}/mês</span>
    </div>` : ''}
    <hr class="summary-divider">` : ''}
    <div class="summary-total">
      <span class="summary-total-label">Investimento mensal</span>
      <span class="summary-total-value">${formatCurrency(baseTotal)}</span>
    </div>
    ${setupTotal > 0
      ? `<p class="summary-note">Taxa de ativação: ${formatCurrency(setupTotal)} — cobrada uma única vez na contratação.</p>`
      : ''
    }
  </div>

</div>

<!-- Footer -->
<div class="footer" style="padding: 0 40px 28px;">
  <span>Proposta gerada por <span class="footer-brand">${businessName}</span></span>
  <span>${new Date().toLocaleDateString('pt-BR')}</span>
</div>

</body>
</html>`;
}
```

### 5.3 — Atualizar a chamada de `simExportarProposta` para não passar dados de comissão

Localize onde `simExportarProposta` é chamada em `simSalvarPlano` e garanta que o objeto passado **não inclui** `comissao`, `setupComm`, `tierPct`, `tierDuration`, `setupComissionadoMsg`:

```javascript
// Encontrar a chamada existente de simExportarProposta e substituir por:
await simExportarProposta({
  nomePlano,
  planBase:      plano,
  baseTotal,
  modulesTotal,
  resourcesTotal,
  setupTotal,         // já incorpora setupExtra — não expor separado
  modulesInfo,
  resourcesInfo,
  // NÃO passar: comissao, setupComm, setupExtra, tierPct, tierDuration
});
```

---

## FASE 6 — Verificação

```bash
# 1. Confirmar que gerarHtmlProposta não tem palavras de comissão
grep -n "comiss\|Comiss\|tierPct\|parceiro\|acréscimo\|commission\|comm-" \
  /home/user/parceiros/frontend/partner-simulator.js \
  | grep -i "gerarHtml" | head -5
# Esperado: zero resultados dentro da função gerarHtmlProposta

# 2. Confirmar avisos no simulador e na tabela de preços
grep -n "Por quanto tempo\|quando se aplica\|Duração do comission\|setup.*criação" \
  /home/user/parceiros/frontend/partner-simulator.js \
  /home/user/parceiros/frontend/partner-pricing.js

# 3. Confirmar que _simTierDuration está declarado e carregado
grep -n "_simTierDuration" /home/user/parceiros/frontend/partner-simulator.js

# 4. Testar geração de PDF
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s -X POST http://localhost:3000/api/pdf/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"html":"<h1>teste</h1>"}' -o /tmp/check.pdf \
  && ls -la /tmp/check.pdf
```

---

## FASE 7 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "fix: pdf client-facing, simulator warnings, plan editor price rules"
git push

docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 15
docker stack services pacoticket
```

---

## Checklist

**Modal de edição de plano:**
- [ ] Nenhum campo de valor é editável no plano base — tudo "incluso · não editável"
- [ ] Campo de setup tem label "Acréscimo de Setup — Base de Comissão de Ativação"
- [ ] Nota abaixo do total explica que remover itens da base não afeta o preço
- [ ] Adicionar módulo extra → total sobe; remover da base → total não cai

**Avisos na Tabela de Preços — Regras de Comissionamento:**
- [ ] Aviso azul: comissão de setup somente na criação do plano
- [ ] Aviso âmbar: duração do tier atual + aviso de congelamento se `durationMonths > 0`
- [ ] Texto claro: "travada na época do cadastro de cada cliente"

**Avisos no Simulador:**
- [ ] Aviso âmbar: "Por quanto tempo você recebe comissão" com duração explícita
- [ ] Aviso âmbar: aviso de congelamento ao fazer upgrade (quando tier tem duração)
- [ ] Aviso azul: comissão de setup somente na criação do plano

**PDF gerado (para o cliente):**
- [ ] Zero menções a comissão, tier, acréscimo, parceiro ou programa interno
- [ ] Setup total exibido como "Taxa de ativação: R$ X" — sem separar base de acréscimo
- [ ] Exibe: nome do plano, infraestrutura, módulos, preço mensal, taxa de ativação
- [ ] Logo do PDF configurada no superadmin aparece no header
- [ ] Rodapé com nome do negócio e data