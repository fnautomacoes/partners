// docsadmin.js — Documentação do Portal SuperAdmin

// ── Menu ───────────────────────────────────────────────────
const DOCS_MENU = [
  {
    group: 'Primeiros Passos', icon: '🚀',
    items: [
      { slug: 'visao-geral', title: 'Visão Geral do Sistema' },
      { slug: 'primeiro-acesso', title: 'Primeiro Acesso' },
      { slug: 'configuracoes-iniciais', title: 'Configurações Iniciais' },
    ]
  },
  {
    group: 'Portal SuperAdmin', icon: '⚙️',
    items: [
      { slug: 'dashboard-admin', title: 'Dashboard' },
      { slug: 'parceiros', title: 'Gestão de Parceiros' },
      { slug: 'planos', title: 'Planos e Módulos' },
      { slug: 'clientes', title: 'Gestão de Clientes' },
      { slug: 'comissoes-admin', title: 'Comissões' },
      { slug: 'faturas', title: 'Faturas' },
      { slug: 'propostas-admin', title: 'Propostas' },
      { slug: 'configuracoes', title: 'Configurações do Sistema' },
    ]
  },
  {
    group: 'Regras de Negócio', icon: '📋',
    items: [
      { slug: 'tiers-comissao', title: 'Tiers e Comissionamento' },
      { slug: 'setup-fee', title: 'Taxas de Setup' },
      { slug: 'planos-parceiro', title: 'Planos Personalizados' },
    ]
  },
  {
    group: 'Segurança e Acesso', icon: '🔒',
    items: [
      { slug: 'autenticacao', title: 'Autenticação e Sessão' },
      { slug: 'recuperar-senha', title: 'Recuperar Senha' },
    ]
  },
];

// ── Roteamento por hash ────────────────────────────────────
function getSlugFromHash() { return window.location.hash.replace('#', '') || 'visao-geral'; }

window.addEventListener('hashchange', () => {
  const slug = getSlugFromHash();
  renderSidebar(slug); renderPage(slug);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Sidebar ────────────────────────────────────────────────
function renderSidebar(activeSlug) {
  const el = document.getElementById('docsSidebar');
  if (!el) return;
  el.innerHTML = DOCS_MENU.map(group => `
    <div class="doc-nav-group">
      <p class="doc-nav-title">${group.icon} ${group.group}</p>
      ${group.items.map(item => `<a href="#${item.slug}" class="doc-nav-link ${item.slug === activeSlug ? 'active' : ''}">${item.title}</a>`).join('')}
    </div>`).join('');
}

// ── Render de página ───────────────────────────────────────
function renderPage(slug) {
  const el = document.getElementById('docsContent');
  if (!el) return;
  const page = DOCS_PAGES[slug];
  if (!page) {
    el.innerHTML = `<div class="doc-empty"><p style="font-size:2.5rem">📄</p><h2 class="doc-h2">Página não encontrada</h2><p class="doc-p">O slug "<code>${slug}</code>" não existe.</p></div>`;
    return;
  }
  const allSlugs = DOCS_MENU.flatMap(g => g.items.map(i => i.slug));
  const idx = allSlugs.indexOf(slug);
  const prev = idx > 0 ? allSlugs[idx - 1] : null;
  const next = idx < allSlugs.length - 1 ? allSlugs[idx + 1] : null;
  const all = DOCS_MENU.flatMap(g => g.items);
  const prevItem = prev ? all.find(i => i.slug === prev) : null;
  const nextItem = next ? all.find(i => i.slug === next) : null;
  el.innerHTML = `
    <article class="doc-content">${page}</article>
    <div class="doc-prevnext">
      ${prevItem ? `<a href="#${prev}">← ${prevItem.title}</a>` : '<div></div>'}
      ${nextItem ? `<a href="#${next}">${nextItem.title} →</a>` : '<div></div>'}
    </div>`;
}

// ── Helpers ────────────────────────────────────────────────
function h1(t){return `<h1 class="doc-h1">${t}</h1>`;}
function h2(t){return `<h2 class="doc-h2">${t}</h2>`;}
function h3(t){return `<h3 class="doc-h3">${t}</h3>`;}
function p(t){return `<p class="doc-p">${t}</p>`;}
function ul(items){return `<ul class="doc-ul">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;}
function ol(items){return `<ol class="doc-ol">${items.map(i=>`<li>${i}</li>`).join('')}</ol>`;}
function callout(type,text){
  const ic={info:'💡',warning:'⚠️',danger:'🚨',success:'✅'};
  return `<div class="doc-callout ${type||'info'}">${ic[type]||'💡'} ${text}</div>`;
}
function badge(text,color='blue'){return `<span class="doc-badge ${color}">${text}</span>`;}
function table(headers,rows){
  return `<div class="doc-table-wrap"><table class="doc-table">
    <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ── Conteúdo ───────────────────────────────────────────────
const DOCS_PAGES = {

'visao-geral': h1('Visão Geral do Sistema') +
  p('Este sistema permite que o <strong>SuperAdmin</strong> gerencie planos, parceiros, clientes e comissões, enquanto cada <strong>parceiro</strong> tem seu próprio painel para acompanhar clientes, comissões e criar propostas.') +
  h2('Dois portais') +
  table(['Portal','Quem acessa','O que faz'],[
    ['SuperAdmin','Administrador do sistema','Gerencia tudo: parceiros, planos, módulos, comissões, configurações'],
    ['Parceiro','Parceiro cadastrado','Gerencia seus clientes, acompanha comissões, cria propostas'],
  ]) +
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
  p('Acesse o sistema pelo endereço configurado. A tela de login é unificada — o sistema redireciona automaticamente para o portal correto conforme o perfil.') +
  callout('danger', '<strong>Troque a senha imediatamente</strong> após o primeiro acesso, em <strong>Meu Perfil → Trocar Senha</strong>.') +
  h2('Recuperar senha') +
  ol([
    'Na tela de login, clique em <strong>Esqueci minha senha</strong>',
    'Informe o e-mail cadastrado',
    'Abra o link recebido (expira em 15 minutos)',
    'Defina a nova senha',
  ]) +
  callout('warning', 'O envio de e-mail depende da configuração SMTP (em Configurações ou variáveis de ambiente). Sem SMTP válido, o e-mail não é enviado.'),

'configuracoes-iniciais': h1('Configurações Iniciais') +
  p('Antes de cadastrar parceiros e clientes, configure o sistema em <strong>Configurações</strong>.') +
  h2('Identidade visual (White-Label)') +
  ul([
    '<strong>Nome do Sistema</strong> — aparece em e-mails, PDFs e textos',
    '<strong>Logo Login</strong> — exibida na tela de login',
    '<strong>Logo Interna</strong> — exibida no cabeçalho dos painéis e nesta documentação',
    '<strong>Logo (para PDF)</strong> — usada no topo das propostas geradas',
    '<strong>Largura Logo Login</strong> — largura em px na tela de login',
    '<strong>Cores</strong> — paleta da marca aplicada em tempo real',
  ]) +
  h2('URL da API PacoTicket') +
  p('Defina a URL base da API em Configurações. É usada em todas as integrações (criação de clientes, sincronização de faturas).') +
  h2('Preços dos Módulos') +
  p('Configure preço, taxa de setup, descrição e visibilidade de cada módulo. Módulos com <strong>Visível</strong> desmarcado não aparecem para o parceiro.') +
  callout('info', 'Alterar preços de módulos não recalcula planos já cadastrados. Edite os planos manualmente se necessário.') +
  h2('Tiers de Comissionamento') +
  p('Configure os tiers: faixa de clientes, percentual, modo de suporte, duração e comissão sobre setup.'),

'dashboard-admin': h1('Dashboard') +
  p('Visão consolidada de toda a operação em tempo real.') +
  table(['Card','O que mostra'],[
    ['Parceiros Ativos','Total de parceiros com status ATIVO'],
    ['Clientes Ativos','Total de clientes ATIVOS em todos os parceiros'],
    ['Comissões Pendentes','Valor total de comissões ainda não pagas'],
    ['Receita Mensal','Soma das mensalidades dos planos com clientes ativos'],
  ]) +
  h2('Distribuição por Tier') +
  p('Mostra quantos parceiros estão em cada tier, com nome, faixa de clientes, percentual e contagem.') +
  h2('Top Parceiros') +
  p('Os parceiros com mais clientes ativos, com nome, tier (badge) e contagem.') +
  h2('Atividades Recentes') +
  p('Log das últimas ações: clientes criados, parceiros criados, comissões pagas, etc.'),

'parceiros': h1('Gestão de Parceiros') +
  p('Cadastre, edite, visualize clientes e configure as permissões de cada parceiro.') +
  h2('Cadastrar novo parceiro') +
  ol([
    'Clique em <strong>+ Novo Parceiro</strong>',
    'Preencha nome, e-mail, telefone e CPF/CNPJ (opcional)',
    'Defina a senha de acesso ao portal',
    'Configure as permissões de cadastro de clientes',
    'Clique em <strong>Salvar</strong>',
  ]) +
  h2('Permissões de cadastro') +
  table(['Permissão','Ativada','Desativada'],[
    ['Definir Recorrência','Parceiro escolhe Mensal/Trimestral/Semestral/Anual','Sempre Mensal'],
    ['Definir Vencimento','Parceiro escolhe a data de vencimento','Vencimento = cadastro + 2 dias'],
  ]) +
  callout('info', 'Desativar um parceiro não remove seus clientes — apenas impede novos acessos ao portal (soft delete).'),

'planos': h1('Planos e Módulos') +
  p('Planos são configurados exclusivamente pelo SuperAdmin e representam as ofertas disponíveis para os clientes.') +
  callout('info', '<strong>Regra fundamental:</strong> o <code>totalPrice</code> de um plano é igual ao <code>basePrice</code>. Módulos e recursos documentam o que está incluso, sem inflar o preço.') +
  h2('Criar novo plano') +
  ol([
    'Clique em <strong>+ Novo Plano</strong>',
    'Defina nome, descrição e preço base (mensal)',
    'Configure a infraestrutura: usuários, filas, conexões WhatsApp/Instagram',
    'Ative os módulos incluídos',
    'Defina a taxa de setup (cobrada 1× na ativação) — opcional',
    'Defina a ordem de apresentação',
    'Clique em <strong>Salvar</strong>',
  ]) +
  h2('Campos de infraestrutura') +
  table(['Campo','Descrição'],[
    ['Usuários','Usuários com acesso ao sistema'],
    ['Filas','Filas de atendimento'],
    ['WhatsApp Não Oficial','Conexões via API não oficial'],
    ['WhatsApp Oficial (WABA)','Conexões via API oficial Meta'],
    ['Instagram','Conexões Instagram'],
  ]) +
  h2('Plano global vs. de parceiro') +
  p('Plano <strong>global</strong> (sem dono) fica disponível a todos os parceiros. Plano de <strong>parceiro</strong> é privado, criado por ele a partir de um global.') +
  h2('ID do Plano PacoTicket') +
  p('Campo opcional para identificação cruzada com a plataforma PacoTicket. Não afeta preço nem comissão.'),

'clientes': h1('Gestão de Clientes') +
  p('O SuperAdmin visualiza todos os clientes de todos os parceiros e pode cadastrar, editar ou desativar qualquer cliente.') +
  h2('Filtros disponíveis') +
  ul(['Parceiro','Status (Ativo/Inativo/Suspenso)','Plano']) +
  h2('Cadastrar cliente') +
  ol([
    'Clique em <strong>+ Novo Cliente</strong>',
    'Preencha dados da empresa e contato',
    'Selecione o parceiro responsável e o plano',
    'Defina recorrência e vencimento',
    'Clique em <strong>Salvar</strong>',
  ]) +
  p('Ao salvar, o sistema cria o cliente no banco e registra a empresa na API PacoTicket.') +
  callout('info', 'Falha na API PacoTicket não cancela a criação: o cliente é salvo com <code>pacoticketId</code> nulo e o erro é registrado em ActivityLog.') +
  h2('Add-ons por cliente') +
  p('Módulos ou recursos extras além do plano base. O SuperAdmin pode aplicar descontos; parceiros não.') +
  callout('warning', 'Desativar um cliente não cancela faturas em aberto na API PacoTicket — faça isso manualmente na plataforma.'),

'comissoes-admin': h1('Comissões') +
  p('Calcule, visualize e marque como pagas as comissões de todos os parceiros.') +
  h2('Calcular comissões') +
  ol([
    'Vá em <strong>Comissões</strong>',
    'Selecione o mês/ano',
    'Clique em <strong>Calcular Comissões</strong>',
    'O sistema processa as faturas pagas do período e gera os registros',
  ]) +
  callout('info', 'Comissões são calculadas sobre <strong>faturas pagas</strong>, não sobre o valor do plano. Sem faturas pagas, não há comissão.') +
  h2('Tipos de comissão') +
  table(['Tipo','Quando ocorre','Base'],[
    ['Mensalidade','Todo período com fatura paga','valor da fatura × % do tier'],
    ['Setup (1×)','Apenas no 1º período do cliente','acréscimo de setup × % do tier'],
  ]) +
  callout('warning', 'A comissão de setup só ocorre quando o parceiro definiu um <strong>acréscimo</strong> na taxa de setup. O setup base do catálogo não gera comissão.') +
  h2('Marcar como pago') +
  p('Clique em <strong>Pagar</strong> na linha da comissão; o status muda para PAGO e registra a data.'),

'faturas': h1('Faturas') +
  p('Faturas são sincronizadas da plataforma PacoTicket. O sistema não gera faturas — apenas as importa para cálculo de comissões.') +
  h2('Sincronizar') +
  ol([
    'Vá em <strong>Faturas</strong>',
    'Clique em <strong>Sincronizar</strong>',
    'O sistema busca as faturas na API e atualiza o banco (upsert por referência)',
  ]) +
  h2('Status') +
  table(['Status','Significado'],[
    [badge('Pendente','amber'),'Gerada, aguardando pagamento'],
    [badge('Pago','green'),'Paga — gera comissão no próximo cálculo'],
    [badge('Vencido','red'),'Vencida e não paga'],
    [badge('Cancelado','gray'),'Cancelada'],
  ]) +
  callout('info', 'Apenas faturas <strong>PAGAS</strong> entram no cálculo de comissões.'),

'propostas-admin': h1('Propostas') +
  p('Visualize todas as propostas geradas pelos parceiros, podendo baixar ou excluir.') +
  h2('Colunas') +
  table(['Coluna','Descrição'],[
    ['ID','Código único da proposta (ex: KT3RQ_29032026)'],
    ['Plano','Nome do plano cotado'],
    ['Parceiro','Parceiro que gerou'],
    ['Lead/Cliente','Vínculo da proposta'],
    ['Data','Data de geração'],
  ]) +
  h2('Ações') +
  ul([
    '<strong>Baixar</strong> — download do PDF',
    '<strong>Excluir</strong> — remove do banco e do disco do servidor',
  ]),

'configuracoes': h1('Configurações do Sistema') +
  p('Centraliza toda a personalização do sistema.') +
  table(['Seção','O que configura'],[
    ['Configurações Gerais','Nome do sistema, URLs, logos, favicon, largura da logo de login, webhook'],
    ['Preços dos Módulos','Preço, setup, descrição, visibilidade e nome de cada módulo'],
    ['Configuração de PDF','Margens e espaçamento das propostas geradas'],
    ['Recursos de Infraestrutura','Preço por unidade de conexões, usuários e filas'],
    ['Tiers de Comissionamento','Criar/editar/excluir tiers (%, faixa, duração, suporte, setup)'],
    ['Token PacoTicket','Definido por variável de ambiente — não editável pelo painel'],
    ['E-mail (SMTP)','Host, porta, modo de segurança, usuário, senha e remetente'],
    ['Identidade Visual / Cores','Paleta de cores da marca, com preview em tempo real'],
  ]) +
  callout('info', 'Alterações de cor são aplicadas em tempo real no painel antes de salvar.') +
  h2('Restaurar cores padrão') +
  p('Use <strong>Restaurar Padrão</strong> na seção de cores para voltar à paleta oficial.'),

'tiers-comissao': h1('Tiers e Comissionamento') +
  p('O sistema de comissões é baseado em tiers configuráveis. Cada tier define o percentual sobre as faturas pagas dos clientes do parceiro.') +
  h2('Regra travada no cadastro') +
  p('Ao cadastrar um cliente, o tier do parceiro naquele momento é registrado em uma <strong>regra imutável</strong> (ClientCommissionRule), que define permanentemente o cálculo daquele cliente.') +
  callout('warning', 'Upgrade de tier <strong>não</strong> altera clientes já cadastrados — cada um mantém a regra do tier ativo no momento do cadastro.') +
  h2('Determinação do tier') +
  ol([
    'Conta os clientes ATIVOS do parceiro',
    'Seleciona o tier mais alto cuja faixa contém essa quantidade',
    'Se nenhum casar (ex.: 0 clientes), usa o tier de entrada',
  ]) +
  h2('Duração e suporte') +
  ul([
    '<strong>Duração (meses)</strong>: > 0 expira após N meses; 0 = indeterminado',
    '<strong>Modo de suporte</strong>: PacoTicket direto ou Via Parceiro (intermediário)',
    '<strong>Comissão sobre setup</strong>: habilita comissão na ativação',
  ]),

'setup-fee': h1('Taxas de Setup') +
  p('A taxa de setup é cobrada uma única vez na ativação do cliente.') +
  table(['Tipo','Origem','Gera comissão?'],[
    ['Setup base','Definido no plano global pelo SuperAdmin','Não'],
    ['Acréscimo de setup','Definido pelo parceiro ao criar plano personalizado','Sim — comissão de ativação do parceiro'],
  ]) +
  callout('info', 'Somente o <strong>acréscimo</strong> de setup gera comissão. O setup base é receita da plataforma.') +
  callout('warning', 'A comissão de setup é paga <strong>uma única vez</strong> por par (parceiro, cliente) — o sistema verifica o histórico antes de incluir no cálculo.'),

'planos-parceiro': h1('Planos Personalizados do Parceiro') +
  p('Parceiros podem criar planos baseados nos planos globais, personalizando nome, módulos e taxa de setup.') +
  h2('Regras de herança') +
  ul([
    'O plano herda módulos e recursos do plano base',
    'Itens incluídos na base não podem ser removidos',
    'Módulos/recursos extras aumentam o preço mensal',
    'O acréscimo de setup vira comissão de ativação do parceiro',
  ]) +
  callout('info', 'Ao criar/editar um plano de parceiro, o sistema dispara o webhook configurado (Webhook — Plano Salvo), se houver.') +
  h2('Onde aparece') +
  p('Planos de parceiro aparecem em <strong>Planos</strong> (filtro "De Parceiros") com o nome do dono e o plano base de origem.'),

'autenticacao': h1('Autenticação e Sessão') +
  p('O sistema usa JWT em cookies httpOnly — mais seguros que armazenamento em JavaScript.') +
  table(['Token','Duração'],[
    ['Access Token','8 horas'],
    ['Refresh Token','7 dias (com rotação)'],
  ]) +
  h2('Segurança') +
  ul([
    '<strong>httpOnly</strong> — JavaScript não lê o token (anti-XSS)',
    '<strong>Secure</strong> — apenas em HTTPS (produção)',
    '<strong>SameSite=Strict</strong> — anti-CSRF',
    '<strong>Rotação do refresh token</strong> — reutilização detectada encerra a sessão (401)',
  ]) +
  callout('info', 'Trocar a senha revoga <strong>todas</strong> as sessões ativas.'),

'recuperar-senha': h1('Recuperar Senha') +
  ol([
    'Na tela de login, clique em <strong>Esqueci minha senha</strong>',
    'Informe o e-mail e envie',
    'Abra o link recebido (verifique o spam)',
    'Defina a nova senha (mínimo 8 caracteres) e confirme',
  ]) +
  callout('warning', 'O link expira em <strong>15 minutos</strong> e é de uso único.') +
  callout('info', 'Por segurança (anti-enumeração), o sistema sempre responde "se o e-mail existir, um link foi enviado", sem revelar se o e-mail está cadastrado.'),

};

// ── Branding + Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/system-config').then(r => r.json()).then(json => {
    const cfg = json?.data || {};
    if (cfg.colorBrandPrimary) document.documentElement.style.setProperty('--primary', cfg.colorBrandPrimary);
    const name = cfg.businessName || 'PacoTicket';
    const logo = document.getElementById('headerLogo');
    const nameEl = document.getElementById('headerName');
    if (cfg.logoInternal && logo) {
      logo.src = cfg.logoInternal; logo.classList.remove('hidden');
      if (nameEl) nameEl.classList.add('hidden');
    } else if (nameEl) {
      nameEl.textContent = name + ' — Documentação';
    }
    document.title = name + ' — Documentação SuperAdmin';
  }).catch(() => {});

  const slug = getSlugFromHash();
  renderSidebar(slug); renderPage(slug);
});
