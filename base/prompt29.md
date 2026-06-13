# Criar Documentação do Sistema — Etapas Pequenas (Anti-Timeout)

## Contexto

O sistema é Express.js + HTML/JS Vanilla + Tailwind CSS (não Next.js).
A documentação será uma página estática (`docs.html`) com sidebar e conteúdo em JS puro,
usando o mesmo design system do sistema (theme.css, tailwind.min.css, fontes Inter locais).

**Regra absoluta: uma etapa por vez. Confirme antes de avançar. Nunca crie arquivo grande de uma só vez.**

---

## ETAPA 1 — Inventário do design system (só leitura)

```bash
# Cores e variáveis CSS
grep -n "color\|--color\|gradient" /home/user/parceiros/frontend/theme.css | head -30

# Classes usadas nos navs
grep -n "tab-btn\|tab-active\|gradient-bg\|nav\|sidebar" \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html | head -20

# Padrão de cards e badges
grep -n "rounded-xl\|shadow-sm\|badge\|bg-white" \
  /home/user/parceiros/frontend/superadmin.html | head -10

# Scripts carregados em superadmin.html (para replicar padrão)
grep -n "<script\|<link" /home/user/parceiros/frontend/superadmin.html | head -20

# Verificar se existe docs.html ou docs.js já criados
ls /home/user/parceiros/frontend/docs* 2>/dev/null || echo "Nenhum arquivo docs existente"
```

Anote o padrão visual antes de criar qualquer arquivo.

---

## ETAPA 2 — Criar `docs.html` (estrutura, sem conteúdo)

Crie `/home/user/parceiros/frontend/docs.html` com apenas o esqueleto:
- Header igual ao `superadmin.html` e `partner.html` (gradient-bg, logo, botão Sair)
- Sidebar esquerda com links de navegação (itens vazios por enquanto)
- Área de conteúdo à direita (div vazia com id `docsContent`)
- Links para `tailwind.min.css`, `fonts.css`, `theme.css`
- Uma tag `<script src="docs.js"></script>` no final

O HTML deve ter no máximo 120 linhas. Sem conteúdo inline — tudo vai para `docs.js`.

Estrutura esperada:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentação</title>
  <link rel="stylesheet" href="tailwind.min.css">
  <link rel="stylesheet" href="fonts.css">
  <link rel="stylesheet" href="theme.css">
</head>
<body class="bg-gray-50">

  <!-- Header (mesmo padrão dos outros portais) -->
  <header class="gradient-bg text-white shadow-lg">
    <div class="container mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <img id="headerLogo" src="" alt="" class="hidden object-contain" style="max-height:36px">
        <span id="headerName" class="text-xl font-bold">Documentação</span>
      </div>
      <a href="login.html" class="text-sm text-white/80 hover:text-white transition-colors">
        ← Voltar ao sistema
      </a>
    </div>
  </header>

  <!-- Layout principal -->
  <div class="flex min-h-screen">

    <!-- Sidebar -->
    <aside class="w-64 bg-white border-r border-gray-200 flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
      <nav class="p-4" id="docsSidebar">
        <!-- preenchida pelo docs.js -->
      </nav>
    </aside>

    <!-- Conteúdo -->
    <main class="flex-1 p-8 max-w-4xl">
      <div id="docsContent">
        <!-- preenchido pelo docs.js -->
      </div>
    </main>

  </div>

  <script src="docs.js"></script>
</body>
</html>
```

Confirme: arquivo criado, menos de 120 linhas → avance.

---

## ETAPA 3 — Criar `docs.js` — Parte 1: estrutura base + menu

Crie `/home/user/parceiros/frontend/docs.js` com **apenas** a estrutura base e o menu.
Sem conteúdo das páginas ainda.

```javascript
// docs.js — Parte 1: estrutura e navegação

// ── Menu de navegação ──────────────────────────────────────
const DOCS_MENU = [
  {
    group: 'Primeiros Passos',
    icon: '🚀',
    items: [
      { slug: 'visao-geral',     title: 'Visão Geral do Sistema' },
      { slug: 'primeiro-acesso', title: 'Primeiro Acesso' },
      { slug: 'configuracoes-iniciais', title: 'Configurações Iniciais' },
    ]
  },
  {
    group: 'Portal SuperAdmin',
    icon: '⚙️',
    items: [
      { slug: 'dashboard-admin',  title: 'Dashboard' },
      { slug: 'parceiros',        title: 'Gestão de Parceiros' },
      { slug: 'planos',           title: 'Planos e Módulos' },
      { slug: 'clientes',         title: 'Gestão de Clientes' },
      { slug: 'comissoes-admin',  title: 'Comissões' },
      { slug: 'faturas',          title: 'Faturas' },
      { slug: 'propostas-admin',  title: 'Propostas' },
      { slug: 'configuracoes',    title: 'Configurações do Sistema' },
    ]
  },
  {
    group: 'Portal do Parceiro',
    icon: '🤝',
    items: [
      { slug: 'dashboard-parceiro', title: 'Dashboard' },
      { slug: 'meus-clientes',      title: 'Meus Clientes' },
      { slug: 'comissoes-parceiro', title: 'Minhas Comissões' },
      { slug: 'tabela-precos',      title: 'Tabela de Preços' },
      { slug: 'funil',              title: 'Funil de Vendas (CRM)' },
      { slug: 'propostas-parceiro', title: 'Propostas e Simulador' },
      { slug: 'meu-perfil',         title: 'Meu Perfil' },
    ]
  },
  {
    group: 'Regras de Negócio',
    icon: '📋',
    items: [
      { slug: 'tiers-comissao',   title: 'Tiers e Comissionamento' },
      { slug: 'setup-fee',        title: 'Taxas de Setup' },
      { slug: 'planos-parceiro',  title: 'Planos Personalizados' },
    ]
  },
  {
    group: 'Segurança e Acesso',
    icon: '🔒',
    items: [
      { slug: 'autenticacao',     title: 'Autenticação e Sessão' },
      { slug: 'recuperar-senha',  title: 'Recuperar Senha' },
    ]
  },
];

// ── Roteamento por hash ────────────────────────────────────

let _currentSlug = '';

function getSlugFromHash() {
  return window.location.hash.replace('#', '') || 'visao-geral';
}

function navigateTo(slug) {
  window.location.hash = slug;
}

window.addEventListener('hashchange', () => {
  const slug = getSlugFromHash();
  renderSidebar(slug);
  renderPage(slug);
});

// ── Sidebar ────────────────────────────────────────────────

function renderSidebar(activeSlug) {
  const el = document.getElementById('docsSidebar');
  if (!el) return;
  el.innerHTML = DOCS_MENU.map(group => `
    <div class="mb-6">
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
        ${group.icon} ${group.group}
      </p>
      <div class="space-y-0.5">
        ${group.items.map(item => `
          <a href="#${item.slug}"
             class="block px-3 py-2 rounded-lg text-sm transition-colors
                    ${item.slug === activeSlug
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}">
            ${item.title}
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// ── Renderizador de páginas ────────────────────────────────

function renderPage(slug) {
  _currentSlug = slug;
  const el = document.getElementById('docsContent');
  if (!el) return;

  const page = DOCS_PAGES[slug];
  if (!page) {
    el.innerHTML = `
      <div class="text-center py-16">
        <p class="text-4xl mb-4">📄</p>
        <h2 class="text-xl font-bold text-gray-700 mb-2">Página não encontrada</h2>
        <p class="text-gray-500">O slug "<code>${slug}</code>" não existe.</p>
      </div>`;
    return;
  }

  // Navegação prev/next
  const allSlugs = DOCS_MENU.flatMap(g => g.items.map(i => i.slug));
  const idx  = allSlugs.indexOf(slug);
  const prev = idx > 0 ? allSlugs[idx - 1] : null;
  const next = idx < allSlugs.length - 1 ? allSlugs[idx + 1] : null;

  const prevItem = prev ? DOCS_MENU.flatMap(g=>g.items).find(i=>i.slug===prev) : null;
  const nextItem = next ? DOCS_MENU.flatMap(g=>g.items).find(i=>i.slug===next) : null;

  el.innerHTML = `
    <article class="prose-custom max-w-none">
      ${page}
    </article>
    <div class="flex justify-between mt-12 pt-6 border-t border-gray-200">
      ${prevItem ? `<a href="#${prev}" class="flex items-center gap-2 text-sm text-blue-600 hover:underline">← ${prevItem.title}</a>` : '<div></div>'}
      ${nextItem ? `<a href="#${next}" class="flex items-center gap-2 text-sm text-blue-600 hover:underline">${nextItem.title} →</a>` : '<div></div>'}
    </div>`;
}

// ── Helpers de conteúdo ────────────────────────────────────

function h1(text) {
  return `<h1 class="text-3xl font-bold text-gray-900 mb-2">${text}</h1>`;
}
function h2(text) {
  return `<h2 class="text-xl font-bold text-gray-800 mt-8 mb-3">${text}</h2>`;
}
function h3(text) {
  return `<h3 class="text-base font-semibold text-gray-700 mt-5 mb-2">${text}</h3>`;
}
function p(text) {
  return `<p class="text-gray-600 leading-relaxed mb-3">${text}</p>`;
}
function ul(items) {
  return `<ul class="list-disc list-inside space-y-1 text-gray-600 mb-4">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
}
function ol(items) {
  return `<ol class="list-decimal list-inside space-y-2 text-gray-600 mb-4">${items.map(i=>`<li class="pl-1">${i}</li>`).join('')}</ol>`;
}
function callout(type, text) {
  const styles = {
    info:    'bg-blue-50  border-blue-300  text-blue-800',
    warning: 'bg-amber-50 border-amber-300 text-amber-800',
    danger:  'bg-red-50   border-red-300   text-red-800',
    success: 'bg-green-50 border-green-300 text-green-800',
  };
  const icons = { info:'💡', warning:'⚠️', danger:'🚨', success:'✅' };
  return `<div class="border-l-4 rounded-r-lg p-4 mb-4 ${styles[type]||styles.info}">
    ${icons[type]||'💡'} ${text}
  </div>`;
}
function badge(text, color='blue') {
  const colors = {
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color]||colors.blue}">${text}</span>`;
}
function table(headers, rows) {
  return `<div class="overflow-x-auto mb-4">
    <table class="w-full text-sm border-collapse">
      <thead><tr class="border-b-2 border-gray-200">
        ${headers.map(h=>`<th class="text-left py-2 px-3 font-semibold text-gray-700">${h}</th>`).join('')}
      </tr></thead>
      <tbody>${rows.map(row=>`<tr class="border-b border-gray-100 hover:bg-gray-50">
        ${row.map(cell=>`<td class="py-2 px-3 text-gray-600">${cell}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

// ── DOCS_PAGES será preenchido nas próximas etapas ─────────
const DOCS_PAGES = {};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Aplicar branding
  fetch('/api/system-config')
    .then(r => r.json())
    .then(json => {
      const cfg  = json?.data || {};
      const name = cfg.businessName || 'PacoTicket';
      const headerLogo = document.getElementById('headerLogo');
      const headerName = document.getElementById('headerName');
      if (cfg.logoInternal && headerLogo) {
        headerLogo.src = cfg.logoInternal;
        headerLogo.classList.remove('hidden');
        if (headerName) headerName.classList.add('hidden');
      } else if (headerName) {
        headerName.textContent = name + ' — Documentação';
      }
      // Aplicar tema de cores
      if (typeof applyTheme === 'function') applyTheme(cfg);
      document.title = name + ' — Documentação';
    }).catch(() => {});

  const slug = getSlugFromHash();
  renderSidebar(slug);
  renderPage(slug);
});
```

Confirme: `docs.js` criado com `DOCS_PAGES = {}` vazio → avance.

---

## ETAPA 4 — Adicionar conteúdo: Primeiros Passos (3 páginas)

Use `str_replace` para substituir `const DOCS_PAGES = {};` por:

```javascript
const DOCS_PAGES = {

'visao-geral': h1('Visão Geral do Sistema') +
  p('Este sistema permite que o <strong>SuperAdmin</strong> gerencie planos, parceiros, clientes e comissões, enquanto cada <strong>parceiro</strong> tem seu próprio painel para acompanhar clientes, comissões e criar propostas comerciais.') +
  h2('Dois portais') +
  table(
    ['Portal','Quem acessa','O que faz'],
    [
      ['SuperAdmin','Administrador do sistema','Gerencia tudo: parceiros, planos, módulos, comissões, configurações'],
      ['Parceiro','Revendedor cadastrado','Gerencia seus clientes, acompanha comissões, cria propostas'],
    ]
  ) +
  h2('Fluxo básico') +
  ol([
    'SuperAdmin cria os planos e configura os módulos disponíveis',
    'SuperAdmin cadastra os parceiros e define suas permissões',
    'Parceiro cadastra seus clientes vinculando a um plano',
    'Faturas são geradas pela plataforma PacoTicket e sincronizadas',
    'SuperAdmin calcula as comissões do período',
    'Parceiro acompanha suas comissões no painel',
  ]) +
  callout('info', 'Planos são 100% internos — nunca importados da API PacoTicket. O campo <strong>ID do Plano PacoTicket</strong> serve apenas para identificação cruzada.'),

'primeiro-acesso': h1('Primeiro Acesso') +
  h2('Tela de Login') +
  p('Acesse o sistema pelo endereço configurado. A tela de login é unificada — o sistema redireciona automaticamente para o portal correto com base no seu perfil.') +
  table(
    ['Credencial padrão','Valor'],
    [
      ['E-mail','admin@pacoticket.com.br'],
      ['Senha','admin123'],
    ]
  ) +
  callout('danger', '<strong>Troque a senha imediatamente</strong> após o primeiro acesso. Vá em Configurações → Trocar Senha.') +
  h2('Recuperar senha') +
  ol([
    'Na tela de login, clique em <strong>Esqueceu a senha?</strong>',
    'Informe o e-mail cadastrado',
    'Verifique sua caixa de entrada — o link de redefinição expira em 15 minutos',
    'Clique no link e defina a nova senha',
  ]) +
  callout('warning', 'O envio de e-mail depende de configuração SMTP no servidor (<code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>). Se não receber o e-mail, verifique com o administrador.'),

'configuracoes-iniciais': h1('Configurações Iniciais') +
  p('Antes de cadastrar parceiros e clientes, configure o sistema em <strong>SuperAdmin → Configurações</strong>.') +
  h2('White-Label') +
  ul([
    '<strong>Nome do Negócio</strong> — aparece em e-mails, PDFs e textos. Substituído pela logo quando configurada.',
    '<strong>Logo de Login</strong> — exibida na tela de login (URL de imagem). Recomendado: PNG com fundo transparente.',
    '<strong>Logo Interna</strong> — exibida no header do sistema.',
    '<strong>Logo para PDFs</strong> — usada no cabeçalho das propostas geradas.',
    '<strong>Largura da Logo</strong> — largura em pixels da logo na tela de login. Altura se adapta automaticamente.',
  ]) +
  h2('URL da API PacoTicket') +
  p('Configure a URL base da API PacoTicket em Configurações → URL da API. Padrão: <code>https://api.pacoticket.com.br</code>.') +
  callout('warning', 'Esta URL é usada em todas as integrações. Altere apenas se a API PacoTicket mudar de endereço.') +
  h2('Preços dos Módulos') +
  p('Configure o preço e a taxa de setup de cada módulo em Configurações → Módulos. Módulos com <strong>Visível</strong> desmarcado não aparecem no montador de planos.') +
  callout('info', 'Alterar preços de módulos não recalcula planos já cadastrados. Edite os planos manualmente se necessário.') +
  h2('Tiers de Comissionamento') +
  p('Configure os tiers em Configurações → Tiers. Cada tier define: quantidade mínima/máxima de clientes, percentual de comissão, modo de suporte e duração.'),

// ... restante será adicionado nas próximas etapas
};
```

Confirme: páginas de Primeiros Passos aparecem no sistema → avance.

---

## ETAPA 5 — Conteúdo: Portal SuperAdmin (4 primeiras páginas)

Use `str_replace` para substituir `// ... restante será adicionado nas próximas etapas` por:

```javascript
'dashboard-admin': h1('Dashboard do SuperAdmin') +
  p('O dashboard exibe uma visão consolidada de toda a operação em tempo real.') +
  h2('KPIs exibidos') +
  table(
    ['Card','O que mostra'],
    [
      ['Parceiros Ativos','Total de parceiros com status ATIVO'],
      ['Clientes Ativos','Total de clientes com status ATIVO em todos os parceiros'],
      ['Comissões Pendentes','Valor total de comissões ainda não pagas'],
      ['Receita Mensal','Soma dos totalPrice de todos os planos com clientes ativos'],
    ]
  ) +
  h2('Distribuição por Tier') +
  p('Três cards mostram quantos parceiros estão em cada tier (Indicador, Parceiro, Master).') +
  h2('Top Parceiros') +
  p('Listagem dos 5 parceiros com mais clientes ativos, com nome, tier e contagem.') +
  h2('Atividades Recentes') +
  p('Log das últimas ações do sistema: clientes criados, comissões pagas, planos alterados.'),

'parceiros': h1('Gestão de Parceiros') +
  p('Gerencie todos os parceiros do sistema: cadastrar, editar, visualizar clientes e configurar permissões.') +
  h2('Cadastrar novo parceiro') +
  ol([
    'Clique em <strong>+ Novo Parceiro</strong>',
    'Preencha nome, e-mail, telefone e CPF/CNPJ (opcional)',
    'Defina a senha de acesso ao portal do parceiro',
    'Configure as permissões de cadastro de clientes',
    'Clique em <strong>Salvar</strong>',
  ]) +
  h2('Permissões de cadastro') +
  table(
    ['Permissão','Quando ativada','Quando desativada'],
    [
      ['Pode definir Recorrência','Parceiro escolhe Mensal/Trimestral/Semestral/Anual','Recorrência sempre Mensal'],
      ['Pode definir Vencimento','Parceiro escolhe a data de vencimento','Vencimento = data do cadastro + 2 dias'],
    ]
  ) +
  callout('info', 'Desativar um parceiro (DELETE) não remove seus clientes — apenas impede novos acessos ao portal.'),

'planos': h1('Planos e Módulos') +
  p('Planos são configurados exclusivamente pelo SuperAdmin e representam as ofertas de serviço disponíveis para os clientes.') +
  callout('info', '<strong>Regra fundamental:</strong> o <code>totalPrice</code> de um plano é sempre igual ao <code>basePrice</code>. Módulos e recursos documentam o que está incluso, sem inflar o preço automaticamente.') +
  h2('Criar novo plano') +
  ol([
    'Clique em <strong>+ Novo Plano</strong>',
    'Defina nome, descrição e preço base (mensal)',
    'Configure a infraestrutura: usuários, filas, conexões WhatsApp/Instagram',
    'Ative os módulos incluídos no plano',
    'Defina a taxa de setup (cobrada 1× na ativação) — opcional',
    'Defina a ordem de apresentação',
    'Clique em <strong>Salvar Plano</strong>',
  ]) +
  h2('Campos de infraestrutura') +
  table(
    ['Campo','Descrição'],
    [
      ['Usuários','Quantidade de usuários com acesso ao sistema'],
      ['Filas','Quantidade de filas de atendimento'],
      ['WhatsApp Não Oficial','Conexões via API não oficial'],
      ['WhatsApp Oficial (WABA)','Conexões via API oficial Meta'],
      ['Instagram','Conexões Instagram'],
    ]
  ) +
  h2('ID do Plano PacoTicket') +
  p('Campo opcional para identificação cruzada. Quando preenchido, é usado ao criar o cliente na plataforma PacoTicket. Não afeta preço nem comissão.') +
  h2('Reordenar planos') +
  p('Arraste e solte os cards de plano para definir a ordem de apresentação. A ordem é salva automaticamente.'),

'clientes': h1('Gestão de Clientes') +
  p('O SuperAdmin visualiza todos os clientes de todos os parceiros e pode cadastrar, editar ou desativar qualquer cliente.') +
  h2('Filtros disponíveis') +
  ul(['Parceiro','Status (Ativo/Inativo/Suspenso)','Plano']) +
  h2('Cadastrar cliente') +
  ol([
    'Clique em <strong>+ Novo Cliente</strong>',
    'Preencha os dados da empresa e contato',
    'Selecione o parceiro responsável',
    'Selecione o plano',
    'Defina recorrência e data de vencimento',
    'Clique em <strong>Salvar</strong>',
  ]) +
  p('Ao salvar, o sistema cria o cliente no banco e registra a empresa na API PacoTicket.') +
  h2('Add-ons por cliente') +
  p('É possível adicionar módulos ou recursos extras ao cliente além do plano base. O SuperAdmin pode aplicar descontos nos add-ons; parceiros não.') +
  callout('warning', 'Desativar um cliente (status INATIVO) não cancela faturas em aberto na API PacoTicket — faça isso manualmente na plataforma.'),

// ... continua na próxima etapa
```

Confirme → avance.

---

## ETAPA 6 — Conteúdo: SuperAdmin (4 páginas restantes)

Use `str_replace` para substituir `// ... continua na próxima etapa` por:

```javascript
'comissoes-admin': h1('Comissões (SuperAdmin)') +
  p('O SuperAdmin calcula, visualiza e marca como pagas as comissões de todos os parceiros.') +
  h2('Calcular comissões') +
  ol([
    'Vá em <strong>Comissões</strong>',
    'Selecione o mês e ano',
    'Clique em <strong>Calcular Comissões</strong>',
    'O sistema processa todas as faturas pagas no período e gera os registros',
  ]) +
  callout('info', 'Comissões são calculadas sobre <strong>faturas pagas</strong> no período, não sobre o valor do plano. Sem faturas pagas = sem comissão gerada.') +
  h2('Tipos de comissão') +
  table(
    ['Tipo','Quando ocorre','Base de cálculo'],
    [
      ['Mensalidade','Todo mês em que há fatura paga','invoice.amount × percentual do tier'],
      ['Setup (1×)','Apenas no primeiro período do cliente','setupFeeExtra × percentual configurado no tier'],
    ]
  ) +
  callout('warning', 'A comissão de setup só ocorre quando o parceiro definiu um <strong>acréscimo</strong> na taxa de setup ao criar o plano personalizado. O setup base do catálogo <strong>não</strong> gera comissão.') +
  h2('Marcar como pago') +
  p('Clique em <strong>Pagar</strong> na linha da comissão. O status muda para PAGO e registra a data de pagamento.') +
  h2('Exportar CSV') +
  p('Clique em <strong>Exportar CSV</strong> para baixar os dados exibidos na tabela, com separador ponto e vírgula (compatível com Excel).'),

'faturas': h1('Faturas') +
  p('Faturas são sincronizadas da plataforma PacoTicket. O sistema não gera faturas — apenas as importa para cálculo de comissões.') +
  h2('Sincronizar faturas') +
  ol([
    'Vá em <strong>Faturas</strong>',
    'Clique em <strong>Sincronizar PacoTicket</strong>',
    'O sistema busca todas as faturas na API e atualiza o banco local',
  ]) +
  h2('Status das faturas') +
  table(
    ['Status','Significado'],
    [
      [badge('Pendente','amber'),'Fatura gerada, aguardando pagamento'],
      [badge('Pago','green'),'Fatura paga — gera comissão no próximo cálculo'],
      [badge('Vencido','red'),'Fatura vencida e não paga'],
      [badge('Cancelado','gray'),'Fatura cancelada'],
    ]
  ) +
  callout('info', 'Apenas faturas com status <strong>PAGO</strong> são consideradas no cálculo de comissões.'),

'propostas-admin': h1('Propostas (SuperAdmin)') +
  p('O SuperAdmin visualiza todas as propostas geradas pelos parceiros, podendo baixar ou excluir.') +
  h2('Filtros') +
  ul(['Parceiro','ID da proposta','Nome do cliente/lead']) +
  h2('Colunas da tabela') +
  table(
    ['Coluna','Descrição'],
    [
      ['ID','Código único da proposta (ex: KT3RQ_29032026)'],
      ['Plano','Nome do plano cotado'],
      ['Parceiro','Parceiro que gerou a proposta'],
      ['Cliente','Lead vinculado à proposta'],
      ['Setup Base','Taxa de setup do catálogo'],
      ['Setup Extra','Acréscimo definido pelo parceiro'],
      ['Data','Data de geração'],
    ]
  ) +
  h2('Ações') +
  ul([
    '<strong>⬇️ Baixar</strong> — faz download do PDF',
    '<strong>🗑️ Excluir</strong> — remove do banco e do disco do servidor',
  ]),

'configuracoes': h1('Configurações do Sistema') +
  p('Centralize toda a personalização do sistema em <strong>SuperAdmin → Configurações</strong>.') +
  h2('Seções disponíveis') +
  table(
    ['Seção','O que configura'],
    [
      ['Sistema / White-Label','Nome do negócio, logos, favicon, largura da logo de login'],
      ['URL da API','Base URL da API PacoTicket usada em todas as integrações'],
      ['Cores','15 variáveis de cor do tema (marca, acento, parceiros, status, fundos dark)'],
      ['Módulos','Preço, taxa de setup, visibilidade e nome editável de cada módulo'],
      ['Recursos de Infraestrutura','Preço por unidade de conexões WhatsApp/Instagram, usuários e filas'],
      ['Tiers de Comissionamento','Criar/editar/excluir tiers com percentual, duração e modo de suporte'],
      ['Token PacoTicket','Configurado via variável de ambiente — não editável pelo painel'],
    ]
  ) +
  callout('info', 'Alterações de cor são aplicadas em tempo real no painel antes de salvar — você vê o efeito imediatamente.') +
  h2('Restaurar cores padrão') +
  p('Clique em <strong>Restaurar Padrão</strong> na seção de cores para voltar à paleta oficial.'),

// continua na etapa 7
```

Confirme → avance.

---

## ETAPA 7 — Conteúdo: Portal do Parceiro (7 páginas)

Use `str_replace` para substituir `// continua na etapa 7` por:

```javascript
'dashboard-parceiro': h1('Dashboard do Parceiro') +
  p('O dashboard exibe sua situação atual: tier, progresso, KPIs e avisos importantes.') +
  h2('Card de Tier') +
  p('Mostra seu tier atual (Indicador / Parceiro / Master), o percentual de comissão e a barra de progresso para o próximo tier.') +
  callout('warning', 'Se o seu tier atual tem tempo de comissão limitado, clientes adquiridos <strong>não gerarão comissão</strong> após upgrade de tier. A regra fica travada na data do cadastro.') +
  h2('KPIs') +
  table(
    ['Card','O que mostra'],
    [
      ['Clientes Ativos','Seus clientes com status ATIVO'],
      ['Comissão do Mês','Total de comissões (mensalidade + setup) no mês atual'],
      ['Faturas Pagas','Faturas pagas no mês'],
      ['Próximo Vencimento','Cliente com vencimento mais próximo'],
    ]
  ),

'meus-clientes': h1('Meus Clientes') +
  p('Gerencie todos os seus clientes: cadastrar, editar, adicionar módulos extras e acompanhar status de faturas.') +
  h2('Cadastrar novo cliente') +
  ol([
    'Clique em <strong>+ Novo Cliente</strong>',
    'Preencha os dados da empresa e contato',
    'Selecione o plano',
    'Defina recorrência e vencimento (se sua conta tiver essas permissões)',
    'Adicione módulos ou recursos extras se necessário',
    'Clique em <strong>Salvar</strong>',
  ]) +
  callout('info', 'Se você não tem permissão para definir recorrência ou vencimento, o sistema usa <strong>Mensal</strong> e <strong>hoje + 2 dias</strong> automaticamente.') +
  h2('Add-ons') +
  p('Você pode adicionar módulos ou recursos de infraestrutura extras ao cliente, além do plano base. Os preços são os do catálogo — sem desconto.') +
  callout('warning', 'Apenas o SuperAdmin pode aplicar descontos em add-ons.') +
  h2('Status da fatura') +
  table(
    ['Badge','Significado'],
    [
      [badge('Pago','green'),'Última fatura paga'],
      [badge('Pendente','amber'),'Aguardando pagamento'],
      [badge('Vencido','red'),'Prazo excedido sem pagamento'],
      [badge('Sem fatura','gray'),'Nenhuma fatura sincronizada ainda'],
    ]
  ),

'comissoes-parceiro': h1('Minhas Comissões') +
  p('Acompanhe todas as suas comissões: mensalidade, setup e totais por período.') +
  h2('Tipos de comissão') +
  table(
    ['Coluna','Descrição'],
    [
      ['Mensalidade','Comissão recorrente sobre o valor da fatura paga'],
      ['Setup (1×)','Comissão sobre o acréscimo de setup que você definiu ao criar o plano. Cobrada apenas uma vez.'],
      ['Total','Mensalidade + Setup do período'],
    ]
  ) +
  callout('info', 'A comissão de setup aparece apenas no <strong>primeiro período</strong> do cliente e apenas quando você definiu um acréscimo de setup ao criar o plano personalizado.') +
  h2('Resumo do período') +
  p('No topo da tela aparecem três cards: <strong>Pendente Mensalidade</strong>, <strong>Pendente Setup</strong> e <strong>Total Pago</strong>.'),

'tabela-precos': h1('Tabela de Preços') +
  p('Visualize todos os planos disponíveis com composição detalhada e estimativa de comissão.') +
  h2('Planos Globais vs Meus Planos') +
  p('Use os botões no topo para alternar entre <strong>Planos Globais</strong> (criados pelo SuperAdmin) e <strong>Meus Planos</strong> (planos personalizados que você criou).') +
  h2('Card de plano') +
  ul([
    '<strong>Preço mensal</strong> — valor fixo do plano',
    '<strong>Taxa de ativação</strong> — setup base do catálogo (laranja)',
    '<strong>Acréscimo de setup</strong> — valor que você adicionou (verde, com badge "comissionado")',
    '<strong>Total de ativação</strong> — soma dos dois acima',
    '<strong>Módulos incluídos</strong> — lista com ícones',
    '<strong>Sua comissão estimada</strong> — baseada no seu tier atual',
  ]) +
  h2('Editar Meu Plano') +
  p('Nos planos próprios, você pode alterar o nome, adicionar módulos extras e ajustar o acréscimo de setup. O preço base não pode ser alterado.') +
  h2('Avisos importantes') +
  callout('info', 'Somente taxas de setup definidas <strong>na criação do plano</strong> geram comissão. Ativações sem acréscimo = comissão apenas sobre mensalidade.') +
  callout('warning', 'A duração da comissão depende do seu tier atual. Verifique na seção Regras de Comissionamento da mesma tela.'),

'funil': h1('Funil de Vendas (CRM)') +
  p('Gerencie seus leads desde o primeiro contato até a conversão em cliente, usando um quadro Kanban.') +
  h2('Estágios padrão') +
  p('Na primeira vez que você acessa o Funil, os seguintes estágios são criados automaticamente:') +
  ol(['Lead','Contato Realizado','Proposta Enviada','Negociação','Cliente','Cancelado']) +
  h2('Criar novo lead') +
  ol([
    'Clique em <strong>+ Novo Lead</strong> ou no <strong>+</strong> no topo de qualquer coluna',
    'Preencha empresa, contato, e-mail, telefone e notas',
    'Selecione o plano de interesse (opcional)',
    'Informe valor estimado e data esperada de fechamento',
    'Clique em <strong>Criar Lead</strong>',
  ]) +
  h2('Mover lead entre estágios') +
  p('Arraste o card do lead para outra coluna. A mudança de estágio é registrada automaticamente no histórico do lead.') +
  h2('Histórico de atividades') +
  p('Cada lead tem um histórico completo de: mudanças de estágio, notas adicionadas e propostas geradas.'),

'propostas-parceiro': h1('Propostas e Simulador') +
  p('Crie simulações de planos, gere PDFs profissionais para enviar ao cliente e salve as propostas vinculadas a um lead.') +
  h2('Criar simulação') +
  ol([
    'Selecione um <strong>plano base</strong> (planos globais disponíveis)',
    'Adicione <strong>módulos extras</strong> se necessário',
    'Ajuste <strong>recursos de infraestrutura</strong> extras',
    'Informe o <strong>acréscimo de setup</strong> (opcional — vira sua comissão de ativação)',
    'Visualize o resumo com <strong>comissão estimada</strong>',
  ]) +
  h2('Gerar PDF e salvar') +
  ol([
    'Dê um nome ao plano',
    'Selecione ou crie um lead para vincular',
    'Clique em <strong>Gerar PDF da Proposta e Salvar</strong>',
    'O PDF é gerado e o download inicia automaticamente',
    'O arquivo fica salvo no servidor e disponível no histórico do lead',
  ]) +
  callout('info', 'O PDF é formatado para o cliente final — não contém informações sobre comissão, tier ou dados internos do programa de parceiros.') +
  h2('Salvar como Meu Plano') +
  p('Clique em <strong>Salvar Plano</strong> para criar um plano personalizado baseado na simulação. Ele aparece em <strong>Tabela de Preços → Meus Planos</strong>.') +
  h2('Propostas Geradas') +
  p('Veja o histórico de todas as propostas geradas. Filtre por ID da proposta ou nome do cliente. Faça download de qualquer proposta anterior.'),

'meu-perfil': h1('Meu Perfil') +
  p('Atualize seus dados de contato e troque sua senha de acesso.') +
  h2('Dados editáveis') +
  ul(['Telefone','E-mail (usado no login)']) +
  callout('info', 'Nome e CPF/CNPJ são definidos pelo SuperAdmin e não podem ser alterados pelo portal do parceiro.') +
  h2('Trocar senha') +
  ol([
    'Informe a <strong>senha atual</strong>',
    'Informe a <strong>nova senha</strong> (mínimo 8 caracteres)',
    'Confirme a nova senha',
    'Clique em <strong>Salvar Senha</strong>',
  ]) +
  callout('warning', 'Ao trocar a senha, <strong>todas as sessões ativas</strong> são encerradas automaticamente. Você precisará fazer login novamente.'),

// continua na etapa 8
```

Confirme → avance.

---

## ETAPA 8 — Conteúdo: Regras de Negócio e Segurança (5 páginas finais)

Use `str_replace` para substituir `// continua na etapa 8` por:

```javascript
'tiers-comissao': h1('Tiers e Comissionamento') +
  p('O sistema de comissões é baseado em tiers configuráveis. Cada tier define o percentual de comissão sobre as faturas pagas dos seus clientes.') +
  h2('Como funciona') +
  p('Ao cadastrar um cliente, o sistema registra o tier do parceiro naquele momento em uma <strong>regra travada</strong>. Essa regra define permanentemente como as comissões desse cliente serão calculadas.') +
  callout('warning', 'Fazer upgrade de tier <strong>não</strong> muda as regras de clientes já cadastrados. Cada cliente mantém as regras do tier que estava ativo no momento do cadastro.') +
  h2('Duração da comissão') +
  p('Se o tier tiver <strong>duração em meses</strong> configurada (valor > 0), a comissão expira após esse período. Após a expiração, o cliente não gera mais comissão.') +
  p('Se a duração for <strong>0</strong>, a comissão é por tempo indeterminado.') +
  h2('Congelamento por upgrade') +
  p('Se um tier tem duração limitada e o parceiro sobe de tier, os clientes cadastrados naquele tier ficam <strong>congelados</strong> — não seguem o novo percentual.') +
  h2('Modos de suporte') +
  table(
    ['Modo','Descrição'],
    [
      ['Suporte direto PacoTicket','O suporte é prestado diretamente pela plataforma ao cliente final'],
      ['Via Parceiro (intermediário)','O parceiro é o ponto de contato entre o cliente e a plataforma'],
    ]
  ),

'setup-fee': h1('Taxas de Setup') +
  p('A taxa de setup é um valor cobrado uma única vez na ativação do cliente.') +
  h2('Dois tipos de setup') +
  table(
    ['Tipo','Origem','Gera comissão?'],
    [
      ['Setup base','Definido no plano global pelo SuperAdmin','Não'],
      ['Acréscimo de setup','Definido pelo parceiro ao criar plano personalizado','Sim — vira comissão de ativação do parceiro'],
    ]
  ) +
  callout('info', 'Somente o <strong>acréscimo</strong> de setup (o valor que o parceiro adicionou acima do base) gera comissão. O setup base é receita da plataforma.') +
  h2('Como definir acréscimo de setup') +
  ol([
    'Crie um plano personalizado baseado em um plano global',
    'No campo <strong>Acréscimo de Setup</strong>, informe o valor adicional',
    'O acréscimo não pode ser menor que zero',
    'O total de setup cobrado do cliente = base + acréscimo',
  ]) +
  h2('No PDF da proposta') +
  p('O PDF exibido ao cliente mostra apenas o <strong>total de ativação</strong> (base + acréscimo somados). Nenhuma separação é exposta ao cliente.'),

'planos-parceiro': h1('Planos Personalizados do Parceiro') +
  p('O parceiro pode criar planos baseados nos planos globais, personalizando nome, módulos adicionais e taxa de setup.') +
  h2('Criar plano personalizado') +
  ol([
    'Em <strong>Tabela de Preços</strong>, encontre o plano global desejado',
    'Clique em <strong>+ Criar meu plano baseado neste</strong>',
    'Defina o nome do seu plano',
    'Adicione módulos ou recursos extras (somam ao preço mensal)',
    'Defina o acréscimo de setup (opcional)',
    'Salve o plano',
  ]) +
  h2('Regras de herança') +
  ul([
    'O preço base <strong>nunca pode ser menor</strong> que o plano base',
    'Itens de infraestrutura incluídos no plano base <strong>não podem ser removidos</strong>',
    'Adicionar módulos e recursos extras <strong>aumenta</strong> o preço mensal',
    'Remover itens da base <strong>não</strong> diminui o preço',
  ]) +
  callout('info', 'O plano personalizado herda automaticamente todos os módulos e recursos do plano global base.') +
  h2('Usar no simulador') +
  p('No menu Propostas, selecione qualquer plano global como base para simulação. Após salvar a proposta como plano, ele fica disponível em Meus Planos.'),

'autenticacao': h1('Autenticação e Sessão') +
  p('O sistema usa JWT armazenado em cookies httpOnly — mais seguros que armazenamento em JavaScript.') +
  h2('Duração da sessão') +
  table(
    ['Token','Duração'],
    [
      ['Access Token (cookie)','8 horas'],
      ['Refresh Token (cookie)','7 dias'],
    ]
  ) +
  p('Após 8 horas, o access token é renovado automaticamente usando o refresh token. Se o refresh token expirar (7 dias de inatividade), você precisará fazer login novamente.') +
  h2('Segurança dos cookies') +
  ul([
    '<strong>httpOnly</strong> — JavaScript não consegue ler o token (proteção contra XSS)',
    '<strong>Secure</strong> — enviado apenas em conexões HTTPS',
    '<strong>SameSite=Strict</strong> — proteção contra CSRF',
  ]) +
  h2('Múltiplos dispositivos') +
  p('O sistema permite múltiplas sessões simultâneas. Ao trocar a senha, <strong>todas as sessões são encerradas</strong>.') +
  callout('info', 'Ao abrir uma nova aba ou reiniciar o browser, o sistema recupera sua sessão automaticamente se o cookie ainda for válido — sem precisar fazer login novamente.'),

'recuperar-senha': h1('Recuperar Senha') +
  p('Use o fluxo de recuperação quando não conseguir acessar sua conta.') +
  ol([
    'Na tela de login, clique em <strong>Esqueceu a senha?</strong>',
    'Informe o e-mail cadastrado e clique em <strong>Enviar link de recuperação</strong>',
    'Verifique sua caixa de entrada (e pasta de spam)',
    'Clique no link recebido por e-mail',
    'Na página que abrir, defina uma nova senha (mínimo 8 caracteres)',
    'Clique em <strong>Redefinir Senha</strong>',
    'Você será redirecionado para o login',
  ]) +
  callout('warning', 'O link de recuperação expira em <strong>15 minutos</strong>. Se expirar, solicite um novo link.') +
  callout('info', 'Por segurança, o sistema confirma que "se o e-mail existir, um link foi enviado" — sem revelar se o e-mail está ou não cadastrado.') +
  h2('E-mail não chegou?') +
  ul([
    'Verifique a pasta de spam',
    'Aguarde até 5 minutos',
    'Confirme que está usando o e-mail correto',
    'Se o problema persistir, peça ao SuperAdmin para redefinir sua senha diretamente',
  ]),

}; // fim de DOCS_PAGES
```

Confirme: todas as páginas carregam corretamente no browser → avance.

---

## ETAPA 9 — Adicionar link "Documentação" nos navs

### No `superadmin.html`

```bash
grep -n "Configurações\|tab-config\|tab-btn" /home/user/parceiros/frontend/superadmin.html | tail -5
```

Use `str_replace` para adicionar o link de docs após o último botão de aba:

```html
<!-- Adicionar após o botão de Configurações: -->
<a href="docs.html" target="_blank"
   class="px-4 py-4 text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors">
  📚 Documentação
</a>
```

### No `partner.html`

```bash
grep -n "Perfil\|tab-profile\|tab-btn" /home/user/parceiros/frontend/partner.html | tail -5
```

Mesma adição após o último botão de aba.

---

## ETAPA 10 — Build Tailwind, commit e push

```bash
# Rebuild Tailwind para incluir classes usadas no docs.js
cd /home/user/parceiros/frontend
npx tailwindcss -c tailwind.config.js -i tailwind.input.css -o tailwind.min.css --minify 2>/dev/null || \
  echo "Rebuild manual não necessário — classes já na safelist"

# Verificar que docs.html e docs.js existem
ls -la /home/user/parceiros/frontend/docs.html /home/user/parceiros/frontend/docs.js

# Commit e push
cd /home/user/parceiros
git add frontend/docs.html frontend/docs.js superadmin.html partner.html
git commit -m "feat: add documentation page"
git push
```

### Deploy

```bash
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 15
docker stack services pacoticket
```