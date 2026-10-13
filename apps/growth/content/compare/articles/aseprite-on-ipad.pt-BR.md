---
published: 2026-10-10
updated: 2026-10-10
---

# Aseprite no iPad: uma opção grátis e 3 apps comparados

Não existe versão do Aseprite para iPad. Os downloads [oficiais](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite) são só para Windows, macOS e Ubuntu. Para continuar um projeto `.aseprite` no iPad, você precisa de outro editor que leia esse formato. Há dois caminhos principais:

- Continuar desenhando de graça: abra o Xprite no Safari, importe o projeto e salve de volta em `.aseprite` quando terminar. Não há nada para instalar nem compras no app.
- Comprar um app para iPad: Pixquare, Resprite e Pixaki Pro importam projetos `.aseprite` e aceitam toque duplo no Apple Pencil. Os dois primeiros também aceitam o gesto de apertar do Apple Pencil Pro.

O preço não é a única diferença. A tabela compara os quatro editores recurso por recurso.

|                                | Xprite                         | Pixquare                                              | Resprite                                    | Pixaki Pro                              |
| ------------------------------ | ------------------------------ | ----------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| Preço                          | 🆓 Grátis, sem compras no app  | 💰 Compra única, US$ 24,99 para todos os dispositivos | 💰 Assinatura ou compra única               | 💰 Intro é grátis, o Pro é pago à parte |
| Plataformas                    | ✅ Navegador                   | ✅ iPhone, iPad, Mac                                  | ✅ iPhone, iPad, Android, Windows, Mac      | ⚠️ Só iPad                              |
| Importar `.aseprite`           | ✅ Abre diretamente            | ✅ Pode manter o formato original                     | ⚠️ Convertido em `.resprite`, com perdas    | ✅ Sim                                  |
| Exportar `.aseprite`           | ✅ Grava o formato original    | ✅ Sim                                                | ⚠️ Alguns efeitos se perdem                 | ✅ Mantém camadas e cels                |
| Pele de cebola                 | ✅ Sim, mais tags              | ✅ Sim                                                | ✅ Sim, mais clipes                         | ✅ Sim, mais quadros mantidos           |
| Tilemaps                       | ✅ Editáveis                   | ✅ Podem ser animados                                 | ⚠️ Sim, mas os importados não são editáveis | —                                       |
| Toque duplo no Apple Pencil    | ❌ Não                         | ✅ Segue os ajustes do sistema                        | ✅ Personalizável                           | ✅ Sim                                  |
| Apertar                        | ❌ Não                         | ✅ Abre um menu ou a paleta                           | ✅ Personalizável                           | —                                       |
| Offline                        | ⚠️ Abrir uma vez on-line antes | ✅ Projetos guardados no dispositivo                  | ✅ Projetos guardados no dispositivo        | ✅ Projetos guardados no dispositivo    |
| Sincronizar entre dispositivos | ⚠️ Salvar arquivos manualmente | ✅ Sincronização com iCloud                           | ⚠️ Exportar `.resprite` manualmente         | ✅ Sincronização com iCloud             |

## No que o Pixquare, o Resprite e o Pixaki se saem melhor

Esses três apps brilham na entrada com Apple Pencil e com os dedos:

|          | Toque duplo                              | Apertar                                | Um dedo                                   |
| -------- | ---------------------------------------- | -------------------------------------- | ----------------------------------------- |
| Pixquare | Segue os ajustes do sistema              | Abre o menu de ferramentas ou a paleta | Mover a tela ou trocar quadros e camadas  |
| Resprite | 6 ações para escolher                    | Pode receber ações parecidas           | —                                         |
| Pixaki   | Compatível com Apple Pencil (2ª geração) | —                                      | Ferramenta atual, borracha, mover ou nada |

Detalhes sobre controles e preços:

- Pixquare: dá para configurar a tela para que só o lápis desenhe. Aí um dedo move a tela ou desliza entre quadros e camadas. A versão só para iPhone custa US$ 7,99; nos 3 primeiros dias após o primeiro download, a versão para todos os dispositivos sai por US$ 19,99.
- Resprite: o toque duplo pode virar borracha, conta-gotas, ferramenta anterior, balde de tinta, lápis ou desfazer. Passar de um limite de pressão dispara uma segunda ação, e o tamanho do pincel acompanha a pressão. A versão de teste exporta todos os formatos sem marca d'água, mas com limite diário; o Premium remove o limite e acrescenta ajustes de cor, contornos avançados, simetria e fontes personalizadas. As compras não passam de uma loja de apps para outra, mas iPhone e iPad compartilham a mesma compra na mesma Conta Apple. A versão para Mac exige um Mac com Apple silicon.
- Pixaki: a versão grátis Intro é limitada a 3 camadas mais 1 camada de referência, 8 quadros e uma tela de 160 × 160. O Pro libera importação e exportação de `.aseprite`, telas de até 8192 px de lado e até 2 MP no total. Projetos guardados no iCloud abrem em vários dispositivos, e você os compartilha com outras pessoas como arquivos `.pixaki`.

Os três também exportam PSD e vídeo, o que o Xprite não faz. O Pixaki também é bom para ajustar o tempo da animação com precisão: arraste a linha do tempo para a esquerda e para a direita e a tela acompanha. Defina um quadro com 2× a duração e você tem um quadro mantido. As durações seguem a taxa de quadros do projeto, então a 10 fps, 1× é 0,1 segundo e 3× é 0,3 segundo. As camadas são de três tipos: animação, estática e referência.

## Quando usar o Xprite

Se você leva o mesmo arquivo `.aseprite` do computador para o iPad e vice-versa e não quer comprar outro editor, o Xprite resolve. Ele roda no navegador, é grátis e não tem compras no app. Ao abrir um projeto indexado de 8 bits ou em escala de cinza de 16 bits, o modo de cor continua o mesmo, então dá para seguir desenhando na hora. Ele exporta `.aseprite`, PNG, GIF, APNG e sprite sheets; JPEG e WebP dependem do navegador.

![Xprite com example.aseprite aberto: camadas e quadros na linha do tempo embaixo, com a pele de cebola ativada](images/editor-with-aseprite-en.png)

No Xprite, o Apple Pencil e os dedos dividem o trabalho: quando ele detecta um lápis, o lápis desenha e o dedo move a tela. Depois de recarregar a página, use o lápis mais uma vez para ele trocar de novo. Essa é a opção **Automático: desenhar com os dedos até usar uma caneta**, em **Ação com um dedo**, em **Editar → Preferências → Toque**, e você pode escolher ali uma opção fixa.

![A página Toque nas Preferências, com Ação com um dedo em Automático: desenhar com os dedos até usar uma caneta](images/touch-settings-en.png)

Sem teclado, isto ajuda:

- Gestos: toque com dois dedos para desfazer e com três para refazer; mantenha os dedos na tela para repetir. Mover, aplicar zoom e tocar e segurar para pegar uma cor também funcionam. Dá para ligar e desligar cada um, como descrito em [Dedos e caneta](/pt-BR/help/#dedos-e-caneta).
- Barra de atalhos: ative em **Exibir → Mostrar → Barra de atalhos**. Com uma seleção, os botões de seta a movem 1 pixel por vez, e **Manter proporção**, **A partir do centro** e **Duplicar ao arrastar** substituem as teclas modificadoras. Veja [Barra de atalhos](/pt-BR/help/#barra-de-atalhos).
- Tela de Início: no Safari, toque no botão Compartilhar e depois em **Adicionar à Tela de Início**. Depois de abrir uma vez com internet, dá para desenhar offline. Se não abrir offline, abra mais uma vez com internet. Veja [Adicionar à área de trabalho e usar offline](/pt-BR/help/#adicionar-à-área-de-trabalho-e-usar-offline).
- Compartilhamento: **Arquivo → Compartilhar...** empacota o projeto em um link ou QR code no seu dispositivo, sem enviar para lugar nenhum. A outra pessoa abre uma cópia, então não dá para editar junto. Se o projeto for grande demais, exporte um arquivo.

![A barra de atalhos na borda esquerda da janela, com botões de seta e um botão embaixo para mais ícones](images/shortcut-toolbar-en.png)

Por outro lado, o Xprite não tem ajustes para toque duplo nem para apertar. Se você depende desses gestos, um dos três apps acima combina mais com você.

## Como levar arquivos `.aseprite` para o iPad

Para editar o mesmo projeto no computador e no iPad:

```article-diagram
{
  "kind": "flow",
  "label": "Um arquivo .aseprite entre computador e iPad",
  "steps": [
    {
      "label": "Importe o projeto",
      "detail": "Abra o Xprite no Safari e importe o arquivo .aseprite. Camadas e quadros vêm juntos."
    },
    {
      "label": "Edite camadas e quadros",
      "detail": "Continue desenhando no iPad ou ajuste a animação."
    },
    {
      "label": "Salve como .aseprite",
      "detail": "Arquivo → Salvar como → Arquivos locais salva o arquivo neste dispositivo."
    },
    {
      "label": "Copie de volta para o computador",
      "detail": "Abra no editor de sempre e continue trabalhando."
    }
  ]
}
```

O Xprite abre `.ase` e `.aseprite` e mantém o seguinte ao ler e gravar:

- Camadas de imagem, grupos de camadas, camadas de tilemap e tilesets
- Duração dos quadros em milissegundos
- Direção das tags (para frente, reverso, ping-pong, ping-pong reverso) e número de repetições
- Fatias

O Xprite não abre arquivos com profundidade de cor diferente de 8, 16 ou 32 bits, nem arquivos acima dos limites de 32.768 pixels por lado da tela, 4.096 quadros ou 256 camadas. Quando isso acontece, o projeto aberto não é substituído.

**Arquivo → Salvar como** oferece dois lugares para salvar (passos em [Salvar e recuperar](/pt-BR/help/#salvar-e-recuperar)):

- Arquivos locais: salva o arquivo neste dispositivo. Se o navegador não tiver janela de salvar, o arquivo é baixado.
- Navegador: o projeto só abre de novo neste navegador, neste dispositivo. Limpar os dados do site também apaga os backups de recuperação.

![A janela Salvar como, com Navegador e Arquivos locais lado a lado em Destino do salvamento](images/save-as-browser-or-files-en.png)

Os outros três apps convertem alguma coisa ao importar um projeto `.aseprite`:

- [Pixquare](https://docs.pixquare.art/pixquare-file/create-import): você pode converter para `.px` ao importar ou manter o formato original. Se mantiver o formato original, o salvamento automático, o backup automático e o timelapse ficam desativados. O Pixquare também [exporta](https://docs.pixquare.art/pixquare-file/exporting) `.aseprite`.
- [Resprite](https://resprite.fengeon.com/docs/files/aseprite): os projetos são convertidos para `.resprite`, e algumas informações se perdem:
  - A duração dos quadros é arredondada para passos de 100 ms; qualquer coisa menor conta como 100 ms
  - Tags sobrepostas e o número de repetições das tags não são mantidos, e o ping-pong reverso vira ping-pong
  - A cor indexada vira cor comum, e os nomes das cores da paleta se perdem
  - Tilemaps do arquivo `.aseprite` não podem ser editados como mapas
  - Ao exportar de volta para `.aseprite`, os tilemaps do Resprite viram pixels comuns, estilos dinâmicos como contornos e sombras não são desenhados na imagem, e a opacidade e os modos de mesclagem dos grupos não são mantidos
- [Pixaki](https://pixaki.com/user-guide/export/): importar e exportar exige o Pro, e as exportações mantêm camadas e cels. A duração do quadro é a taxa de quadros do projeto × quadros mantidos, o que difere das durações em milissegundos que o `.aseprite` guarda.

PNG, GIF e sprite sheets não têm camadas. Servem para entregar o trabalho pronto, mas salve uma cópia `.aseprite` separada de tudo o que você ainda vai editar. Se você só precisa de uma imagem animada, veja [Aseprite para GIF](/tools/viewer/#export-gif). Para só abrir um projeto no navegador, veja [Aseprite online](/pt-BR/compare/aseprite-online/).

## Perguntas frequentes

### Existe versão do Aseprite para iPad?

Não. O Aseprite só está disponível para Windows, macOS e Ubuntu.

### Dá para usar o Xprite sem um arquivo `.aseprite`?

Sim. Você pode criar uma tela nova e desenhar ou animar na hora, e importar um arquivo `.ase` ou `.aseprite` quando tiver um.

### Tocar com dois dedos é o mesmo que o toque duplo do Apple Pencil?

Não. Tocar com dois dedos é tocar a tela com os dedos, e o Xprite usa isso para desfazer por padrão. O toque duplo é tocar na lateral do Apple Pencil. O Xprite não tem ajuste para ele; o Pixquare, o Resprite e o Pixaki têm.

---

Para sentir como funciona, abra o [Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-on-ipad) no Safari, importe um projeto e teste desfazer, trocar de quadro e salvar.
