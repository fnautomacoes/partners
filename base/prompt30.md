# Adicionar Conteúdo ao `docs.js` — Pequenos Appends

## Contexto
`docs.js` tem 135 linhas com estrutura base e `DOCS_MENU`.
Falta adicionar `DOCS_PAGES` com o conteúdo de cada página.
**Cada etapa faz um `cat >>` pequeno. Confirme antes de avançar.**

---

## ETAPA 1 — Abrir o objeto DOCS_PAGES + páginas de Primeiros Passos

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

// ── DOCS_PAGES ───────────────────────────────────────────
const DOCS_PAGES = {

'visao-geral':
  h1('Visão Geral do Sistema') +
  p('Este sistema permite que o <strong>SuperAdmin</strong> gerencie planos, parceiros, clientes e comissões, enquanto cada <strong>parceiro</strong> tem seu painel para acompanhar clientes, comissões e criar propostas.') +
  h2('Dois portais') +
  tbl(['Portal','Quem acessa','O que faz'],[
    ['SuperAdmin','Administrador','Gerencia tudo: parceiros, planos, módulos, comissões, configurações'],
    ['Parceiro','Revendedor cadastrado','Gerencia seus clientes, acompanha comissões, cria propostas'],
  ]) +
  h2('Fluxo básico') +
  ol(['SuperAdmin cria planos e configura módulos','SuperAdmin cadastra parceiros e permissões','Parceiro cadastra clientes em planos','Faturas são sincronizadas da API PacoTicket','SuperAdmin calcula comissões do período','Parceiro acompanha comissões no painel']) +
  callout('info','Planos são 100% internos — nunca importados da API PacoTicket. O campo <strong>ID do Plano PacoTicket</strong> serve apenas para identificação cruzada.'),

'primeiro-acesso':
  h1('Primeiro Acesso') +
  h2('Tela de Login') +
  p('Acesse pelo endereço do sistema. A tela de login é unificada — o sistema redireciona para o portal correto com base no perfil.') +
  tbl(['Credencial padrão','Valor'],[['E-mail','admin@pacoticket.com.br'],['Senha','admin123']]) +
  callout('danger','<strong>Troque a senha imediatamente</strong> após o primeiro acesso em Configurações → Trocar Senha.') +
  h2('Recuperar senha') +
  ol(['Na tela de login clique em <strong>Esqueceu a senha?</strong>','Informe o e-mail cadastrado','Verifique a caixa de entrada — link expira em 15 minutos','Clique no link e defina a nova senha']) +
  callout('warning','O envio de e-mail depende de configuração SMTP no servidor. Se não receber o e-mail, verifique com o administrador.'),

'configuracoes-iniciais':
  h1('Configurações Iniciais') +
  p('Antes de cadastrar parceiros e clientes, configure o sistema em <strong>SuperAdmin → Configurações</strong>.') +
  h2('White-Label') +
  ul(['<strong>Nome do Negócio</strong> — aparece em e-mails, PDFs e textos','<strong>Logo de Login</strong> — URL de imagem exibida na tela de login','<strong>Logo Interna</strong> — exibida no header do sistema','<strong>Logo para PDFs</strong> — cabeçalho das propostas geradas','<strong>Largura da Logo</strong> — em pixels; altura se adapta']) +
  h2('URL da API PacoTicket') +
  p('Configure em Configurações → URL da API. Padrão: <code>https://api.pacoticket.com.br</code>') +
  callout('warning','Esta URL é usada em todas as integrações. Altere apenas se a API PacoTicket mudar de endereço.') +
  h2('Preços dos Módulos') +
  p('Configure preço e taxa de setup de cada módulo. Módulos com <strong>Visível</strong> desmarcado não aparecem no montador de planos.') +
  callout('info','Alterar preços de módulos não recalcula planos já cadastrados.'),

EOF
echo "Etapa 1 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas"
```

---

## ETAPA 2 — Portal SuperAdmin: Dashboard, Parceiros, Planos

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

'dashboard-admin':
  h1('Dashboard do SuperAdmin') +
  p('Visão consolidada de toda a operação em tempo real.') +
  h2('KPIs') +
  tbl(['Card','O que mostra'],[
    ['Parceiros Ativos','Parceiros com status ATIVO'],
    ['Clientes Ativos','Clientes ATIVOS em todos os parceiros'],
    ['Comissões Pendentes','Valor total de comissões não pagas'],
    ['Receita Mensal','Soma dos basePrice de todos os planos com clientes ativos'],
  ]) +
  h2('Outros elementos') +
  ul(['<strong>Distribuição por Tier</strong> — quantos parceiros em cada tier','<strong>Top Parceiros</strong> — 5 parceiros com mais clientes ativos','<strong>Atividades Recentes</strong> — log de ações do sistema']),

'parceiros':
  h1('Gestão de Parceiros') +
  p('Gerencie todos os parceiros: cadastrar, editar, visualizar clientes e configurar permissões.') +
  h2('Cadastrar novo parceiro') +
  ol(['Clique em <strong>+ Novo Parceiro</strong>','Preencha nome, e-mail, telefone e CPF/CNPJ','Defina a senha de acesso ao portal','Configure as permissões de cadastro de clientes','Clique em <strong>Salvar</strong>']) +
  h2('Permissões de cadastro') +
  tbl(['Permissão','Ativada','Desativada'],[
    ['Pode definir Recorrência','Parceiro escolhe Mensal/Trimestral/Semestral/Anual','Sempre Mensal'],
    ['Pode definir Vencimento','Parceiro escolhe a data','Vencimento = cadastro + 2 dias'],
  ]) +
  callout('info','Desativar um parceiro não remove seus clientes — apenas impede novos acessos ao portal.'),

'planos':
  h1('Planos e Módulos') +
  p('Planos são configurados exclusivamente pelo SuperAdmin e representam as ofertas de serviço.') +
  callout('info','<strong>Regra fundamental:</strong> <code>totalPrice = basePrice</code>. Módulos documentam o que está incluso, sem inflar o preço.') +
  h2('Criar novo plano') +
  ol(['Clique em <strong>+ Novo Plano Global</strong>','Defina nome, descrição e preço base','Configure infraestrutura: usuários, filas, conexões WhatsApp/Instagram','Ative os módulos incluídos','Defina taxa de setup (opcional — cobrada 1× na ativação)','Defina a ordem de apresentação','Clique em <strong>Salvar Plano</strong>']) +
  h2('Campos de infraestrutura') +
  tbl(['Campo','Descrição'],[
    ['Usuários','Quantidade de usuários com acesso'],
    ['Filas','Quantidade de filas de atendimento'],
    ['WhatsApp Não Oficial','Conexões via API não oficial'],
    ['WhatsApp Oficial (WABA)','Conexões via API oficial Meta'],
    ['Instagram','Conexões Instagram'],
  ]) +
  h2('ID do Plano PacoTicket') +
  p('Campo opcional para identificação cruzada. Quando preenchido, é usado ao criar o cliente na API PacoTicket. Não afeta preço nem comissão.') +
  h2('Reordenar planos') +
  p('Arraste e solte os cards para definir a ordem de apresentação. A ordem é salva automaticamente.'),

EOF
echo "Etapa 2 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas"
```

---

## ETAPA 3 — SuperAdmin: Clientes, Comissões, Faturas

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

'clientes-admin':
  h1('Gestão de Clientes') +
  p('O SuperAdmin visualiza todos os clientes de todos os parceiros.') +
  h2('Filtros disponíveis') +
  ul(['Parceiro','Status (Ativo/Inativo/Suspenso)','Plano']) +
  h2('Cadastrar cliente') +
  ol(['Clique em <strong>+ Novo Cliente</strong>','Preencha dados da empresa e contato','Selecione o parceiro responsável','Selecione o plano','Defina recorrência e data de vencimento','Clique em <strong>Salvar</strong>']) +
  p('Ao salvar, o sistema cria o cliente no banco e registra a empresa na API PacoTicket.') +
  h2('Add-ons por cliente') +
  p('Adicione módulos ou recursos extras além do plano base. O SuperAdmin pode aplicar descontos; parceiros não.') +
  callout('warning','Desativar um cliente não cancela faturas em aberto na API PacoTicket — faça isso manualmente na plataforma.'),

'comissoes-admin':
  h1('Comissões (SuperAdmin)') +
  p('Calcule, visualize e marque como pagas as comissões de todos os parceiros.') +
  h2('Calcular comissões') +
  ol(['Vá em <strong>Comissões</strong>','Selecione mês e ano','Clique em <strong>Calcular Comissões</strong>','O sistema processa todas as faturas pagas no período']) +
  callout('info','Comissões são calculadas sobre <strong>faturas pagas</strong> no período, não sobre o valor do plano. Sem faturas pagas = sem comissão.') +
  h2('Tipos de comissão') +
  tbl(['Tipo','Quando ocorre','Base de cálculo'],[
    ['Mensalidade','Todo mês com fatura paga','invoice.amount × percentual do tier'],
    ['Setup (1×)','Apenas no 1º período do cliente','setupFeeExtra × percentual configurado no tier'],
  ]) +
  callout('warning','Comissão de setup só ocorre quando o parceiro definiu um <strong>acréscimo</strong> na taxa de setup ao criar o plano. O setup base do catálogo não gera comissão.') +
  h2('Exportar CSV') +
  p('Clique em <strong>Exportar CSV</strong> para baixar os dados em formato compatível com Excel (separador ponto e vírgula).'),

'faturas':
  h1('Faturas') +
  p('Faturas são sincronizadas da plataforma PacoTicket. O sistema não gera faturas — apenas as importa para cálculo de comissões.') +
  h2('Sincronizar faturas') +
  ol(['Vá em <strong>Faturas</strong>','Clique em <strong>Sincronizar PacoTicket</strong>','O sistema busca todas as faturas na API e atualiza o banco']) +
  h2('Status das faturas') +
  tbl(['Status','Significado'],[
    [badge('Pendente','amber'),'Aguardando pagamento'],
    [badge('Pago','green'),'Fatura paga — gera comissão no próximo cálculo'],
    [badge('Vencido','red'),'Prazo excedido sem pagamento'],
    [badge('Cancelado','gray'),'Fatura cancelada'],
  ]) +
  callout('info','Apenas faturas com status <strong>PAGO</strong> são consideradas no cálculo de comissões.'),

EOF
echo "Etapa 3 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas"
```

---

## ETAPA 4 — SuperAdmin: Propostas e Configurações

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

'propostas-admin':
  h1('Propostas (SuperAdmin)') +
  p('Visualize todas as propostas geradas pelos parceiros: baixar ou excluir.') +
  h2('Filtros') +
  ul(['Parceiro','ID da proposta','Nome do cliente/lead']) +
  h2('Colunas da tabela') +
  tbl(['Coluna','Descrição'],[
    ['ID','Código único da proposta (ex: KT3RQ_29032026)'],
    ['Plano','Nome do plano cotado'],
    ['Parceiro','Parceiro que gerou a proposta'],
    ['Cliente','Lead vinculado'],
    ['Setup Base','Taxa de setup do catálogo'],
    ['Setup Extra','Acréscimo definido pelo parceiro'],
    ['Data','Data de geração'],
  ]) +
  ul(['<strong>⬇️ Baixar</strong> — download do PDF','<strong>🗑️ Excluir</strong> — remove do banco e do disco']),

'configuracoes':
  h1('Configurações do Sistema') +
  p('Centralize toda a personalização em <strong>SuperAdmin → Configurações</strong>.') +
  h2('Seções disponíveis') +
  tbl(['Seção','O que configura'],[
    ['Sistema / White-Label','Nome do negócio, logos, favicon, largura da logo de login'],
    ['URL da API','Base URL da API PacoTicket usada em todas as integrações'],
    ['Cores','15 variáveis de cor do tema (marca, acento, parceiros, status, fundos dark)'],
    ['Módulos','Preço, taxa de setup, visibilidade e nome de cada módulo'],
    ['Recursos de Infraestrutura','Preço por unidade de conexões, usuários e filas'],
    ['Tiers de Comissionamento','Criar/editar tiers com percentual, duração e modo de suporte'],
    ['Token PacoTicket','Configurado via variável de ambiente — não editável pelo painel'],
  ]) +
  callout('info','Alterações de cor são aplicadas em tempo real antes de salvar — você vê o efeito imediatamente.') +
  h2('Restaurar cores padrão') +
  p('Clique em <strong>Restaurar Padrão</strong> na seção de cores para voltar à paleta oficial.'),

EOF
echo "Etapa 4 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas"
```

---

## ETAPA 5 — Portal do Parceiro: Dashboard, Clientes, Comissões

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

'dashboard-parceiro':
  h1('Dashboard do Parceiro') +
  p('Exibe sua situação atual: tier, progresso, KPIs e avisos importantes.') +
  h2('Card de Tier') +
  p('Mostra seu tier atual (Indicador / Parceiro / Master), o percentual de comissão e a barra de progresso para o próximo tier.') +
  callout('warning','Se seu tier tem tempo de comissão limitado, clientes adquiridos <strong>não gerarão comissão</strong> após upgrade de tier. A regra fica travada na data do cadastro.') +
  h2('KPIs') +
  tbl(['Card','O que mostra'],[
    ['Clientes Ativos','Seus clientes com status ATIVO'],
    ['Comissão do Mês','Total de comissões (mensalidade + setup) no mês atual'],
    ['Faturas Pagas','Faturas pagas no mês'],
    ['Próximo Vencimento','Cliente com vencimento mais próximo'],
  ]),

'meus-clientes':
  h1('Meus Clientes') +
  p('Gerencie seus clientes: cadastrar, editar, adicionar módulos extras e acompanhar faturas.') +
  h2('Cadastrar novo cliente') +
  ol(['Clique em <strong>+ Novo Cliente</strong>','Preencha dados da empresa e contato','Selecione o plano','Defina recorrência e vencimento (se sua conta tiver essas permissões)','Adicione módulos ou recursos extras se necessário','Clique em <strong>Salvar</strong>']) +
  callout('info','Se você não tem permissão para definir recorrência ou vencimento, o sistema usa <strong>Mensal</strong> e <strong>hoje + 2 dias</strong> automaticamente.') +
  h2('Add-ons') +
  p('Adicione módulos ou recursos de infraestrutura extras ao cliente. Os preços são os do catálogo — sem desconto.') +
  callout('warning','Apenas o SuperAdmin pode aplicar descontos em add-ons.') +
  h2('Status da fatura') +
  tbl(['Badge','Significado'],[
    [badge('Pago','green'),'Última fatura paga'],
    [badge('Pendente','amber'),'Aguardando pagamento'],
    [badge('Vencido','red'),'Prazo excedido sem pagamento'],
    [badge('Sem fatura','gray'),'Nenhuma fatura sincronizada ainda'],
  ]),

'comissoes-parceiro':
  h1('Minhas Comissões') +
  p('Acompanhe todas as suas comissões: mensalidade, setup e totais por período.') +
  h2('Tipos de comissão') +
  tbl(['Coluna','Descrição'],[
    ['Mensalidade','Comissão recorrente sobre a fatura paga'],
    ['Setup (1×)','Comissão sobre o acréscimo de setup que você definiu ao criar o plano. Cobrada apenas uma vez.'],
    ['Total','Mensalidade + Setup do período'],
  ]) +
  callout('info','A comissão de setup aparece apenas no <strong>primeiro período</strong> do cliente e apenas quando você definiu um acréscimo de setup ao criar o plano personalizado.') +
  h2('Resumo do período') +
  p('No topo aparecem três cards: <strong>Pendente Mensalidade</strong>, <strong>Pendente Setup</strong> e <strong>Total Pago</strong>.'),

EOF
echo "Etapa 5 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas"
```

---

## ETAPA 6 — Portal do Parceiro: Tabela de Preços, Funil, Propostas, Perfil

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

'tabela-precos':
  h1('Tabela de Preços') +
  p('Visualize todos os planos com composição detalhada e estimativa de comissão.') +
  h2('Planos Globais vs Meus Planos') +
  p('Use os botões no topo para alternar entre <strong>Planos Globais</strong> (do SuperAdmin) e <strong>Meus Planos</strong> (personalizados por você).') +
  h2('Card de plano') +
  ul(['<strong>Preço mensal</strong> — valor fixo do plano','<strong>Taxa de ativação base</strong> — setup do catálogo (laranja)','<strong>Acréscimo de setup</strong> — valor que você adicionou (verde, badge "comissionado")','<strong>Total de ativação</strong> — soma dos dois','<strong>Módulos incluídos</strong> — lista com ícones','<strong>Sua comissão estimada</strong> — baseada no seu tier atual']) +
  callout('info','Somente taxas de setup definidas <strong>na criação do plano</strong> geram comissão. Ativações sem acréscimo = comissão apenas sobre mensalidade.'),

'funil':
  h1('Funil de Vendas (CRM)') +
  p('Gerencie leads desde o primeiro contato até a conversão em cliente usando um quadro Kanban.') +
  h2('Estágios padrão') +
  p('Na primeira vez que você acessa o Funil, os estágios são criados automaticamente:') +
  ol(['Lead','Contato Realizado','Proposta Enviada','Negociação','Cliente','Cancelado']) +
  h2('Criar novo lead') +
  ol(['Clique em <strong>+ Novo Lead</strong> ou no <strong>+</strong> no topo de qualquer coluna','Preencha empresa, contato, e-mail, telefone e notas','Selecione o plano de interesse (opcional)','Informe valor estimado e data de fechamento','Clique em <strong>Criar Lead</strong>']) +
  h2('Mover lead entre estágios') +
  p('Arraste o card para outra coluna. A mudança de estágio é registrada automaticamente no histórico do lead.'),

'propostas-parceiro':
  h1('Propostas e Simulador') +
  p('Crie simulações de planos, gere PDFs profissionais e salve propostas vinculadas a leads.') +
  h2('Criar simulação') +
  ol(['Selecione um <strong>plano base</strong>','Adicione módulos extras se necessário','Ajuste recursos de infraestrutura extras','Informe o <strong>acréscimo de setup</strong> (opcional — vira sua comissão de ativação)','Visualize o resumo com comissão estimada']) +
  h2('Gerar PDF e salvar') +
  ol(['Dê um nome ao plano','Selecione ou crie um lead para vincular','Clique em <strong>Gerar PDF da Proposta e Salvar</strong>','O PDF é gerado e o download inicia automaticamente','O arquivo fica salvo no servidor e disponível no histórico do lead']) +
  callout('info','O PDF é formatado para o cliente final — não contém informações sobre comissão, tier ou dados internos do programa de parceiros.'),

'meu-perfil':
  h1('Meu Perfil') +
  p('Atualize seus dados de contato e troque sua senha de acesso.') +
  h2('Dados editáveis') +
  ul(['Telefone','E-mail (usado no login)']) +
  callout('info','Nome e CPF/CNPJ são definidos pelo SuperAdmin e não podem ser alterados pelo portal do parceiro.') +
  h2('Trocar senha') +
  ol(['Informe a <strong>senha atual</strong>','Informe a <strong>nova senha</strong> (mínimo 8 caracteres)','Confirme a nova senha','Clique em <strong>Salvar Senha</strong>']) +
  callout('warning','Ao trocar a senha, <strong>todas as sessões ativas</strong> são encerradas. Você precisará fazer login novamente.'),

EOF
echo "Etapa 6 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas"
```

---

## ETAPA 7 — Regras de Negócio e Segurança + fechar objeto + init

```bash
cat >> /home/user/parceiros/frontend/docs.js << 'EOF'

'tiers-comissao':
  h1('Tiers e Comissionamento') +
  p('O sistema de comissões é baseado em tiers configuráveis. Cada tier define o percentual sobre as faturas pagas.') +
  h2('Como funciona') +
  p('Ao cadastrar um cliente, o sistema registra o tier do parceiro naquele momento em uma <strong>regra travada</strong>. Essa regra define como as comissões desse cliente serão calculadas permanentemente.') +
  callout('warning','Fazer upgrade de tier <strong>não</strong> muda as regras de clientes já cadastrados. Cada cliente mantém as regras do tier ativo no momento do cadastro.') +
  h2('Duração da comissão') +
  p('Se o tier tiver <strong>duração em meses</strong> configurada (valor > 0), a comissão expira após esse período. Se a duração for <strong>0</strong>, a comissão é por tempo indeterminado.') +
  h2('Modos de suporte') +
  tbl(['Modo','Descrição'],[
    ['Suporte direto PacoTicket','O suporte é prestado diretamente pela plataforma ao cliente final'],
    ['Via Parceiro (intermediário)','O parceiro é o ponto de contato entre o cliente e a plataforma'],
  ]),

'setup-fee':
  h1('Taxas de Setup') +
  p('A taxa de setup é cobrada uma única vez na ativação do cliente.') +
  h2('Dois tipos de setup') +
  tbl(['Tipo','Origem','Gera comissão?'],[
    ['Setup base','Definido no plano global pelo SuperAdmin','Não'],
    ['Acréscimo de setup','Definido pelo parceiro ao criar plano personalizado','Sim — vira comissão de ativação'],
  ]) +
  callout('info','Somente o <strong>acréscimo</strong> gera comissão. O setup base é receita da plataforma.') +
  h2('Como definir acréscimo de setup') +
  ol(['Crie um plano personalizado baseado em um plano global','No campo <strong>Acréscimo de Setup</strong>, informe o valor adicional','O total cobrado do cliente = base + acréscimo']) +
  h2('No PDF da proposta') +
  p('O PDF exibe apenas o <strong>total de ativação</strong> (base + acréscimo somados). Nenhuma separação é exposta ao cliente.'),

'planos-parceiro':
  h1('Planos Personalizados do Parceiro') +
  p('O parceiro pode criar planos baseados nos planos globais, personalizando nome, módulos adicionais e taxa de setup.') +
  h2('Criar plano personalizado') +
  ol(['Em <strong>Tabela de Preços</strong>, encontre o plano global desejado','Clique em <strong>+ Criar meu plano baseado neste</strong>','Defina o nome','Adicione módulos ou recursos extras (somam ao preço mensal)','Defina o acréscimo de setup (opcional)','Salve o plano']) +
  h2('Regras de herança') +
  ul(['O preço base <strong>nunca pode ser menor</strong> que o plano base','Itens de infraestrutura do plano base <strong>não podem ser removidos</strong>','Adicionar módulos e recursos extras <strong>aumenta</strong> o preço mensal']),

'autenticacao':
  h1('Autenticação e Sessão') +
  p('O sistema usa JWT em cookies httpOnly — mais seguros que armazenamento em JavaScript.') +
  h2('Duração da sessão') +
  tbl(['Token','Duração'],[['Access Token (cookie)','8 horas'],['Refresh Token (cookie)','7 dias']]) +
  p('Após 8 horas, o access token é renovado automaticamente. Se o refresh token expirar (7 dias sem uso), você precisará fazer login novamente.') +
  h2('Segurança dos cookies') +
  ul(['<strong>httpOnly</strong> — JavaScript não consegue ler o token (proteção contra XSS)','<strong>Secure</strong> — enviado apenas em HTTPS','<strong>SameSite=Strict</strong> — proteção contra CSRF']) +
  callout('info','Ao abrir uma nova aba ou reiniciar o browser, o sistema recupera sua sessão automaticamente se o cookie ainda for válido.'),

'recuperar-senha':
  h1('Recuperar Senha') +
  ol(['Na tela de login, clique em <strong>Esqueceu a senha?</strong>','Informe o e-mail cadastrado e clique em <strong>Enviar link</strong>','Verifique sua caixa de entrada (e pasta de spam)','Clique no link recebido','Defina a nova senha (mínimo 8 caracteres)','Clique em <strong>Redefinir Senha</strong>','Você será redirecionado para o login']) +
  callout('warning','O link expira em <strong>15 minutos</strong>. Se expirar, solicite um novo.') +
  h2('E-mail não chegou?') +
  ul(['Verifique a pasta de spam','Aguarde até 5 minutos','Confirme que está usando o e-mail correto','Se persistir, peça ao SuperAdmin para redefinir sua senha']),

}; // fim de DOCS_PAGES

// ── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/system-config')
    .then(r => r.json())
    .then(json => {
      const cfg  = json?.data || {};
      const name = cfg.businessName || 'PacoTicket';
      const hl   = document.getElementById('headerLogo');
      const hn   = document.getElementById('headerName');
      if (cfg.logoInternal && hl) {
        hl.src = cfg.logoInternal; hl.classList.remove('hidden');
        if (hn) hn.classList.add('hidden');
      } else if (hn) {
        hn.textContent = name + ' — Documentação';
      }
      document.title = name + ' — Documentação';
      // Aplicar tema de cores se disponível
      if (typeof applyTheme === 'function') applyTheme(cfg);
    }).catch(() => {});

  const slug = getSlugFromHash();
  renderSidebar(slug);
  renderPage(slug);
});
EOF
echo "Etapa 7 OK — $(wc -l < /home/user/parceiros/frontend/docs.js) linhas totais"
```

---

## ETAPA 8 — Verificar integridade do arquivo

```bash
# Verificar se não tem erros de sintaxe JS
node --check /home/user/parceiros/frontend/docs.js && echo "SINTAXE OK" || echo "ERRO DE SINTAXE"

# Verificar que DOCS_PAGES tem as chaves esperadas
node -e "
eval(require('fs').readFileSync('/home/user/parceiros/frontend/docs.js','utf8')
  .replace(/^const DOCS_PAGES/,'global.DOCS_PAGES')
  .replace(/^const DOCS_MENU/,'global.DOCS_MENU')
  .replace(/^function /g,'global.fn_')
);
console.log('Páginas:', Object.keys(DOCS_PAGES).length);
console.log('Slugs:', Object.keys(DOCS_PAGES).join(', '));
" 2>/dev/null || node -e "
const fs = require('fs');
const txt = fs.readFileSync('/home/user/parceiros/frontend/docs.js','utf8');
const matches = txt.match(/'[a-z-]+':/g) || [];
console.log('Entradas DOCS_PAGES encontradas:', matches.length);
"
```

---

## ETAPA 9 — Adicionar link de Documentação nos navs + commit + deploy

```bash
# Verificar onde adicionar no superadmin.html
grep -n "Configurações\|tab-config" /home/user/parceiros/frontend/superadmin.html | tail -3

# Verificar onde adicionar no partner.html
grep -n "Perfil\|tab-profile\|meu-perfil" /home/user/parceiros/frontend/partner.html | tail -3
```

Use `str_replace` para adicionar após o último botão de aba em cada arquivo:

**Em `superadmin.html`** — após o botão de Configurações:
```html
<a href="docs.html" target="_blank"
   class="px-4 py-4 text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors">
  📚 Docs
</a>
```

**Em `partner.html`** — após o botão de Perfil:
```html
<a href="docs.html" target="_blank"
   class="px-4 py-4 text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors">
  📚 Docs
</a>
```

```bash
# Rebuild Tailwind para incluir novas classes se necessário
cd /home/user/parceiros/frontend
npx tailwindcss -c tailwind.config.js -i tailwind.input.css -o tailwind.min.css --minify 2>/dev/null || true

# Commit e push
cd /home/user/parceiros
git add frontend/docs.js frontend/docs.html frontend/superadmin.html frontend/partner.html
git commit -m "feat: complete docs.js with all 20 pages"
git push

# Deploy
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 15
docker stack services pacoticket
```

A documentação deve ser dividia em docs.html e docsadmin.html.

A docs.html deve mostrar apenas a documentação de parceiro, os menus do print. 
A docsadmin.html, deve ser completa

Apenas o superadmin deve ter acesso ao docsadmin.html. Não deve estar acessível para os parceiros