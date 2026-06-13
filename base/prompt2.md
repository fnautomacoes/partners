Nunca o chame de revendedor. Sempre de parceiro

Os nomes de arquivos, e endpoints, tudo interno, deve trocar também de revendedor para parceiro, de reseller para partner

Use essa stack do gotenberg como base, mas, preciso que esteja nesse ambiente. E, preciso também que seja entregue o schema.sql do banco de dados. Crie um seed para rodar no primeiro momento e popular com nome de usuario superadmin, e senha hasheada. Importante lembrar que já temos o postgres instalado na rede. Então, não precisa estar na stack. Somente a configuração

version: "3.7"
# Definição dos Serviços
services:
  # Definição do Serviço do Gotenberg
  gotenberg:
    # Imagem do Docker (use a tag mais recente ou específica)
    image: gotenberg/gotenberg:8.23.2
    # configura a rede do serviço
    networks:
      - network_swarm_public
    # configura as variáveis de ambiente
    environment:
      #########################################################
      # Documentação de Variáveis de Ambiente do Gotenberg ####
      # https://gotenberg.dev/docs/getting-started/environment-variables
      #########################################################
      #########################################################
      #########################################################
      # Configuração Gerais do Gotenberg ######################
      #########################################################
      #########################################################
      #########################################################
      # Configura a Porta de Execução do Gotenberg (Padrão: 3000)
      - GOTENBERG_DEFAULT_LISTEN_PORT=3000
      # Define o tamanho máximo do corpo da requisição (ex: 100MB)
      - GOTENBERG_MAX_BODY_SIZE=100Mb
      # Configura o tempo limite de espera para conversões (em segundos)
      - GOTENBERG_DEFAULT_WAIT_TIMEOUT=15
      # Habilita o uso do Chrome para conversões de HTML
      - GOTENBERG_DISABLE_GOOGLE_CHROME=false
      # Define o número máximo de requisições simultâneas
      - GOTENBERG_MAX_CONCURRENT_REQUESTS=10
    # Configura o Modo de Deploy da Aplicação
    deploy:
      # O Gotenberg será executado no modo de replicação
      mode: replicated
      # Vamos ter apenas uma instância do Gotenberg
      replicas: 1
      # Configura o local de execução
      placement:
        constraints:
          # Exemplo: Rodar em um node específico
          - node.hostname == manager-jedy
          # - node.labels.app == pdf_converter
      # Limitação
      resources:
        # Definição dos Limites de Recursos deste Serviço
        limits:
          # Define a quantidade de CPU. Gotenberg pode ser intensivo durante a conversão.
          cpus: "2"
          # Define a quantidade de RAM. A conversão de PDF consome memória.
          memory: 2048M
      # Define os Labels do Serviço
      labels:
        # Configura o Roteamento do Traefik
        - traefik.enable=true
        # Define o enderço do Gotenberg (Exemplo: pdf.meudominio.com)
        - traefik.http.routers.gotenberg.rule=Host(`pdf.meudominio.com.br`)
        # Redireciona o endereço para HTTPS
        - traefik.http.routers.gotenberg.entrypoints=websecure
        # Define o certificado SSL
        - traefik.http.routers.gotenberg.tls.certresolver=letsencryptresolver
        # Define o serviço do Gotenberg
        - traefik.http.routers.gotenberg.service=gotenberg
        # Define a porta do serviço do Gotenberg (Porta interna do container: 3000)
        - traefik.http.services.gotenberg.loadbalancer.server.port=3000
        # Define o uso do Host Header
        - traefik.http.services.gotenberg.loadbalancer.passHostHeader=true
      # Configura o modo de atualização do serviço
      update_config:
        # Configura o paralelismo de atualização
        parallelism: 1
        # Configura o tempo de espera entre as atualizações
        delay: 30s
        # Configura a ação em caso de falha
        order: start-first
        # Configura a ação em caso de falha
        failure_action: rollback
networks:
  network_swarm_public:
    name: network_swarm_public
    external: true