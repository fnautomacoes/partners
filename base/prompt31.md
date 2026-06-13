# Feature: Descrição de Módulos, Configuração de PDF e Melhorias no PDF Gerado

## Leia antes de começar
`CLAUDE.md` e `pacoticket-reseller-skill.md`

**Regras absolutas:**
- Um arquivo por vez — `str_replace` cirúrgico
- Nunca reescreva arquivos grandes inteiros
- Terminologia: **parceiro** (nunca revendedor)
- Backend é fonte de verdade

---

## FASE 1 — Diagnóstico completo

```bash
# 1. Colunas atuais de ModulePrice no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='ModulePrice' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name, c.data_type)))
  .finally(() => p.\$disconnect());
"

# 2. Colunas atuais de SystemConfig no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.systemConfig.findMany({ where: { key: { startsWith: 'pdf' } } })
  .then(r => { if (r.length === 0) console.log('SEM chaves pdf'); else r.forEach(c => console.log(c.key, ':', c.value)); })
  .finally(() => p.\$disconnect());
"

# 3. Ver como ModulePrice é retornada na API de planos
grep -n "modulePrice\|ModulePrice\|modules/prices" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -20

# 4. Ver como system-config trata chaves permitidas
grep -n "allowed\|pdfMargin\|pdfPadding\|pdf" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js | head -20

# 5. Ver onde módulos são renderizados na Tabela de Preços do parceiro
grep -n "description\|descri\|MODULE_MAP\|mod.*label\|label.*mod" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20

# 6. Ver onde módulos adicionais são renderizados no simulador
grep -n "sim-module\|simModules\|mod.*label\|description" \
  /home/user/parceiros/frontend/partner-simulator.js | head -20

# 7. Ver a função gerarHtmlProposta — seção de módulos
grep -n "RECURSOS\|INTEGRA\|module-chip\|todosModulos\|modList\|modulos" \
  /home/user/parceiros/frontend/partner-simulator.js | head -20

# 8. Ver como Gotenberg é chamado — margens e paddings atuais
grep -n "marginTop\|marginBottom\|marginLeft\|marginRight\|padding\|preferCss\|paperHeight" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js | head -20

# 9. Ver como o superadmin renderiza a seção de módulos
grep -n "modulePrice\|Preços dos Módulos\|setupFee\|isVisible\|label.*edit\|delete.*mod" \
  /home/user/parceiros/frontend/superadmin-config.js | head -30

# 10. Verificar se existe rota DELETE para módulos
grep -n "DELETE\|delete" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | grep -i "module\|price" | head -10
```

---

## FASE 2 — SQL: adicionar campos ao banco

### 2.1 — Verificar e aplicar no banco

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  Promise.all([
    p.\$executeRaw\`ALTER TABLE \"ModulePrice\" ADD COLUMN IF NOT EXISTS \"description\" TEXT\`,
    p.\$executeRaw\`INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\",\"updatedAt\")
      VALUES (gen_random_uuid()::TEXT,'pdfMarginTop','10',NOW())
      ON CONFLICT (\"key\") DO NOTHING\`,
    p.\$executeRaw\`INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\",\"updatedAt\")
      VALUES (gen_random_uuid()::TEXT,'pdfMarginBottom','10',NOW())
      ON CONFLICT (\"key\") DO NOTHING\`,
    p.\$executeRaw\`INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\",\"updatedAt\")
      VALUES (gen_random_uuid()::TEXT,'pdfMarginLeft','10',NOW())
      ON CONFLICT (\"key\") DO NOTHING\`,
    p.\$executeRaw\`INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\",\"updatedAt\")
      VALUES (gen_random_uuid()::TEXT,'pdfMarginRight','10',NOW())
      ON CONFLICT (\"key\") DO NOTHING\`,
    p.\$executeRaw\`INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\",\"updatedAt\")
      VALUES (gen_random_uuid()::TEXT,'pdfPaddingX','24',NOW())
      ON CONFLICT (\"key\") DO NOTHING\`,
    p.\$executeRaw\`INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\",\"updatedAt\")
      VALUES (gen_random_uuid()::TEXT,'pdfPaddingY','20',NOW())
      ON CONFLICT (\"key\") DO NOTHING\`,
  ])
  .then(() => console.log('OK'))
  .catch(e => console.error('ERRO:', e.message))
  .finally(() => p.\$disconnect());
"
```

### 2.2 — Atualizar Prisma schema

```bash
grep -n "description\|ModulePrice" /home/user/parceiros/backend/prisma/schema.prisma | head -10
```

Adicionar `description` ao model `ModulePrice` com `str_replace`:

```prisma
// ANTES (linha com isVisible ou outra linha próxima):
isVisible  Boolean  @default(true)

// DEPOIS:
isVisible   Boolean  @default(true)
description String?
```

```bash
cd /home/user/parceiros/backend && npx prisma generate
```

---

## FASE 3 — Backend: rotas de módulos (descrição + exclusão)

### 3.1 — Adicionar `description` no `allowed` do system-config e no PUT de módulos

```bash
grep -n "moduleKey\|description\|allowed\|label\|setupFee\|isVisible" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -30
```

No PUT de módulos (`PUT /plans/modules/prices`), adicionar `description` no objeto de atualização:

```javascript
// str_replace: no upsert/update de ModulePrice, incluir description:
await prisma.modulePrice.upsert({
  where:  { moduleKey: item.moduleKey },
  update: {
    price:       parseFloat(item.price)       || 0,
    setupFee:    parseFloat(item.setupFee)    || 0,
    label:       item.label                   || undefined,
    isVisible:   item.isVisible !== undefined ? Boolean(item.isVisible) : undefined,
    description: item.description !== undefined ? (item.description || null) : undefined,
  },
  create: {
    moduleKey:   item.moduleKey,
    label:       item.label || item.moduleKey,
    price:       parseFloat(item.price)    || 0,
    setupFee:    parseFloat(item.setupFee) || 0,
    isVisible:   item.isVisible !== false,
    description: item.description || null,
  },
});
```

### 3.2 — Adicionar rota DELETE para módulo

```bash
grep -n "module.exports\|router\.delete\|DELETE.*module" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | tail -5
```

Antes do `module.exports` em `plans.routes.js`, adicionar com `str_replace`:

```javascript
// DELETE /plans/modules/prices/:moduleKey — remover módulo do catálogo
router.delete('/modules/prices/:moduleKey', requireAuth, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { moduleKey } = req.params;
    // Verificar se algum plano usa este módulo
    const usageCount = await prisma.plan.count({
      where: { [`use${moduleKey.replace(/^use/, '')}`]: true }
    });
    // Soft approach: apenas marcar como invisível em vez de deletar se em uso
    if (usageCount > 0) {
      await prisma.modulePrice.update({
        where:  { moduleKey },
        data:   { isVisible: false }
      });
      return res.json({ success: true, message: `Módulo ocultado — está em uso em ${usageCount} plano(s).` });
    }
    await prisma.modulePrice.delete({ where: { moduleKey } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});
```

### 3.3 — Garantir que `description` é retornado em `GET /plans/modules/prices`

```bash
grep -n -A 10 "modules/prices" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -20
```

No `findMany` de ModulePrice, adicionar `description` no select (ou remover o select para retornar tudo):

```javascript
const modules = await prisma.modulePrice.findMany({
  orderBy: { label: 'asc' },
  // Se houver select, adicionar: description: true
});
```

### 3.4 — Adicionar chaves PDF ao `allowed` em system-config.routes.js

```bash
grep -n "allowed\s*=" /home/user/parceiros/backend/src/routes/system-config.routes.js
```

Usar `str_replace` para adicionar as novas chaves ao array `allowed`:

```javascript
// Adicionar após as chaves de cor existentes:
'pdfMarginTop', 'pdfMarginBottom', 'pdfMarginLeft', 'pdfMarginRight',
'pdfPaddingX', 'pdfPaddingY',
```

---

## FASE 4 — Frontend SuperAdmin: seção Preços dos Módulos com descrição + editar + excluir

### 4.1 — Localizar a renderização da seção de módulos

```bash
grep -n "Preços dos Módulos\|renderModulos\|modulePrice\|mod.*row\|mod.*card\|saveModules\|modPri" \
  /home/user/parceiros/frontend/superadmin-config.js | head -20
```

### 4.2 — Atualizar o template de cada linha/card de módulo para incluir:
- Campo `description` (textarea de 1 linha)
- Botão Editar (que expande/colapsa os campos)
- Botão Excluir (com confirmação)

Localize a função que renderiza cada módulo e use `str_replace` para atualizar o template:

```javascript
// Template de cada módulo (substituir versão atual):
function renderModuleRow(mod) {
  const id = mod.moduleKey.replace(/[^a-zA-Z0-9]/g, '_');
  return `
  <div class="border border-gray-200 rounded-xl overflow-hidden" id="modRow_${id}">
    <!-- Linha principal -->
    <div class="flex items-center gap-3 px-4 py-3 bg-white">
      <input type="checkbox" id="modVis_${id}" ${mod.isVisible ? 'checked' : ''}
        class="w-4 h-4 rounded text-blue-600"
        onchange="toggleModuleVisible('${mod.moduleKey}', this.checked)">
      <div class="flex-1 min-w-0">
        <input type="text" value="${mod.label || mod.moduleKey}"
          id="modLabel_${id}"
          class="w-full text-sm font-semibold text-gray-800 border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1"
          placeholder="Nome do módulo">
        <p class="text-xs text-gray-400">${mod.moduleKey}</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <div class="text-right">
          <div class="flex items-center gap-1">
            <span class="text-xs text-gray-400">R$</span>
            <input type="number" step="0.01" min="0" value="${Number(mod.price).toFixed(2)}"
              id="modPrice_${id}"
              class="w-20 text-sm text-right border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500">
          </div>
          <p class="text-xs text-gray-400 text-right mt-0.5">mensal</p>
        </div>
        <div class="text-right">
          <div class="flex items-center gap-1">
            <span class="text-xs text-gray-400">R$</span>
            <input type="number" step="0.01" min="0" value="${Number(mod.setupFee || 0).toFixed(2)}"
              id="modSetup_${id}"
              class="w-20 text-sm text-right border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500">
          </div>
          <p class="text-xs text-gray-400 text-right mt-0.5">setup</p>
        </div>
        <button onclick="toggleModuleExpand('${id}')"
          class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Editar descrição">
          ✏️
        </button>
        <button onclick="deleteModule('${mod.moduleKey}', '${(mod.label||mod.moduleKey).replace(/'/g,"\'")}')"
          class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Excluir módulo">
          🗑️
        </button>
      </div>
    </div>
    <!-- Painel expansível: descrição -->
    <div id="modExpand_${id}" class="hidden border-t border-gray-100 bg-gray-50 px-4 py-3">
      <label class="block text-xs font-medium text-gray-600 mb-1">
        Descrição do módulo
        <span class="text-gray-400 font-normal">(exibida nos cards do parceiro e nas propostas)</span>
      </label>
      <textarea id="modDesc_${id}" rows="2"
        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 resize-none"
        placeholder="Ex: Atenda seus clientes diretamente pelo WhatsApp, centralizando conversas e histórico em um único lugar."
      >${mod.description || ''}</textarea>
    </div>
  </div>`;
}
```

### 4.3 — Adicionar funções JS de controle

Após a função `renderModuleRow`, adicionar com `str_replace` (antes do próximo bloco de função):

```javascript
function toggleModuleExpand(id) {
  const el = document.getElementById('modExpand_' + id);
  if (el) el.classList.toggle('hidden');
}

async function deleteModule(moduleKey, label) {
  if (!confirm(`Excluir o módulo "${label}"?\n\nSe estiver em uso em algum plano, ele será apenas ocultado.`)) return;
  try {
    const res = await apiRequest('DELETE', `/plans/modules/prices/${moduleKey}`);
    if (!res?.success) throw new Error(res?.message || 'Erro ao excluir.');
    showToast(res.message || `Módulo "${label}" excluído.`, 'success');
    loadConfiguracoes(); // recarregar a seção
  } catch (e) {
    showToast(e.message, 'error');
  }
}
```

### 4.4 — Atualizar `saveModules()` para incluir `description`

```bash
grep -n "saveModules\|salvarModulos\|modPrice\|modSetup\|modLabel" \
  /home/user/parceiros/frontend/superadmin-config.js | head -15
```

Na função de salvar módulos, adicionar `description` na coleta de dados:

```javascript
// Para cada módulo, coletar também a description:
const id = mod.moduleKey.replace(/[^a-zA-Z0-9]/g, '_');
const description = document.getElementById('modDesc_' + id)?.value?.trim() || null;

// Incluir no objeto enviado:
{
  moduleKey:   mod.moduleKey,
  label:       document.getElementById('modLabel_' + id)?.value?.trim(),
  price:       document.getElementById('modPrice_' + id)?.value,
  setupFee:    document.getElementById('modSetup_' + id)?.value,
  isVisible:   document.getElementById('modVis_' + id)?.checked,
  description, // ← novo
}
```

---

## FASE 5 — Frontend SuperAdmin: seção PDF em Configurações

### 5.1 — Localizar onde as seções de configuração são renderizadas

```bash
grep -n "renderConfigSection\|Módulos\|Recursos\|Tiers\|section.*config\|tabConfig\|renderConfig" \
  /home/user/parceiros/frontend/superadmin-config.js | head -20
```

### 5.2 — Adicionar seção PDF após a seção de Módulos

Use `str_replace` para inserir a seção PDF. Localize o ponto de inserção (ex: após o fechamento da seção de módulos) e adicione:

```javascript
// Seção PDF — inserir após a seção de Módulos:
`
<!-- Seção: PDF -->
<div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
  <div class="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
    <span class="text-xl">📄</span>
    <div>
      <h3 class="font-semibold text-gray-800">Configurações de PDF</h3>
      <p class="text-xs text-gray-400">Margens e espaçamento interno das propostas geradas</p>
    </div>
  </div>
  <div class="px-6 py-5">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Margem Superior (mm)</label>
        <input type="number" id="cfgPdfMarginTop" min="0" max="50" step="1"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="10">
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Margem Inferior (mm)</label>
        <input type="number" id="cfgPdfMarginBottom" min="0" max="50" step="1"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="10">
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Margem Esquerda (mm)</label>
        <input type="number" id="cfgPdfMarginLeft" min="0" max="50" step="1"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="10">
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Margem Direita (mm)</label>
        <input type="number" id="cfgPdfMarginRight" min="0" max="50" step="1"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="10">
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Padding Horizontal (px)</label>
        <input type="number" id="cfgPdfPaddingX" min="0" max="80" step="2"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="24">
        <p class="text-xs text-gray-400 mt-1">Espaçamento lateral interno do conteúdo</p>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Padding Vertical (px)</label>
        <input type="number" id="cfgPdfPaddingY" min="0" max="80" step="2"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="20">
        <p class="text-xs text-gray-400 mt-1">Espaçamento vertical interno do conteúdo</p>
      </div>
    </div>
    <p class="text-xs text-gray-400">
      Valores padrão: Margens 10mm · Padding Horizontal 24px · Padding Vertical 20px.
      Alterações aplicam-se às próximas propostas geradas.
    </p>
  </div>
</div>
`
```

### 5.3 — Preencher campos PDF ao carregar config

Na função `loadConfig()`, adicionar após os outros campos:

```javascript
// Campos PDF
const pdfFields = ['pdfMarginTop','pdfMarginBottom','pdfMarginLeft','pdfMarginRight','pdfPaddingX','pdfPaddingY'];
pdfFields.forEach(key => {
  const el = document.getElementById('cfg' + key.charAt(0).toUpperCase() + key.slice(1));
  if (el && config[key] !== undefined) el.value = config[key];
});
```

### 5.4 — Incluir campos PDF no `salvarConfig()`

```javascript
// Adicionar ao body antes de enviar:
['pdfMarginTop','pdfMarginBottom','pdfMarginLeft','pdfMarginRight','pdfPaddingX','pdfPaddingY']
  .forEach(key => {
    const id = 'cfg' + key.charAt(0).toUpperCase() + key.slice(1);
    const val = document.getElementById(id)?.value;
    if (val !== undefined && val !== '') body[key] = val;
  });
```

---

## FASE 6 — Frontend Parceiro: descrição de módulos na Tabela de Preços

### 6.1 — Garantir que `description` chega nos dados de módulos

```bash
grep -n "_pricingModules\|loadPricing\|modules/prices\|description" \
  /home/user/parceiros/frontend/partner-pricing.js | head -15
```

A variável `_pricingModules` já deve ser populada por `GET /api/plans/modules/prices`. Confirme que `description` está presente nos dados retornados.

### 6.2 — Atualizar renderização dos módulos na seção "Módulos Disponíveis"

Localize onde os módulos são listados na Tabela de Preços do parceiro e use `str_replace`:

```javascript
// Encontrar o template de cada módulo e adicionar a descrição:
// ANTES (aproximado):
`<p class="text-sm font-semibold text-gray-800">${mod.label || mod.moduleKey}</p>`

// DEPOIS:
`<p class="text-sm font-semibold text-gray-800">${mod.label || mod.moduleKey}</p>
${mod.description
  ? `<p class="text-xs text-gray-400 leading-snug mt-0.5">${mod.description}</p>`
  : ''}`
```

---

## FASE 7 — Frontend Parceiro: descrição de módulos no Simulador (Módulos Adicionais)

### 7.1 — Garantir que `description` chega nos módulos do simulador

```bash
grep -n "_simModules\|loadSimulator\|simModules\|description" \
  /home/user/parceiros/frontend/partner-simulator.js | head -15
```

### 7.2 — Atualizar o template de cada toggle de módulo no simulador

Localize onde os módulos adicionais são renderizados (provavelmente um `.map()` que gera os toggles) e use `str_replace`:

```javascript
// Encontrar o template do toggle de módulo e adicionar a descrição:
// ANTES (aproximado):
`<p class="text-sm font-semibold text-gray-800 truncate">${m.label || m.moduleKey}</p>
<p class="text-xs font-bold text-blue-600">+ ${formatCurrency(m.price)}<span ...>/mês</span></p>`

// DEPOIS:
`<p class="text-sm font-semibold text-gray-800">${m.label || m.moduleKey}</p>
${m.description
  ? `<p class="text-xs text-gray-400 leading-snug mt-0.5">${m.description}</p>`
  : ''}
<p class="text-xs font-bold text-blue-600 mt-0.5">+ ${formatCurrency(m.price)}<span ...>/mês</span></p>`
```

---

## FASE 8 — PDF: seção de módulos com cards + quebra de página + margens dinâmicas

### 8.1 — Atualizar `simExportarProposta` para buscar módulos com descrição e configs de PDF

```bash
grep -n "simExportarProposta\|modulesInfo\|resourcesInfo\|gerarHtmlProposta\|system-config" \
  /home/user/parceiros/frontend/partner-simulator.js | head -20
```

Na função `simExportarProposta`, adicionar busca das configurações de PDF e das descrições dos módulos:

```javascript
async function simExportarProposta(dados) {
  showToast('Gerando PDF...', 'success');
  try {
    // Buscar config do sistema (cores + PDF settings)
    const cfgRes  = await fetch('/api/system-config', { credentials: 'include' });
    const cfg     = (await cfgRes.json())?.data || {};

    // Buscar módulos com descrição para o PDF
    const modRes  = await fetch('/api/plans/modules/prices', { credentials: 'include' });
    const allMods = (await modRes.json())?.data || [];
    // Criar mapa de moduleKey → description
    const modDescMap = {};
    allMods.forEach(m => { modDescMap[m.moduleKey] = m.description || ''; });

    const logoPdf      = cfg.logoPdf      || cfg.logoInternal || '';
    const businessName = cfg.businessName || 'PacoTicket';
    const brandColor   = cfg.colorBrandPrimary || '#1B3FC4';

    // Configurações de PDF
    const pdfMarginTop    = Number(cfg.pdfMarginTop    || 10);
    const pdfMarginBottom = Number(cfg.pdfMarginBottom || 10);
    const pdfMarginLeft   = Number(cfg.pdfMarginLeft   || 10);
    const pdfMarginRight  = Number(cfg.pdfMarginRight  || 10);
    const pdfPaddingX     = Number(cfg.pdfPaddingX     || 24);
    const pdfPaddingY     = Number(cfg.pdfPaddingY     || 20);

    const html = gerarHtmlProposta({
      ...dados,
      logoPdf, businessName, brandColor,
      modDescMap,
      pdfMarginTop, pdfMarginBottom, pdfMarginLeft, pdfMarginRight,
      pdfPaddingX, pdfPaddingY,
    });

    // Chamar backend
    const pdfRes = await fetch('/api/pdf/plan', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        leadId:       dados.leadId,
        planName:     dados.nomePlano,
        totalPrice:   dados.baseTotal,
        setupFee:     dados.setupTotal,
        setupFeeBase: dados.setupFeeBase,
        setupFeeExtra:dados.setupFeeExtra,
        planId:       dados.planId,
        proposalCode: dados.proposalCode,
        // Passar margens para o backend usar no Gotenberg:
        pdfMarginTop, pdfMarginBottom, pdfMarginLeft, pdfMarginRight,
      }),
    });

    if (!pdfRes.ok) throw new Error('Erro ao gerar PDF.');
    const blob = await pdfRes.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `proposta_${(dados.nomePlano||'proposta').replace(/\s+/g,'_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF gerado com sucesso!', 'success');
  } catch (e) {
    showToast(`Erro no PDF: ${e.message}`, 'error');
  }
}
```

### 8.2 — Atualizar backend `pdf.routes.js` para usar margens dinâmicas

```bash
grep -n "marginTop\|marginBottom\|marginLeft\|marginRight\|form\.append" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js | head -15
```

Usar `str_replace` para substituir as margens fixas por dinâmicas:

```javascript
// ANTES (margens fixas):
form.append('marginTop',    '0.4');
form.append('marginBottom', '0.4');
form.append('marginLeft',   '0.4');
form.append('marginRight',  '0.4');

// DEPOIS (margens do body da requisição, em cm convertidos de mm):
const mmToCm = mm => (Number(mm || 10) / 10).toFixed(2);
form.append('marginTop',    mmToCm(req.body.pdfMarginTop));
form.append('marginBottom', mmToCm(req.body.pdfMarginBottom));
form.append('marginLeft',   mmToCm(req.body.pdfMarginLeft));
form.append('marginRight',  mmToCm(req.body.pdfMarginRight));
```

### 8.3 — Atualizar `gerarHtmlProposta` — seção de módulos com cards + controle de quebra de página

Localize a função `gerarHtmlProposta` e use `str_replace` para:

**a) Usar `pdfPaddingX` e `pdfPaddingY` nos estilos internos do body:**

```javascript
// ANTES:
.body { padding: 36px 40px; }

// DEPOIS (interpolação dos valores dinâmicos):
.body { padding: ${pdfPaddingY}px ${pdfPaddingX}px; }
```

**b) Adicionar regra de quebra de página segura no CSS do PDF:**

```javascript
// Adicionar no bloco <style>:
`
/* Nunca cortar seção no meio — forçar quebra ANTES da seção */
.pdf-section {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Forçar quebra de página antes de seções que não cabem */
.pdf-section-break {
  break-before: auto;
  page-break-before: auto;
}

/* Evitar viúvas: se a seção não cabe, pula para nova página */
@media print {
  .pdf-section { break-inside: avoid; }
  .pdf-section-break { break-before: auto; }
}
`
```

**c) Adicionar classe `pdf-section` em cada bloco de conteúdo:**

```javascript
// Cada bloco principal deve ter a classe pdf-section:
// header, infraestrutura, módulos, resumo financeiro, CTA
// Exemplo no bloco de infraestrutura:
`<div class="pdf-section section">
  <p class="section-title">O QUE ESTÁ INCLUÍDO</p>
  ...
</div>`
```

**d) Substituir a seção de módulos por cards com descrição:**

Localize o bloco que renderiza os módulos (provavelmente com `.module-chip` ou `modules-wrap`) e substitua com `str_replace`:

```javascript
// Seção de módulos — versão com cards e descrição:
${todosModulos.length > 0 ? `
<div class="pdf-section section">
  <p class="section-title">RECURSOS E INTEGRAÇÕES ATIVADAS</p>
  <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;">
    ${todosModulos.map(m => {
      const desc = (modDescMap && modDescMap[m.key]) || m.description || '';
      return `
      <div style="
        background: ${brand}08;
        border: 1px solid ${brand}20;
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        break-inside: avoid;
        page-break-inside: avoid;
      ">
        <span style="font-size:16px; flex-shrink:0; line-height:1.2;">${m.icon || '✓'}</span>
        <div>
          <p style="font-size:12px; font-weight:700; color:${brand}; margin:0 0 2px;">${m.label || m.key}</p>
          ${desc ? `<p style="font-size:10px; color:#6b7280; margin:0; line-height:1.4;">${desc}</p>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
</div>` : ''}
```

**Nota:** `todosModulos` deve ter a estrutura `{ key, label, icon, description }`. Garantir que ao montar a lista de módulos no simulador, o `key` e o `icon` sejam incluídos:

```javascript
// Ao montar todosModulos em gerarHtmlProposta:
const todosModulos = [
  ...(planBase.activeModules || []).map(m => ({
    key:  m.key,
    label: m.label || MODULE_MAP?.[m.key]?.label || m.key,
    icon:  MODULE_MAP?.[m.key]?.icon || '✓',
    description: modDescMap?.[m.key] || '',
  })),
  ...modulesInfo.map(m => ({
    key:  m.key || m.moduleKey || '',
    label: m.label,
    icon:  MODULE_MAP?.[m.key || m.moduleKey]?.icon || '✓',
    description: modDescMap?.[m.key || m.moduleKey] || '',
  })),
];
```

---

## FASE 9 — Verificação completa

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  -c /tmp/cookies.txt \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# 1. Verificar que description existe nos módulos
curl -s http://localhost:3000/api/plans/modules/prices \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
mods = json.load(sys.stdin).get('data',[])
print('Módulos:', len(mods))
if mods: print('Campos:', list(mods[0].keys()))
"

# 2. Verificar chaves PDF no system-config
curl -s http://localhost:3000/api/system-config \
  | python3 -c "
import sys,json
d = json.load(sys.stdin).get('data',{})
pdf_keys = {k:v for k,v in d.items() if 'pdf' in k.lower()}
print('Chaves PDF:', pdf_keys)
"

# 3. Testar PUT de módulo com description
curl -s -X PUT http://localhost:3000/api/plans/modules/prices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '[{"moduleKey":"useCRM","label":"CRM","price":50,"setupFee":0,"isVisible":true,"description":"Gerencie o histórico completo de cada cliente em um único lugar."}]' \
  | python3 -m json.tool | head -10

# 4. Verificar description salva
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.modulePrice.findFirst({ where: { moduleKey: 'useCRM' }, select: { moduleKey:1, description:1 } })
  .then(r => console.log(JSON.stringify(r)))
  .finally(() => p.\$disconnect());
"

# 5. Testar DELETE de módulo
curl -s -X DELETE "http://localhost:3000/api/plans/modules/prices/useCRM_TEST" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```

---

## FASE 10 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: module descriptions, PDF config section, PDF layout with cards and page-break control"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist

**Backend:**
- [ ] `ModulePrice.description` existe no banco e no schema Prisma
- [ ] `GET /plans/modules/prices` retorna `description`
- [ ] `PUT /plans/modules/prices` aceita e persiste `description`
- [ ] `DELETE /plans/modules/prices/:moduleKey` funciona (soft delete se em uso)
- [ ] `system-config` aceita as 6 chaves de PDF no `allowed`
- [ ] `pdf.routes.js` usa `pdfMarginTop/Bottom/Left/Right` do body da requisição

**SuperAdmin — Configurações:**
- [ ] Cada módulo tem campo de descrição (expansível com botão ✏️)
- [ ] Botão 🗑️ exclui módulo com confirmação
- [ ] Seção "PDF" com 4 campos de margem + 2 de padding
- [ ] Salvar configurações persiste margens e paddings no banco

**Parceiro — Tabela de Preços:**
- [ ] Descrição aparece abaixo do nome do módulo com fonte menor
- [ ] Módulos sem descrição exibem apenas o nome (sem linha vazia)

**Parceiro — Propostas (Módulos Adicionais):**
- [ ] Descrição aparece abaixo do nome do módulo nos toggles

**PDF gerado:**
- [ ] Seção "RECURSOS E INTEGRAÇÕES ATIVADAS" usa grid de 2 colunas com cards
- [ ] Cada card tem ícone + nome do módulo (negrito, cor da marca) + descrição (cinza menor)
- [ ] Nenhuma seção é cortada no meio por quebra de página
- [ ] Margens usam os valores configurados no SuperAdmin (padrão: 10mm)
- [ ] Padding interno usa os valores configurados (padrão: 24px horizontal, 20px vertical)