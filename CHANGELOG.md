# Changelog

Todas as mudanças relevantes do Almost You. O projeto ainda não publica versões numeradas; as entradas abaixo agrupam o que está pronto para a v1.

## [Não publicado] — 2026-11-08

### Adicionado

- Chat de texto por sala para quem não está em call: coluna fixa no desktop, gaveta no mobile, contador de não lidas, respostas rápidas, indicador de digitação, mensagens de sistema e histórico recente ao reconectar.
- Histórico do chat limitado a 80 mensagens, texto de até 240 caracteres, links recusados e intervalo mínimo de 1,2 segundo entre mensagens.
- Novo visual do lobby e das telas de jogo: fundo com aurora animada, código da sala destacado como ticket, chips de status, cartões refinados e layout responsivo em 1080/900/640px.
- Ícone e banner do bot em `assets/branding`: duas silhuetas quase idênticas (coral e menta) com um ponto amarelo na emenda, nas resoluções de upload do Discord (512×512 e 960×540) e em `@2x`.
- Jogo completo de dedução social para 3 a 10 jogadores: 3 rodadas com revelação, conversa em turnos, votação, palpite e resultado.
- Motor autoritativo com estado filtrado por jogador: o papel do Quase e a cena alternativa só são revelados no resultado.
- Baralho de pares de cenas (maioria + variante do Quase) com sorteio sem repetir pares dentro da partida e três opções de palpite.
- Conversa em duas voltas de 20 segundos por jogador, com botão **Passar** e avanço automático ao esgotar o tempo.
- Palpite do Quase entre três cenas quando ele é pego; escapar, acertar o palpite ou ser pego com palpite errado altera a pontuação da rodada.
- Interface de todas as fases com cena do jogador, destaque de quem está perguntando, votação por jogador, placar da rodada e resumo final.
- Interface em 5 locales (en-US, pt-BR, es-ES, fr, de) e conteúdo de cenas escolhido pelo anfitrião, com fallback para inglês.
- Códigos de sala curtos (6 caracteres) para salas criadas a partir de canais do Discord. O `channelId` continua sendo a chave interna, mas nunca aparece na interface, na aba Descobrir ou nos snapshots públicos.
- Remoção de jogadores pelo anfitrião no lobby. O jogador removido não consegue voltar àquela sala enquanto ela existir.
- Salas públicas opt-in na aba **Descobrir**, com entrada por código e limites de consulta.
- Limite de salas abertas por usuário (`MAX_ROOMS_PER_USER`) e TTL separado para lobbies inativos (`LOBBY_TTL_SECONDS`).
- `/api/health` com `ok`, `status`, `store` e `redis`; HSTS em produção e Content-Security-Policy em modo Report-Only.
- Error boundary no cliente, aviso quando o papel de anfitrião muda de jogador e metadados de compartilhamento no HTML.
- Páginas de privacidade e termos (PT-BR e EN) com links no lobby.
- Workflow de CI no GitHub Actions, script `npm run smoke` e este changelog.

### Alterado

- As reações emoji agora ficam no compositor do chat, disponíveis em todas as fases, em vez de uma barra flutuante sobre o conteúdo.
- O código da sala ganhou destaque no topo do lobby, com botão de convite e contagem de conectados no mesmo cartão.
- Os contadores de conectados e de mensagens não lidas deixaram de ter concordância errada no singular.
- O banner do resultado diferencia três desfechos: o Quase escapou, acertou o palpite mesmo pego ou foi pego com o palpite errado.
- O cliente deixa de depender de canvas: as telas são compostas por cards, chips de cena e listas de pontuação.
- O servidor recusa entradas em salas cheias com `ROOM_FULL`, salas em partida com `ROOM_IN_PROGRESS` e salas de jogadores removidos com `ROOM_FORBIDDEN`.
- Snapshots de sala persistem a visibilidade pública e o código de entrada, com leitura compatível de snapshots antigos.
- Removidos os estilos e utilitários do baralho de desenho que não são usados pelo novo jogo.

### Corrigido

- O estado de "sala pública" não era salvo; a sala podia voltar a ser privada após um reinício com Redis.
