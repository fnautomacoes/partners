// docs.js — Documentação do Portal do Parceiro

// ── Menu ───────────────────────────────────────────────────
const DOCS_MENU = [
  {
    group: 'Primeiros Passos', icon: '🚀',
    items: [
      { slug: 'visao-geral', title: 'Visão Geral' },
      { slug: 'primeiro-acesso', title: 'Primeiro Acesso' },
    ]
  },
  {
    group: 'Portal do Parceiro', icon: '🤝',
    items: [
      { slug: 'dashboard-parceiro', title: 'Dashboard' },
      { slug: 'meus-clientes', title: 'Meus Clientes' },
      { slug: 'comissoes-parceiro', title: 'Minhas Comissões' },
      { slug: 'tabela-precos', title: 'Tabela de Preços' },
      { slug: 'funil', title: 'Funil de Vendas (CRM)' },
      { slug: 'propostas-parceiro', title: 'Propostas e Simulador' },
      { slug: 'meu-perfil', title: 'Meu Perfil' },
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

// ── Helpers de conteúdo ────────────────────────────────────
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

'visao-geral': h1('Visão Geral') +
  p('Bem-vindo ao seu portal de parceiro. Aqui você gerencia seus clientes, acompanha suas comissões, monta propostas comerciais e organiza seus leads em um funil de vendas.') +
  h2('O que você faz no portal') +
  ul([
    'Cadastra e gerencia seus <strong>clientes</strong>, vinculando cada um a um plano',
    'Acompanha suas <strong>comissões</strong> de mensalidade e de setup',
    'Consulta a <strong>tabela de preços</strong> e cria <strong>planos personalizados</strong>',
    'Organiza <strong>leads</strong> no funil de vendas (CRM)',
    'Gera <strong>propostas em PDF</strong> profissionais para enviar ao cliente final',
  ]) +
  h2('Fluxo básico') +
  ol([
    'Cadastre um lead no Funil e trabalhe a negociação',
    'Monte uma proposta no Simulador e gere o PDF para o cliente',
    'Converta o lead em cliente, vinculando-o a um plano',
    'As faturas são geradas pela plataforma PacoTicket',
    'Suas comissões são calculadas sobre as faturas pagas e aparecem no painel',
  ]) +
  callout('info', 'Os valores e textos exibidos vêm sempre da plataforma — preços de planos/módulos, tiers e regras são definidos pelo administrador.'),

'primeiro-acesso': h1('Primeiro Acesso') +
  h2('Login') +
  p('Acesse o sistema pelo endereço informado pelo administrador. A tela de login é unificada — após entrar, você é direcionado automaticamente ao Portal do Parceiro.') +
  callout('danger', '<strong>Troque sua senha</strong> no primeiro acesso, em <strong>Meu Perfil → Trocar Senha</strong>.') +
  h2('Esqueceu a senha?') +
  ol([
    'Na tela de login, clique em <strong>Esqueci minha senha</strong>',
    'Informe o e-mail cadastrado',
    'Abra o link recebido por e-mail (expira em 15 minutos)',
    'Defina a nova senha',
  ]) +
  callout('warning', 'Se não receber o e-mail, verifique a pasta de spam e confirme o endereço. Persistindo, peça ao administrador para redefinir.'),

'dashboard-parceiro': h1('Dashboard') +
  p('O dashboard mostra sua situação atual: tier, progresso e os principais indicadores.') +
  h2('Card de Tier') +
  p('Exibe seu tier atual (Indicador / Parceiro / Master), o percentual de comissão e a barra de progresso para o próximo tier.') +
  callout('warning', 'Se o seu tier tem tempo de comissão limitado, os clientes adquiridos <strong>continuam com a regra travada na data do cadastro</strong> mesmo após você subir de tier.') +
  h2('Indicadores') +
  table(['Card','O que mostra'],[
    ['Clientes Ativos','Seus clientes com status ATIVO'],
    ['Comissão Pendente','Total de comissões ainda não pagas'],
    ['Faturas Pagas','Faturas pagas no período'],
    ['Próximo Vencimento','Cliente com vencimento mais próximo'],
  ]),

'meus-clientes': h1('Meus Clientes') +
  p('Gerencie todos os seus clientes: cadastrar, editar, adicionar módulos extras e acompanhar o status das faturas.') +
  h2('Cadastrar novo cliente') +
  ol([
    'Clique em <strong>+ Novo Cliente</strong>',
    'Preencha os dados da empresa e do contato',
    'Selecione o plano',
    'Defina recorrência e vencimento (se sua conta tiver essas permissões)',
    'Adicione módulos ou recursos extras, se necessário',
    'Clique em <strong>Salvar</strong>',
  ]) +
  callout('info', 'Sem permissão para definir recorrência/vencimento, o sistema usa <strong>Mensal</strong> e <strong>hoje + 2 dias</strong> automaticamente.') +
  callout('info', 'Uma eventual falha na API PacoTicket <strong>não cancela</strong> a criação do cliente — ele é salvo localmente e a integração é re-tentada.') +
  h2('Add-ons (extras)') +
  p('Você pode adicionar módulos ou recursos de infraestrutura além do plano base. Os preços são os do catálogo — sem desconto.') +
  callout('warning', 'Apenas o administrador pode aplicar descontos em add-ons.') +
  h2('Status da fatura') +
  table(['Badge','Significado'],[
    [badge('Pago','green'),'Última fatura paga'],
    [badge('Pendente','amber'),'Aguardando pagamento'],
    [badge('Vencido','red'),'Prazo excedido sem pagamento'],
    [badge('Sem fatura','gray'),'Nenhuma fatura sincronizada ainda'],
  ]),

'comissoes-parceiro': h1('Minhas Comissões') +
  p('Acompanhe todas as suas comissões: mensalidade, setup e totais por período.') +
  table(['Coluna','Descrição'],[
    ['Mensalidade','Comissão recorrente sobre o valor da fatura paga'],
    ['Setup (1×)','Comissão sobre o acréscimo de setup que você definiu ao criar o plano — cobrada uma única vez'],
    ['Total','Mensalidade + Setup do período'],
  ]) +
  callout('info', 'A comissão de setup aparece apenas no <strong>primeiro período</strong> do cliente e somente quando você definiu um acréscimo de setup ao criar o plano personalizado.') +
  h2('Resumo') +
  p('No topo da tela aparecem os totais de comissão pendente e paga do período selecionado.'),

'tabela-precos': h1('Tabela de Preços') +
  p('Visualize todos os planos disponíveis com a composição detalhada e a estimativa de comissão para o seu tier.') +
  h2('Planos Globais e Meus Planos') +
  p('Use os filtros no topo para alternar entre <strong>Planos Globais</strong> (criados pelo administrador) e os seus <strong>Planos Personalizados</strong>.') +
  h2('O que cada card mostra') +
  ul([
    '<strong>Preço mensal</strong> do plano',
    '<strong>BASE</strong> — usuários, filas e conexões inclusos',
    '<strong>Módulos incluídos</strong> com ícones',
    '<strong>Taxa de setup</strong> (cobrada 1× na ativação)',
    '<strong>Sua comissão estimada</strong> — calculada pelo seu tier atual',
    'Botão <strong>+ Criar plano baseado neste</strong> (nos planos globais)',
  ]) +
  h2('Regras de Comissionamento') +
  p('Mais abaixo na tela, você vê os tiers, a barra de progresso e os avisos sobre duração da comissão e comissão de setup.') +
  callout('info', 'Somente o <strong>acréscimo</strong> de setup definido por você gera comissão de ativação. Sem acréscimo, a comissão é apenas sobre a mensalidade.'),

'funil': h1('Funil de Vendas (CRM)') +
  p('Gerencie seus leads do primeiro contato até a conversão em cliente, em um quadro Kanban.') +
  h2('Estágios') +
  p('No primeiro acesso ao Funil, são criados automaticamente 6 estágios padrão. Você pode adicionar, renomear e remover estágios.') +
  callout('info', 'Ao excluir um estágio, os leads são movidos para o próximo. Não é possível excluir o último estágio.') +
  h2('Criar e mover leads') +
  ol([
    'Clique em <strong>+ Novo Lead</strong>',
    'Preencha empresa, contato, plano de interesse e notas',
    'Arraste o card entre os estágios conforme a negociação evolui',
  ]) +
  p('Cada mudança de estágio é registrada automaticamente no histórico do lead.') +
  h2('Converter em cliente') +
  p('Use a opção <strong>Promover</strong> no lead para convertê-lo em cliente, aproveitando os dados já preenchidos.'),

'propostas-parceiro': h1('Propostas e Simulador') +
  p('Monte simulações de planos, gere PDFs profissionais para o cliente e salve propostas vinculadas a um lead.') +
  h2('Montar a simulação') +
  ol([
    'Selecione um <strong>plano base</strong>',
    'Adicione <strong>módulos extras</strong> (toggles) se necessário',
    'Ajuste os <strong>recursos de infraestrutura</strong> extras',
    'Informe o <strong>acréscimo de setup</strong> (opcional — vira sua comissão de ativação)',
    'Confira o resumo com <strong>comissão estimada</strong>',
  ]) +
  h2('Gerar o PDF') +
  ol([
    'Dê um nome ao plano personalizado',
    'Vincule a um lead (opcional)',
    'Use <strong>Gerar PDF (sem salvar plano)</strong>, <strong>Salvar + PDF</strong> ou apenas <strong>Salvar Plano</strong>',
  ]) +
  callout('info', 'O PDF é formatado para o <strong>cliente final</strong> — não contém comissão, tier nem dados internos do programa de parceiros.') +
  h2('Propostas geradas') +
  p('No topo da tela há o histórico de propostas. Busque por ID ou cliente e baixe qualquer proposta anterior.'),

'meu-perfil': h1('Meu Perfil') +
  p('Atualize seus dados de contato e troque sua senha de acesso.') +
  h2('Dados editáveis') +
  ul(['Telefone','E-mail (usado no login)']) +
  callout('info', 'Nome e CPF/CNPJ são definidos pelo administrador e não podem ser alterados pelo portal.') +
  h2('Trocar senha') +
  ol([
    'Informe a <strong>senha atual</strong>',
    'Informe a <strong>nova senha</strong> (mínimo 8 caracteres) e confirme',
    'Clique em <strong>Salvar</strong>',
  ]) +
  callout('warning', 'Ao trocar a senha, <strong>todas as sessões ativas</strong> são encerradas. Você precisará fazer login novamente.'),

'tiers-comissao': h1('Tiers e Comissionamento') +
  p('Suas comissões são baseadas em tiers. Cada tier define o percentual sobre as faturas pagas dos seus clientes.') +
  h2('Como funciona') +
  p('Ao cadastrar um cliente, o sistema registra o seu tier naquele momento em uma <strong>regra travada</strong>, que define permanentemente como as comissões daquele cliente são calculadas.') +
  callout('warning', 'Subir de tier <strong>não</strong> muda as regras de clientes já cadastrados — cada cliente mantém as regras do tier ativo no momento do cadastro.') +
  h2('Duração da comissão') +
  p('Se o tier tem <strong>duração em meses</strong> (valor > 0), a comissão expira após esse período. Se a duração for <strong>0</strong>, é por tempo indeterminado.') +
  h2('Tiers padrão') +
  table(['Tier','Clientes','Comissão'],[
    ['Indicador','1–2','15%'],
    ['Parceiro','3–9','25%'],
    ['Master','10+','35%'],
  ]) +
  callout('info', 'Os valores acima são os padrões — os percentuais e faixas reais são os configurados pelo administrador e exibidos na Tabela de Preços.'),

'setup-fee': h1('Taxas de Setup') +
  p('A taxa de setup é um valor cobrado uma única vez na ativação do cliente.') +
  table(['Tipo','Origem','Gera comissão?'],[
    ['Setup base','Definido no plano global pelo administrador','Não'],
    ['Acréscimo de setup','Definido por você ao criar um plano personalizado','Sim — vira sua comissão de ativação'],
  ]) +
  callout('info', 'Somente o <strong>acréscimo</strong> de setup (o valor que você adicionou acima do base) gera comissão. O setup base é receita da plataforma.') +
  h2('No PDF da proposta') +
  p('O PDF mostra ao cliente apenas o <strong>total de ativação</strong> (base + acréscimo somados). Nenhuma separação é exposta.'),

'planos-parceiro': h1('Planos Personalizados') +
  p('Você pode criar planos baseados nos planos globais, personalizando nome, módulos e taxa de setup.') +
  h2('Criar') +
  ol([
    'Na <strong>Tabela de Preços</strong>, clique em <strong>+ Criar plano baseado neste</strong> no plano global desejado',
    'Defina o nome do seu plano',
    'Adicione módulos/recursos extras (somam ao preço mensal)',
    'Defina o acréscimo de setup (opcional)',
    'Salve',
  ]) +
  h2('Regras de herança') +
  ul([
    'O plano herda automaticamente os módulos e recursos do plano base',
    'Itens incluídos na base <strong>não podem ser removidos</strong>',
    'Módulos/recursos extras <strong>aumentam</strong> o preço mensal',
  ]) +
  callout('info', 'Após salvar, o plano aparece em <strong>Tabela de Preços → De Parceiros</strong> e pode ser usado nas propostas.'),

'autenticacao': h1('Autenticação e Sessão') +
  p('O sistema usa JWT armazenado em cookies httpOnly — mais seguros que armazenamento em JavaScript.') +
  table(['Token','Duração'],[
    ['Access Token','8 horas'],
    ['Refresh Token','7 dias'],
  ]) +
  p('O access token é renovado automaticamente. Após 7 dias de inatividade, é necessário fazer login novamente.') +
  h2('Segurança dos cookies') +
  ul([
    '<strong>httpOnly</strong> — JavaScript não lê o token (proteção contra XSS)',
    '<strong>Secure</strong> — enviado apenas via HTTPS',
    '<strong>SameSite=Strict</strong> — proteção contra CSRF',
  ]) +
  callout('info', 'Ao trocar a senha, todas as sessões ativas são encerradas.'),

'recuperar-senha': h1('Recuperar Senha') +
  ol([
    'Na tela de login, clique em <strong>Esqueci minha senha</strong>',
    'Informe o e-mail cadastrado e envie',
    'Abra o link recebido (verifique o spam)',
    'Defina a nova senha (mínimo 8 caracteres) e confirme',
  ]) +
  callout('warning', 'O link expira em <strong>15 minutos</strong>. Se expirar, solicite um novo.') +
  callout('info', 'Por segurança, o sistema sempre responde "se o e-mail existir, um link foi enviado" — sem revelar se o e-mail está cadastrado.'),

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
    document.title = name + ' — Documentação do Parceiro';
  }).catch(() => {});

  const slug = getSlugFromHash();
  renderSidebar(slug); renderPage(slug);
});
