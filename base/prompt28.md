# Tarefa: gerar seção de Documentação integrada ao sistema

## Contexto
Este é um sistema Next.js 14 com App Router, Tailwind CSS e Prisma.
Você vai gerar uma seção completa de Documentação que aparece como um item no menu de navegação principal do sistema, usando exatamente o mesmo design system do restante da aplicação.

## Fase 1 — Extrair o design system
Antes de criar qualquer arquivo, leia e registre internamente:

1. tailwind.config.ts ou .js → paleta de cores, fontes, breakpoints, tokens
2. app/globals.css → variáveis CSS, reset, classes customizadas
3. components/ui/ → componentes base (Button, Badge, Card, etc.)
4. app/layout.tsx → estrutura raiz, fonte principal, wrapper de tema
5. components/nav* ou sidebar* → como é o nav principal, classes usadas

Use esse material como fonte de verdade visual. Nunca invente estilos.

## Fase 2 — Mapear as features documentáveis
Varra o codebase completo e monte um índice interno com:

- Todas as rotas em app/ e o que cada página faz
- Todos os modelos em prisma/schema.prisma e seus relacionamentos
- Todas as Server Actions em app/**/actions.ts
- Todos os endpoints em app/api/**
- Integrações externas detectadas (Evolution API, Chatwoot, n8n, etc.)
- Configurações de ambiente detectadas em .env.example ou no código

Agrupe as features nas seguintes categorias de menu (ajuste se o código indicar outras):
  - Primeiros passos
  - Atendimento
  - Configurações
  - Integrações
  - Conta e plano

## Fase 3 — Criar a estrutura de arquivos

REGRA CRÍTICA: use exatamente as mesmas classes Tailwind e padrões de componentes encontrados no design system extraído na Fase 1. Não invente classes novas. Se existir um componente Card no sistema, use-o.

Crie os seguintes arquivos:

lib/docs-menu.ts
  Objeto de configuração TypeScript tipado com toda a estrutura do menu:
  categorias, itens, slugs, ícones (do mesmo provider usado no projeto),
  e descrições curtas. Este arquivo é a fonte de verdade do menu de docs.

components/docs/doc-layout.tsx
  Layout wrapper para páginas de doc. Inclui:
  - Sidebar esquerda com o menu completo (colapsável em mobile)
  - Área de conteúdo com largura máxima legível
  - Breadcrumb baseado no slug atual
  - Navegação prev/next entre páginas

components/docs/sidebar.tsx
  Sidebar com grupos colapsáveis, item ativo destacado, scroll independente.
  Estilização 100% derivada do design system.

components/docs/callout.tsx
  Componente para caixas de aviso com variantes: info, aviso, perigo.
  Cores derivadas do design system do projeto.

components/docs/step-list.tsx
  Componente para listas de passos numerados com ícones.

app/(docs)/layout.tsx
  Layout do grupo de rotas, importa DocLayout e passa a config do menu.

app/(docs)/page.tsx
  Página inicial de docs: cards de categorias com descrição e link.

## Fase 4 — Gerar o conteúdo de cada página
Para cada item do menu, crie a página correspondente em
app/(docs)/[categoria]/[slug]/page.tsx

Cada página deve conter conteúdo REAL derivado do código analisado:
  - O que a feature faz em linguagem de usuário final (não técnica)
  - Passo a passo de como usar, com o que o usuário vê na tela
  - Comportamentos importantes e limitações conhecidas
  - Avisos para ações irreversíveis usando o componente Callout
  - FAQs antecipadas com base nos edge cases encontrados no código

NUNCA use texto placeholder como "Lorem ipsum" ou "Em breve".
Se não há informação suficiente no código para documentar algo,
escreva uma nota honesta: "Esta seção será expandida em breve."

## Fase 5 — Integrar no nav principal
Localize o componente de navegação principal do sistema e adicione
o item "Documentação" com link para /docs.

Use exatamente o mesmo padrão visual dos outros itens do nav.
Se o nav usa ícones, use o ícone de livro/documento do mesmo provider.

## Ao terminar
Liste todos os arquivos criados ou modificados.
Identifique qualquer feature que não foi possível documentar por falta de contexto no código e explique o motivo.