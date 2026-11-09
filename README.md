# Almost You

Jogo de dedução social para Discord Activities, de 3 a 10 jogadores. Todos recebem a mesma cena — menos um: o Quase vê uma cena parecida, mas não igual. Em turnos, cada jogador faz uma pergunta ao grupo; depois todos votam em quem parece estar deslocado. Se o Quase for pego, ainda ganha uma chance de adivinhar qual era a cena real.

- Cliente: React + Vite, entregue pelo mesmo serviço da API.
- Servidor: Fastify + Socket.IO, estado autoritativo e filtrado por jogador.
- Idiomas: interface em 5 locales (en-US, pt-BR, es-ES, fr, de), cenas compartilhadas escolhidas pelo host.
- Partida: 3 rodadas; pontuação acumulada e transferência de host se o anfitrião cair.
- Deploy alvo: Shard Cloud (Node), uma instância, opcionalmente com Redis gerenciado.

## Como funciona uma partida

1. O anfitrião inicia com 3 a 10 jogadores conectados.
2. **Revelação (6s):** cada jogador vê sua cena. Insiders veem a cena da maioria; o Quase vê a variante parecida.
3. **Conversa (2 voltas, 20s por jogador):** na sua vez, faça uma pergunta ao grupo sobre a cena. O botão **Passar** encerra a vez: quem não perguntar ainda pode participar da resposta.
4. **Votação (30s):** todos votam em quem acreditam ser o Quase. Empate não pega ninguém; o Quase aproveita.
5. **Palpite (20s):** se o Quase for pego, escolhe entre três cenas qual era a real.
6. **Resultado (25s):** placar da rodada, votos e as duas cenas.
7. Depois de 3 rodadas, o maior placar vence; empate no topo aparece como empate.

O Quase ganha 150 pontos quando escapa (não é pego ou há empate na votação) ou quando acerta o palpite. Se for pego e errar, cada insider ganha 100 pontos.

## Requisitos

- Node.js 22+
- Uma aplicação no Discord Developer Portal com Activity habilitada

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencha se for testar login real do Discord
npm run dev
```

- Cliente: http://localhost:5173
- API: http://localhost:3001

Em desenvolvimento o login é simulado. Abra abas com `?room=` e `?name=` para jogar sozinho:

```
http://localhost:5173/?room=TESTE&name=Ana
http://localhost:5173/?room=TESTE&name=Bruno
http://localhost:5173/?room=TESTE&name=Carla
```

Cada aba recebe uma identidade própria (sessionStorage) e o cliente fala com a API pelo proxy do Vite.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `DISCORD_CLIENT_ID` | Login Discord e build do cliente (também aceita `VITE_DISCORD_CLIENT_ID`) |
| `DISCORD_CLIENT_SECRET` | Troca do código OAuth no servidor |
| `DISCORD_BOT_TOKEN` | Validação do participante na instância da Activity |
| `DISCORD_REDIRECT_URI` | Opcional; deixe vazio se o portal não exigir redirect fixo |
| `SESSION_SECRET` | Obrigatório em produção (mínimo 16 caracteres) |
| `DEV_AUTH` | Login de desenvolvimento; ignorado em produção |
| `SKIP_INSTANCE_VALIDATION` | `true` apenas em testes; em produção valide a instância |
| `REDIS_URL` | Redis gerenciado da Shard; sem ele as salas ficam só em memória |
| `ROOM_TTL_SECONDS` | Tempo de vida de uma sala parada após a partida (padrão 21600) |
| `LOBBY_TTL_SECONDS` | Tempo de vida de um lobby sem ninguém conectado (padrão 900) |
| `MAX_ROOMS` | Limite de salas simultâneas no processo (padrão 2000) |
| `MAX_ROOMS_PER_USER` | Quantas salas um mesmo usuário pode manter abertas (padrão 5) |
| `PORT` | Padrão 80 em produção, 3001 em desenvolvimento |
| `TRUST_PROXY` | `true` atrás do proxy da Shard, para o rate limit usar o IP real |

## Testes e build

```bash
npm test          # motor do jogo, salas, rate limit, locales e baralho
npm run typecheck
npm run build     # shared, game-core, servidor e cliente
npm start         # produção local (NODE_ENV=production, porta 80 por padrão)
npm run smoke     # checa saúde, locales, salas e o shell do cliente
```

`npm run smoke` aceita uma URL: `npm run smoke -- https://seu-app.example` (ou `SMOKE_BASE_URL`). O GitHub Actions roda typecheck, testes e build em cada push para `main` e em pull requests.

O servidor serve `apps/activity/dist` na raiz, `/api/*` e `/ws` na mesma origem, com fallback de SPA para rotas do cliente.

## Deploy na Shard Cloud

1. Envie o repositório para o GitHub (ou gere um ZIP) e crie um app Node na Shard Cloud apontando para ele.
2. O arquivo `.shardcloud` já define:
   - `LANGUAGE=node` e `MEMORY=1024`
   - `CUSTOM_COMMAND=npm ci --include=dev && npm run build && npm start`
   - O servidor escuta na porta 80 porque `npm start` define `NODE_ENV=production`.
   - Não há `MAIN`: o entrypoint (`apps/server/dist/index.js`) só existe depois do build, e a Shard ignora `MAIN` quando `CUSTOM_COMMAND` está presente. Declarar o caminho gera o aviso "MAIN file not found in project".
3. No painel de variáveis de ambiente, configure:
   - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`
   - `SESSION_SECRET` com um valor longo e aleatório
   - `REDIS_URL` com o Redis gerenciado da Shard (recomendado)
   - `SKIP_INSTANCE_VALIDATION=false`
4. Faça o deploy e confirme `https://<subdominio>.shardweb.app/api/health` retornando `{"ok":true,...}`.

Com Redis, as salas sobrevivem a reinícios e deploys: o cliente reconecta, reentra na sala e o servidor retoma o timer da fase atual. Sem Redis, o estado vive apenas na memória.

Para manutenção ou indisponibilidade do host, `apps/activity/public/offline.html` é uma página autocontida (sem dependências externas) que consulta `/api/health` a cada 6 segundos, mostra o número de tentativas e volta ao app sozinha quando o servidor responde. Ela detecta o idioma do navegador (en, pt, es, fr, de) e aceita `?lang=` e `?health=` para ajustes.

### Escala

Comece com uma instância. Salas são estado em memória (com snapshot no Redis) e o Socket.IO usa o transporte padrão, sem adaptador multi-instância. Para escalar horizontalmente será necessário um adaptador Redis para o Socket.IO e balanceamento com sessões fixas; o plano Pro da Shard tem balanceamento round-robin e deploy sem downtime, mas o adaptador ainda precisa ser adicionado ao servidor.

## Discord Developer Portal

1. Crie a aplicação e copie o `Application ID` para `DISCORD_CLIENT_ID`.
2. Em **Activities**, habilite a Activity e defina a URL base.
3. Em **URL Mappings**, adicione um único mapeamento:
   - Prefixo `/` → destino `<subdominio>.shardweb.app` (sem `https://`; o portal não aceita protocolo no destino)
4. O proxy preserva o caminho: `/.proxy/api` e `/.proxy/ws` chegam a `/api` e `/ws` do mesmo serviço.
5. Se adicionar prefixos específicos (`/api`, `/ws`), arraste-os para **antes** do `/` — o portal exige que o prefixo mais curto fique por último. Prefixos não podem conter `.proxy` nem pontos no path do Socket.IO.
6. Em **OAuth2**, adicione o redirect `https://<client_id>.discordsays.com`.

Os caminhos exatos de URL Mapping e o suporte a WebSocket pelo proxy devem ser conferidos na documentação oficial do Discord, pois mudam com o tempo.

## Identidade visual

Os arquivos de marca ficam em `assets/branding`:

- `almost-you-avatar.png` (512×512) — avatar do app/bot no Developer Portal;
- `almost-you-banner.png` (960×540, 16:9) — banner da listagem na App Directory;
- os `@2x` guardam a versão em alta resolução (1024×1024 e 1792×1008).

O símbolo são duas silhuetas quase idênticas, uma coral e outra verde-menta, com um ponto amarelo na emenda: a diferença mínima é a pista do "quase". O avatar não tem texto para continuar legível em 32px e dentro do recorte circular do Discord. A paleta é a mesma da interface: coral `#ff6b5b`, menta `#5eead4`, sol `#ffd166` e creme `#f7f0e2` sobre o fundo escuro `#0b111b`.

## Convites e amigos

O botão **Convidar amigos** do lobby chama `openInviteDialog()` do Embedded App SDK. Ele abre o modal nativo de convite do Discord para o canal de voz da Activity, sem exigir escopo OAuth extra. Fora do Discord (modo dev) o botão copia o código da sala.

Não existe API de lista de amigos liberada para Activities por padrão: `getRelationships()` depende do escopo `relationships.read`, que faz parte do Social SDK e exige aprovação da Discord. Por isso o jogo não sincroniza a lista de amigos. Para recompensar grupos recorrentes, a alternativa viável é um histórico de "jogadores recentes" no próprio servidor, indexado pelo ID do Discord, com convite individual — sem depender de dados sociais.

## Código da sala e entrada fora do canal de voz

A sala padrão continua derivada do `channelId` internamente, mas o identificador exibido e compartilhado é diferente:

- salas criadas a partir de um canal do Discord recebem um código aleatório de 6 caracteres (sem letras e números ambíguos como `I`, `O`, `0` e `1`);
- em desenvolvimento, `?room=TESTE` continua funcionando: códigos curtos customizados são preservados como código;
- o `channelId` nunca é enviado ao cliente, listado na aba Descobrir ou exposto em snapshots públicos. O Redis guarda o código junto do snapshot e o restaura após reinícios, mantendo o mesmo código para a sala;
- o cliente guarda o último código em uso e reentra nele após reconectar.

A Activity também pode ser iniciada pelo App Launcher em canais de texto e DMs. O campo **Entrar em uma sala** do lobby aceita o código completo (copiado no topo da tela) e troca o jogador para a sala de quem compartilhou. O servidor valida antes de sair da sala atual: código inexistente, sala cheia, sala em partida ou jogador removido são recusados sem desconectar o jogador.

## Salas públicas

O anfitrião pode ativar **Sala pública** no lobby. A sala passa a aparecer na aba **Descobrir** para qualquer pessoa que abrir a Activity, com nome do anfitrião, jogadores conectados, idioma das cenas e um botão **Entrar** que reaproveita a troca de sala por código.

A listagem é opt-in e temporária:

- a sala só é listada enquanto está no lobby e com alguém conectado;
- no máximo 50 salas aparecem por consulta em `GET /api/rooms`, ordenadas por jogadores conectados;
- o endpoint não usa cache (`Cache-Control: no-store`) e aceita até 120 consultas por minuto por IP; ao estourar, responde `429` com `Retry-After` e o cliente pausa as atualizações até o prazo;
- o limite usa o IP da requisição: mantenha `TRUST_PROXY` ligado (padrão `true`) atrás do proxy da Shard Cloud — desligado, todos os jogadores compartilham o IP do proxy e o mesmo limite;
- o servidor não expõe nome de servidor, canal ou IDs de guilda — apenas o que o card precisa.

O cliente consulta a lista a cada 8 segundos enquanto a aba Descobrir está aberta. Se a sala escolhida não existir mais, o servidor recusa a entrada e o card é removido da lista local enquanto a próxima consulta não chega.

As abas **Sua sala** e **Descobrir** seguem o padrão ARIA de tablist: `Tab` entra na aba ativa e as setas, `Home` e `End` alternam entre elas (a direção das setas acompanha o idioma RTL).

## Remover jogadores

No lobby, o anfitrião vê um botão de remover em cada jogador conectado (menos ele mesmo). A remoção tira o jogador da sala e o impede de voltar enquanto ela existir; o jogador recebe o aviso e volta para a sala de origem do canal. A ação só existe no lobby: durante a partida, o jogo segue com quem está conectado e o papel de anfitrião é transferido se o anfitrião cair.

## Chat da sala

Nem todo mundo entra em call, então o jogo tem um chat de texto por sala. Em telas largas ele aparece como uma coluna fixa ao lado do conteúdo; abaixo de 1080px vira uma gaveta na parte inferior, aberta por um botão flutuante com contador de mensagens não lidas. Todo o chat funciona em português, inglês, espanhol, francês e alemão.

- mensagens de texto simples (até 240 caracteres), com respostas rápidas, reações emoji e indicador de "fulano está digitando";
- mensagens de sistema para entrada, saída explícita e remoção de jogador;
- o histórico recente (80 mensagens) é enviado ao entrar ou reconectar, então quem chega no meio da conversa não fica perdido;
- links são recusados, caracteres de controle são removidos e cada jogador só pode enviar uma mensagem a cada 1,2 segundo;
- o `role="log"` com `aria-live="polite"` anuncia mensagens novas para leitores de tela e o campo tem rótulo próprio.

O chat é guardado apenas na memória do processo, junto da sala: não vai para o Redis nem para os registros técnicos e é descartado quando a sala expira ou o servidor reinicia. Não há histórico permanente nem ferramentas de moderação além da remoção de jogador no lobby.

## Saúde, cabeçalhos e limites

`GET /api/health` responde `{ ok, status, version, uptimeSeconds, redis, store }`. `status` vira `degraded` quando o armazenamento não está pronto (por exemplo, Redis configurado e desconectado).

Todas as respostas enviam `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS em produção e uma `Content-Security-Policy-Report-Only` que permite o enquadramento apenas por origens do Discord. A política ainda não bloqueia nada: acompanhe os relatórios antes de promovê-la para o cabeçalho que aplica as regras.

Limites operacionais: `MAX_ROOMS` (processo), `MAX_ROOMS_PER_USER` (salas criadas por usuário), `LOBBY_TTL_SECONDS` (lobby sem conexões) e `ROOM_TTL_SECONDS` (demais salas). Salas públicas cujo anfitrião usa um nome com link são omitidas da aba Descobrir.

## Privacidade e termos

As páginas `/legal/privacy.html` e `/legal/terms.html` (PT-BR e EN) descrevem os dados tratados e as regras de uso; o lobby linka para elas. Dúvidas e pedidos de remoção vão pelo repositório: https://github.com/CachorroninjaBot/AlmostYou/issues.

## Adicionar um idioma

1. Copie `content/locales/en-US.json` para `content/locales/<locale>.json` e traduza os valores.
2. Opcionalmente adicione o locale aos rótulos das cenas em `content/decks/almost-you/deck.json`.
3. Reinicie o servidor. O novo idioma aparece no seletor, é detectado pelo SDK e não exige mudança de código.

Chaves ausentes caem para o inglês no servidor; idiomas RTL recebem `dir="rtl"` automaticamente.

## Estrutura

```
apps/activity      cliente React (SDK, i18n, telas, chat e reações)
apps/server        Fastify, Socket.IO, auth, salas e conteúdo
packages/shared    protocolo, schemas Zod, constantes e i18n helpers
packages/game-core motor autoritativo do Almost You
content/locales    bundles de tradução
content/decks      cenas (maioria + variante do Quase) por idioma
scripts            smoke test de produção
```
