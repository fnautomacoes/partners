# Feature: Sistema de Tema de Cores Configurável

## Contexto

A plataforma tem uma paleta de cores oficial com três camadas semânticas:

| Camada | Cor | Hex | Uso |
|--------|-----|-----|-----|
| Marca primária | Índigo Principal | `#1B3FC4` | Logo, botões primários, links, CTAs |
| Marca hover | Índigo Hover | `#2550E0` | Estados de hover de botões e links |
| Marca suave | Névoa Índigo | `#EEF2FF` | Fundos de seção, badges, hover states |
| Acento | Âmbar | `#F59E0B` | Notificações, CTAs secundários, urgência |
| Acento hover | Âmbar Hover | `#FBB72A` | Hover do âmbar |
| Parceiros | Esmeralda | `#10B981` | Comissão paga, tier atingido, crescimento |
| Parceiros escuro | Esmeralda Escura | `#059669` | Hover, bordas sobre fundo claro |
| Parceiros suave | Névoa Esmeralda | `#ECFDF5` | Fundos de cards de tier, badges de comissão |
| Status: pendente | Âmbar | `#F59E0B` | Em atendimento, fatura pendente |
| Status: pago | Esmeralda | `#10B981` | Resolvido, comissão paga |
| Status: fila | Violeta | `#818CF8` | Na fila, aguardando |
| Status: vencido | Vermelho | `#EF4444` | Prazo excedido, fatura vencida |
| Fundo dark base | — | `#080C18` | Fundo raiz de seções escuras |
| Fundo dark superfície | — | `#0D1428` | Seções alternadas, modais escuros |
| Fundo dark elevado | — | `#141C35` | Cards elevados, CTA box |

**Regra de convivência das cores (não negociável):**
- Índigo e âmbar nunca competem no mesmo espaço visual
- Esmeralda é exclusiva do universo de parceiros — não usar no produto principal
- As 4 cores semânticas de status devem ser consistentes em todo o sistema

**Leia antes de começar:** `CLAUDE.md` e `pacoticket-reseller-skill.md`

---

## Regras absolutas

- **Um arquivo por vez** — `str_replace` cirúrgico
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- Não altere arquivos de infraestrutura
- As cores são CSS custom properties — o JS apenas injeta os valores no `:root`

---

## FASE 1 — Diagnóstico

```bash
# 1. Verificar se as chaves de cor existem no banco
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s http://localhost:3000/api/system-config \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin).get('data', {})
colors = {k: v for k, v in d.items() if k.startswith('color')}
print(f'Chaves de cor encontradas: {len(colors)}')
for k, v in sorted(colors.items()): print(f'  {k}: {v}')
"

# 2. Verificar se system-config aceita PUT
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"colorBrandPrimary":"#1B3FC4"}' \
  | python3 -m json.tool | head -5

# 3. Verificar arquivos de frontend existentes
ls /home/user/parceiros/frontend/*.{html,js,css} 2>/dev/null

# 4. Verificar se existe arquivo CSS global
ls /home/user/parceiros/frontend/theme.css 2>/dev/null || echo "theme.css nao existe"

# 5. Ver onde as cores estão hardcoded atualmente
grep -rn "gradient-bg\|#1e3a8a\|#2563eb\|#1e40af\|blue-600\|blue-700\|green-500\|amber" \
  /home/user/parceiros/frontend/*.css \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html \
  /home/user/parceiros/frontend/login.html 2>/dev/null | head -30
```

---

## FASE 2 — Backend: expor cores no system-config

### 2.1 — Garantir que o PUT aceita chaves de cor

Localize o array `allowed` no `system-config.routes.js`:

```bash
grep -n "allowed\|businessName\|logoLogin\|color" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js
```

Use `str_replace` para expandir o array `allowed` incluindo todas as chaves de cor:

```javascript
const allowed = [
  // Identidade
  'businessName', 'logoLogin', 'logoInternal', 'favicon', 'apiBaseUrl', 'logoLoginWidth',
  // Cores — Marca
  'colorBrandPrimary', 'colorBrandHover', 'colorBrandMist',
  // Cores — Âmbar (acento)
  'colorAccent', 'colorAccentHover',
  // Cores — Parceiros (esmeralda)
  'colorPartner', 'colorPartnerDark', 'colorPartnerMist',
  // Cores — Semânticas de status
  'colorStatusPending', 'colorStatusPaid', 'colorStatusQueue', 'colorStatusOverdue',
  // Cores — Fundos dark
  'colorDarkBase', 'colorDarkSurface', 'colorDarkElevated',
];
```

### 2.2 — GET público deve retornar as cores (sem autenticação)

Confirme que o `GET /api/system-config` **não filtra** as chaves de cor. Cores são públicas — necessárias para aplicar o tema antes do login.

```bash
curl -s https://parceiros.pacoticket.com.br/api/system-config \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print([k for k in d if k.startswith('color')])"
```

Confirme: lista retorna as 14 chaves de cor → avance.

---

## FASE 3 — Criar `theme.css` com CSS custom properties

Crie `/home/user/parceiros/frontend/theme.css`:

```css
/* ============================================================
   theme.css — CSS Custom Properties do tema
   Valores padrão = paleta oficial PacoTicket.
   Sobrescritos em runtime pelo applyTheme() via SystemConfig.
   ============================================================ */

:root {
  /* Marca — Índigo */
  --color-brand:        #1B3FC4;
  --color-brand-hover:  #2550E0;
  --color-brand-mist:   #EEF2FF;

  /* Acento — Âmbar */
  --color-accent:       #F59E0B;
  --color-accent-hover: #FBB72A;

  /* Parceiros — Esmeralda */
  --color-partner:      #10B981;
  --color-partner-dark: #059669;
  --color-partner-mist: #ECFDF5;

  /* Semânticas de status */
  --color-status-pending: #F59E0B;
  --color-status-paid:    #10B981;
  --color-status-queue:   #818CF8;
  --color-status-overdue: #EF4444;

  /* Fundos dark */
  --color-dark-base:     #080C18;
  --color-dark-surface:  #0D1428;
  --color-dark-elevated: #141C35;

  /* Derivados utilitários (calculados a partir das primárias) */
  --color-brand-10:  color-mix(in srgb, var(--color-brand) 10%, white);
  --color-brand-20:  color-mix(in srgb, var(--color-brand) 20%, white);
  --color-partner-10: color-mix(in srgb, var(--color-partner) 10%, white);
}

/* ── Gradiente do header (usa a marca) ─────────────────────── */
.gradient-bg {
  background: linear-gradient(
    135deg,
    var(--color-dark-base)     0%,
    var(--color-dark-surface)  50%,
    var(--color-brand)         100%
  );
}

/* ── Botões primários ──────────────────────────────────────── */
.btn-primary {
  background-color: var(--color-brand);
  color: white;
  transition: background-color 0.15s;
}
.btn-primary:hover { background-color: var(--color-brand-hover); }

/* ── Aba ativa ─────────────────────────────────────────────── */
.tab-active {
  border-bottom: 3px solid var(--color-brand);
  color: var(--color-brand);
  font-weight: 600;
}

/* ── Badges de tier / parceiro ─────────────────────────────── */
.badge-partner {
  background-color: var(--color-partner-mist);
  color: var(--color-partner-dark);
}
.badge-tier-1 { background-color: var(--color-brand-mist);    color: var(--color-brand); }
.badge-tier-2 { background-color: #FEF3C7;                     color: #92400E; }
.badge-tier-3 { background-color: var(--color-partner-mist);  color: var(--color-partner-dark); }

/* ── Semânticas de status ──────────────────────────────────── */
.status-pending { background-color: #FEF3C7; color: #92400E; }
.status-paid    { background-color: var(--color-partner-mist); color: var(--color-partner-dark); }
.status-queue   { background-color: #EDE9FE; color: #5B21B6; }
.status-overdue { background-color: #FEE2E2; color: #991B1B; }

/* ── Focus ring consistente ────────────────────────────────── */
input:focus, select:focus, textarea:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-brand-mist), 0 0 0 4px var(--color-brand);
}

/* ── Link e texto de marca ─────────────────────────────────── */
.text-brand   { color: var(--color-brand); }
.text-accent  { color: var(--color-accent); }
.text-partner { color: var(--color-partner); }
.bg-brand     { background-color: var(--color-brand); }
.bg-accent    { background-color: var(--color-accent); }
.bg-partner   { background-color: var(--color-partner); }
```

Confirme: arquivo criado → avance.

---

## FASE 4 — Criar função `applyTheme()` em `superadmin-utils.js`

Use `str_replace` para adicionar a função `applyTheme` logo após a função `applyBranding` existente:

```javascript
// ── Tema de Cores ───────────────────────────────────────────

// Mapeamento: chave do SystemConfig → CSS custom property
const THEME_VAR_MAP = {
  colorBrandPrimary:    '--color-brand',
  colorBrandHover:      '--color-brand-hover',
  colorBrandMist:       '--color-brand-mist',
  colorAccent:          '--color-accent',
  colorAccentHover:     '--color-accent-hover',
  colorPartner:         '--color-partner',
  colorPartnerDark:     '--color-partner-dark',
  colorPartnerMist:     '--color-partner-mist',
  colorStatusPending:   '--color-status-pending',
  colorStatusPaid:      '--color-status-paid',
  colorStatusQueue:     '--color-status-queue',
  colorStatusOverdue:   '--color-status-overdue',
  colorDarkBase:        '--color-dark-base',
  colorDarkSurface:     '--color-dark-surface',
  colorDarkElevated:    '--color-dark-elevated',
};

function applyTheme(config) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_VAR_MAP)) {
    if (config[key]) root.style.setProperty(cssVar, config[key]);
  }
  // Atualizar gradiente do header dinamicamente
  const brand   = config.colorBrandPrimary || '#1B3FC4';
  const darkBase = config.colorDarkBase    || '#080C18';
  const darkSurf = config.colorDarkSurface || '#0D1428';
  root.style.setProperty(
    '--gradient-bg',
    `linear-gradient(135deg, ${darkBase} 0%, ${darkSurf} 50%, ${brand} 100%)`
  );
}
```

### 4.1 — Chamar `applyTheme` dentro de `applyBranding`

Localize a função `applyBranding()` e adicione a chamada a `applyTheme` logo após obter `cfg`:

```javascript
// ANTES (trecho existente):
const cfg  = json?.data || {};
const name = cfg.businessName || 'PacoTicket';

// DEPOIS — adicionar logo abaixo:
const cfg  = json?.data || {};
applyTheme(cfg);                           // ← aplicar cores antes de qualquer render
const name = cfg.businessName || 'PacoTicket';
```

Confirme: ao carregar a página, as CSS custom properties são injetadas → avance.

---

## FASE 5 — Adicionar `theme.css` e `applyTheme` aos outros frontends

### 5.1 — `superadmin.html`

Use `str_replace` para adicionar o link do CSS no `<head>`, após o Tailwind:

```html
<link rel="stylesheet" href="theme.css">
```

### 5.2 — `partner.html`

Mesma adição no `<head>`.

### 5.3 — `login.html`

Mesma adição no `<head>`.

Depois, no script inline de branding do `login.html` (função `applyLoginBranding`), adicionar `applyTheme` após obter `cfg`:

```javascript
// Copiar o THEME_VAR_MAP e a função applyTheme para o escopo inline do login:
var THEME_VAR_MAP = {
  colorBrandPrimary:  '--color-brand',
  colorBrandHover:    '--color-brand-hover',
  colorBrandMist:     '--color-brand-mist',
  colorAccent:        '--color-accent',
  colorAccentHover:   '--color-accent-hover',
  colorPartner:       '--color-partner',
  colorPartnerDark:   '--color-partner-dark',
  colorPartnerMist:   '--color-partner-mist',
  colorStatusPending: '--color-status-pending',
  colorStatusPaid:    '--color-status-paid',
  colorStatusQueue:   '--color-status-queue',
  colorStatusOverdue: '--color-status-overdue',
  colorDarkBase:      '--color-dark-base',
  colorDarkSurface:   '--color-dark-surface',
  colorDarkElevated:  '--color-dark-elevated',
};
function applyTheme(cfg) {
  var root = document.documentElement;
  for (var k in THEME_VAR_MAP) {
    if (cfg[k]) root.style.setProperty(THEME_VAR_MAP[k], cfg[k]);
  }
}

// Dentro de applyLoginBranding(), após obter cfg:
applyTheme(cfg);
```

### 5.4 — Garantir que `partner-simulator.js` e `partner-pricing.js` usam as variáveis CSS

Esses arquivos já estão carregados após `theme.css`, então herdam automaticamente. Verificar apenas se há cores hardcoded neles:

```bash
grep -n "#1B3FC4\|#10B981\|#F59E0B\|#EF4444\|blue-600\|green-500\|amber" \
  /home/user/parceiros/frontend/partner-simulator.js \
  /home/user/parceiros/frontend/partner-pricing.js 2>/dev/null
```

Para cada cor hardcoded encontrada, substituir pela classe CSS semântica equivalente.

---

## FASE 6 — Frontend SuperAdmin: Aba Configurações — Painel de Cores

Edite `superadmin-config.js`. Use `str_replace` para adicionar nova seção na função `loadConfig`.

### 6.1 — Adicionar seção "Identidade Visual" no HTML gerado por `loadConfig`

Localize onde a seção de configurações do sistema é renderizada e adicione após ela:

```javascript
// Nova seção de cores — inserir após a seção "Token PacoTicket":
`<div class="bg-white rounded-xl shadow-sm p-6">
  <h3 class="font-semibold text-gray-800 mb-1">Identidade Visual — Cores</h3>
  <p class="text-sm text-gray-500 mb-5">
    Personalize as cores da plataforma. As alterações são aplicadas imediatamente em todas as telas.
    Clique em qualquer campo para usar o seletor de cor do navegador.
  </p>

  <!-- Grupo: Marca -->
  <div class="mb-6">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Marca — Índigo</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      ${colorPickerField('colorBrandPrimary', 'Cor Principal', '#1B3FC4', 'Logo, botões primários, links')}
      ${colorPickerField('colorBrandHover',   'Cor Hover',    '#2550E0', 'Hover de botões e links')}
      ${colorPickerField('colorBrandMist',    'Névoa (fundo suave)', '#EEF2FF', 'Badges, fundos de seção')}
    </div>
  </div>

  <!-- Grupo: Âmbar -->
  <div class="mb-6">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Acento — Âmbar</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${colorPickerField('colorAccent',      'Acento',       '#F59E0B', 'Notificações, urgência, CTAs secundários')}
      ${colorPickerField('colorAccentHover', 'Acento Hover', '#FBB72A', 'Hover do âmbar')}
    </div>
    <p class="text-xs text-amber-600 mt-2">
      ⚠️ Âmbar e índigo nunca devem competir no mesmo espaço visual.
    </p>
  </div>

  <!-- Grupo: Parceiros -->
  <div class="mb-6">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Programa de Parceiros — Esmeralda</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      ${colorPickerField('colorPartner',     'Esmeralda',        '#10B981', 'Comissão paga, tier, crescimento')}
      ${colorPickerField('colorPartnerDark', 'Esmeralda Escura', '#059669', 'Hover, bordas sobre fundo claro')}
      ${colorPickerField('colorPartnerMist', 'Névoa Esmeralda',  '#ECFDF5', 'Fundos de cards de tier')}
    </div>
    <p class="text-xs text-emerald-600 mt-2">
      ℹ️ A esmeralda é exclusiva do programa de parceiros. Não usar no produto principal.
    </p>
  </div>

  <!-- Grupo: Status -->
  <div class="mb-6">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Semânticas de Status</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      ${colorPickerField('colorStatusPending', 'Pendente / Em andamento', '#F59E0B', 'Fatura pendente, ticket aberto')}
      ${colorPickerField('colorStatusPaid',    'Pago / Resolvido',        '#10B981', 'Fatura paga, comissão paga')}
      ${colorPickerField('colorStatusQueue',   'Na fila / Aguardando',    '#818CF8', 'Aguardando atendimento')}
      ${colorPickerField('colorStatusOverdue', 'Vencido / Erro',          '#EF4444', 'Prazo excedido, fatura vencida')}
    </div>
    <p class="text-xs text-gray-500 mt-2">
      ℹ️ Estes 4 status devem ser consistentes em todo o sistema.
    </p>
  </div>

  <!-- Grupo: Fundos dark -->
  <div class="mb-6">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Fundos Dark (Header e Gradientes)</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      ${colorPickerField('colorDarkBase',     'Base',      '#080C18', 'Fundo raiz do header')}
      ${colorPickerField('colorDarkSurface',  'Superfície','#0D1428', 'Seções alternadas, modais')}
      ${colorPickerField('colorDarkElevated', 'Elevado',   '#141C35', 'Cards elevados, CTA box')}
    </div>
  </div>

  <!-- Preview e ações -->
  <div class="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100">
    <button onclick="salvarCores()"
      class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
      Salvar Cores
    </button>
    <button onclick="resetarCores()"
      class="px-5 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg transition-colors">
      Restaurar Padrão
    </button>
    <div id="previewCores" class="ml-auto flex items-center gap-2">
      <!-- Preview dinâmico das 4 cores principais -->
    </div>
  </div>
</div>`
```

### 6.2 — Função auxiliar `colorPickerField`

Adicione no escopo de `superadmin-config.js` (use `str_replace` para inserir antes de `loadConfig`):

```javascript
function colorPickerField(key, label, defaultColor, description) {
  return `
    <div>
      <label class="block text-xs font-medium text-gray-700 mb-1">${label}</label>
      <div class="flex items-center gap-2">
        <div class="relative">
          <input type="color" id="color_${key}" value="${defaultColor}"
            class="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            oninput="previewCor('${key}', this.value)">
        </div>
        <div class="flex-1">
          <input type="text" id="colorHex_${key}"
            value="${defaultColor}"
            maxlength="7"
            placeholder="#000000"
            class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            oninput="syncColorPicker('${key}', this.value)">
          <p class="text-xs text-gray-400 mt-0.5 leading-tight">${description}</p>
        </div>
      </div>
    </div>`;
}
```

### 6.3 — Funções de interação com o color picker

Adicione no final de `superadmin-config.js`:

```javascript
// ── Cores ───────────────────────────────────────────────────

const COLOR_DEFAULTS = {
  colorBrandPrimary:   '#1B3FC4',
  colorBrandHover:     '#2550E0',
  colorBrandMist:      '#EEF2FF',
  colorAccent:         '#F59E0B',
  colorAccentHover:    '#FBB72A',
  colorPartner:        '#10B981',
  colorPartnerDark:    '#059669',
  colorPartnerMist:    '#ECFDF5',
  colorStatusPending:  '#F59E0B',
  colorStatusPaid:     '#10B981',
  colorStatusQueue:    '#818CF8',
  colorStatusOverdue:  '#EF4444',
  colorDarkBase:       '#080C18',
  colorDarkSurface:    '#0D1428',
  colorDarkElevated:   '#141C35',
};

function previewCor(key, value) {
  // Sincronizar input de texto com o color picker
  const hexInput = document.getElementById(`colorHex_${key}`);
  if (hexInput) hexInput.value = value;
  // Aplicar ao CSS imediatamente para preview em tempo real
  const cssVarMap = {
    colorBrandPrimary:  '--color-brand',
    colorBrandHover:    '--color-brand-hover',
    colorBrandMist:     '--color-brand-mist',
    colorAccent:        '--color-accent',
    colorAccentHover:   '--color-accent-hover',
    colorPartner:       '--color-partner',
    colorPartnerDark:   '--color-partner-dark',
    colorPartnerMist:   '--color-partner-mist',
    colorStatusPending: '--color-status-pending',
    colorStatusPaid:    '--color-status-paid',
    colorStatusQueue:   '--color-status-queue',
    colorStatusOverdue: '--color-status-overdue',
    colorDarkBase:      '--color-dark-base',
    colorDarkSurface:   '--color-dark-surface',
    colorDarkElevated:  '--color-dark-elevated',
  };
  const cssVar = cssVarMap[key];
  if (cssVar) document.documentElement.style.setProperty(cssVar, value);
}

function syncColorPicker(key, value) {
  // Sincronizar color picker quando o hex é digitado manualmente
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    const picker = document.getElementById(`color_${key}`);
    if (picker) picker.value = value;
    previewCor(key, value);
  }
}

async function salvarCores() {
  const body = {};
  for (const key of Object.keys(COLOR_DEFAULTS)) {
    const hexInput = document.getElementById(`colorHex_${key}`);
    if (hexInput?.value && /^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
      body[key] = hexInput.value;
    }
  }
  try {
    const res = await apiRequest('PUT', '/system-config', body);
    if (!res?.success) throw new Error(res?.message || 'Erro ao salvar.');
    showToast('Cores salvas com sucesso!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function resetarCores() {
  if (!confirm('Restaurar todas as cores para os valores padrão da paleta oficial?')) return;
  try {
    const res = await apiRequest('PUT', '/system-config', COLOR_DEFAULTS);
    if (!res?.success) throw new Error(res?.message || 'Erro ao restaurar.');
    // Aplicar defaults imediatamente no DOM
    for (const [key, value] of Object.entries(COLOR_DEFAULTS)) {
      const picker  = document.getElementById(`color_${key}`);
      const hexInput = document.getElementById(`colorHex_${key}`);
      if (picker)   picker.value   = value;
      if (hexInput) hexInput.value = value;
      previewCor(key, value);
    }
    showToast('Cores restauradas para o padrão.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}
```

### 6.4 — Preencher os color pickers ao carregar a aba

Na função `loadConfig()`, após carregar a config, preencher os campos de cor:

```javascript
// Após renderizar o HTML da seção de cores:
for (const [key, defaultVal] of Object.entries(COLOR_DEFAULTS)) {
  const value   = config[key] || defaultVal;
  const picker  = document.getElementById(`color_${key}`);
  const hexInput = document.getElementById(`colorHex_${key}`);
  if (picker)   picker.value   = value;
  if (hexInput) hexInput.value = value;
}
```

---

## FASE 7 — Substituir cores hardcoded no HTML por classes semânticas

### 7.1 — Verificar cores hardcoded nos HTMLs

```bash
grep -n "style=.*#\|#1e3a8a\|#2563eb\|#1e40af\|#059669\|#10b981\|#f59e0b\|bg-blue-\|bg-green-\|text-blue-\|text-green-" \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html \
  /home/user/parceiros/frontend/login.html 2>/dev/null | head -40
```

### 7.2 — Substituições específicas nos CSS classes inline do Tailwind

As classes Tailwind inline (`bg-blue-600`, `text-blue-600`, etc.) não respondem às CSS custom properties. Para os elementos de marca principal, substituir por classes do `theme.css`:

| Tailwind inline | Substituir por |
|---|---|
| `bg-blue-600` em botões primários | `btn-primary` |
| `text-blue-600` em links/abas ativas | `text-brand` |
| `border-blue-500` em aba ativa | (já coberto por `.tab-active`) |
| `bg-green-100 text-green-800` em badge pago | `status-paid` |
| `bg-yellow-100 text-yellow-800` em badge pendente | `status-pending` |
| `bg-red-100 text-red-800` em badge vencido | `status-overdue` |
| `bg-purple-100 text-purple-800` em badge fila | `status-queue` |

Use `str_replace` cirúrgico para cada substituição. Não faça substituição global — verifique contexto por contexto.

### 7.3 — Atualizar o `gradient-bg` no CSS inline do `<style>` dos HTMLs

Localize o bloco `.gradient-bg` em cada HTML:

```bash
grep -n "gradient-bg\|gradient\|1e3a8a\|1e40af" \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html \
  /home/user/parceiros/frontend/login.html
```

Se houver `.gradient-bg` definido inline no `<style>` do HTML, remova-o — o `theme.css` já define a versão com variáveis CSS. Se não houver, o `theme.css` já é suficiente.

---

## FASE 8 — Atualizar o `nginx.conf` para servir `theme.css`

```bash
cat /home/user/parceiros/frontend/nginx.conf
```

O `theme.css` é um arquivo estático como qualquer outro `.html` ou `.js`. Se o nginx está configurado com `COPY . /usr/share/nginx/html/`, o arquivo será servido automaticamente. Confirme:

```bash
# Após o build, verificar se theme.css está no container
docker exec $(docker ps -qf "name=pacoticket_frontend") \
  ls /usr/share/nginx/html/theme.css
```

Se não estiver, o `Dockerfile` do frontend pode estar copiando arquivos individualmente — adicionar `theme.css` à lista ou mudar para `COPY . .`.

---

## FASE 9 — Verificação end-to-end

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# 1. Alterar cor primária para um tom diferente (teste)
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"colorBrandPrimary":"#7C3AED"}' | python3 -m json.tool | head -5

# 2. Confirmar que GET retorna a cor alterada
curl -s http://localhost:3000/api/system-config \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('colorBrandPrimary'))"

# 3. Acessar a plataforma no browser e conferir visualmente
# 4. Restaurar cor original
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"colorBrandPrimary":"#1B3FC4"}' | python3 -m json.tool | head -3
```

**Validação visual (checar no browser):**
- [ ] Header usa `colorDarkBase → colorDarkSurface → colorBrandPrimary` no gradiente
- [ ] Botão "Salvar" usa `colorBrandPrimary`
- [ ] Badge "Pago" usa `colorStatusPaid` (esmeralda)
- [ ] Badge "Pendente" usa `colorStatusPending` (âmbar)
- [ ] Badge "Vencido" usa `colorStatusOverdue` (vermelho)
- [ ] Aba ativa usa `colorBrandPrimary` na borda inferior
- [ ] Cards de tier no painel do parceiro usam `colorPartnerMist`
- [ ] Alterar cor no superadmin → preview em tempo real sem reload
- [ ] Salvar → recarregar página → cor permanece

---

## FASE 10 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: configurable color theme system with CSS custom properties"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket

# Verificar theme.css no container
docker exec $(docker ps -qf "name=pacoticket_frontend") \
  ls -la /usr/share/nginx/html/theme.css
```

---

## Checklist final

- [ ] `schema_update_colors.sql` aplicado — 14 chaves de cor no banco
- [ ] `theme.css` criado e servido pelo nginx
- [ ] `applyTheme()` chamada dentro de `applyBranding()` em todos os portais
- [ ] `login.html` tem `applyTheme` inline (sem depender de utils externos)
- [ ] Seção "Identidade Visual — Cores" visível na aba Configurações do superadmin
- [ ] Color pickers sincronizam com inputs de texto hex em tempo real
- [ ] Preview em tempo real ao mover o color picker (sem salvar)
- [ ] Botão "Restaurar Padrão" volta aos valores da paleta oficial
- [ ] Badges de status usam classes semânticas (`status-paid`, `status-overdue`, etc.)
- [ ] Header usa gradiente com variáveis CSS
- [ ] Zero ocorrências de "revendedor/reseller" na interface

```bash
grep -ri "revendedor\|reseller" \
  /home/user/parceiros/frontend/*.html \
  /home/user/parceiros/frontend/*.js 2>/dev/null | grep -v "//"
```