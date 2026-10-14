# Aviso de privacidade

[English](PRIVACY.md)

Última atualização: 8 de outubro de 2026.

Este aviso descreve os dados usados pelo editor web, pela vitrine, pelos componentes web, pelos artigos e pelas ferramentas avulsas do Xprite. O Xprite não exige conta. Sites que incorporam ou hospedam o Xprite, como o itch.io, podem ter regras de privacidade próprias.

## Trabalho guardado no navegador

O Xprite processa a arte no seu navegador. Projetos, arquivos recentes, dados de recuperação, predefinições e preferências da interface podem ser salvos no armazenamento do navegador ou em arquivos que você escolher. O Xprite não envia a arte para edição nem a sincroniza com uma conta. Limpar os dados do site no navegador também pode apagar projetos salvos localmente e dados de recuperação; salve antes uma cópia dos trabalhos importantes.

O Arquivos guarda uma cópia das imagens e projetos que você importa nas ferramentas e no editor, com nomes, datas, etiquetas e comentários, no armazenamento deste navegador (o sistema de arquivos privado da origem e o IndexedDB), para você abri-los de novo depois. Essas cópias nunca saem do seu dispositivo. Os itens no Lixo são apagados após 30 dias, e Esvaziar Lixo os apaga na hora. O Arquivos pode pedir ao navegador que mantenha esse armazenamento de forma persistente; quem decide é o navegador. Os eventos de uso do Arquivos registram ações, faixas aproximadas de tamanho e categorias de erro, nunca nomes, comentários ou conteúdo dos arquivos.

O comando Compartilhar cria uma URL que contém, no fragmento, o projeto editável compactado. O Xprite gera e lê esses dados localmente, sem enviar um arquivo. Enviar o link ou o QR code por outro app compartilha esses dados do projeto com o app e com quem recebe. Qualquer pessoa com o link completo pode abrir o projeto; essas cópias não expiram e não podem ser revogadas.

## Dados de uso

Builds web de produção com análise ativada enviam eventos de uso ao PostHog Cloud nos Estados Unidos. Esses eventos cobrem visitas a páginas, cliques de entrada no editor e nas ferramentas, arquivos lidos com sucesso e com pré-visualização utilizável, resultados entregues ao navegador para download, categorias de erro ao abrir ou exportar, etapas e prontidão da inicialização, mudanças de visualização, restauração, abertura e edição de documentos, tentativas manuais de salvar ou exportar e seus resultados, ações selecionadas da interface e erros sanitizados. Eles podem incluir recursos do navegador e do dispositivo, o caminho da página sem parâmetros de consulta nem fragmentos da URL, o nome do host de origem, o tempo em que a página ou o editor ficou visível, dimensões ou formato do documento e localização aproximada, como país, região ou cidade. Eles não incluem pixels da arte, nomes de documentos, caminhos de arquivos locais nem dados de conta. Gravações de recuperação em segundo plano não são registradas como salvamentos manuais.

O PostHog guarda um identificador de visitante no `localStorage` deste navegador para contar visitas recorrentes. Ele usa o endereço IP da requisição para adicionar a localização aproximada a novos eventos e descarta o IP original antes de armazenar o evento. Perfis de pessoas e captura automática de cliques estão desativados. Uma amostra das sessões é gravada como replays da estrutura da página e das interações: campos de texto são mascarados, o conteúdo de telas (canvas), como as artes, não é gravado, e os endereços de páginas e requisições gravados mantêm apenas o caminho, sem parâmetros de consulta nem fragmentos. Falhas na análise não interrompem o editor nem as ferramentas.

O identificador anônimo pode ligar ações nas páginas públicas e no editor dentro do mesmo navegador e do mesmo site. Cada carregamento de documento também tem seu próprio identificador de visita. Mudanças de caminho registram uma visita à página; mudanças de consulta ou hash e a hidratação não duplicam visitas. Navegadores de desenvolvimento e homologação podem definir um marcador local de tráfego interno, que acompanha os eventos para que essas visitas possam ser excluídas da análise. Um evento de download significa que o resultado foi entregue ao navegador, não que um arquivo foi gravado no disco.

Enviar a janela de feedback manda ao PostHog o tipo escolhido, o texto escrito e o e-mail opcional, junto com o contexto da visita. Rascunhos não enviados ficam na memória até a página ser recarregada. Se o envio falhar, o rascunho é mantido para nova tentativa.

O PostHog retém eventos de acordo com suas [regras de retenção de eventos](https://posthog.com/docs/data/events-retention). O identificador do navegador normalmente permanece até você ou o navegador limparem os dados deste site.

Links de comparação podem associar um de três identificadores fixos de artigo (`aseprite-online`, `aseprite-on-ipad` ou `piskel-alternatives`) à visita atual ao editor e às suas ações. O Xprite só aceita esses identificadores com a origem de comparação e o meio de indicação fixos. Ele não coleta valores arbitrários de campanha, palavras-chave de busca nem parâmetros brutos de consulta ou hash da URL, e não guarda essa atribuição para visitas futuras.

## Sua escolha

Se o seu navegador oferece **Do Not Track**, ative essa opção e abra o Xprite de novo para parar os relatórios de uso futuros deste navegador. Isso não apaga relatórios anteriores. Limpar os dados do site também redefine o identificador de visitante, mas pode remover trabalhos salvos localmente.

## Dúvidas

Para dúvidas sobre este aviso ou sobre os dados que o Xprite coleta, [fale com o mantenedor pelo GitHub Issues](https://github.com/rhinoc/xprite/issues). Não publique dados pessoais nem arte em uma issue pública; peça um contato privado se precisar.
