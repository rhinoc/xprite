# Como o Xprite funciona

O Xprite leva o editor do Aseprite para o navegador: não há nada para instalar, nenhuma conta para criar e nenhum servidor que guarde sua arte. Este artigo explica, do ponto de vista de engenharia, como lemos e gravamos `.aseprite` no navegador, como desenhamos pixels nítidos com Canvas, onde seu trabalho fica guardado, como o editor abre sem conexão e como uma interface de desktop feita para mouse se adapta a dedos, canetas e telas de celular.

## Visão geral

Todo o trabalho do editor acontece no navegador. Tarefas pesadas rodam em Web Workers, o armazenamento usa o IndexedDB e o OPFS do próprio navegador, e a rede só é usada para carregar a página, enviar análises anônimas e mandar feedback.

```article-diagram
{
  "kind": "map",
  "label": "As partes do Xprite no navegador",
  "root": "Xprite no navegador",
  "branches": [
    {
      "label": "Ler e gravar arquivos",
      "featured": true,
      "items": [
        { "label": "Ler .aseprite", "detail": "Decodificado em um Worker, com a thread principal como alternativa" },
        { "label": "Exportar imagens", "detail": "Codificadas com OffscreenCanvas ou canvas" }
      ]
    },
    {
      "label": "Exibir a tela",
      "items": [
        { "label": "Compor camadas", "detail": "Só Canvas 2D, sem WebGL" },
        { "label": "Ampliar pixels", "detail": "Escalas inteiras desenham direto; escalas fracionárias usam tabelas de amostragem" }
      ]
    },
    {
      "label": "Salvar o trabalho",
      "items": [
        { "label": "Gravar arquivos no dispositivo", "detail": "File System Access API, ou download quando não está disponível" },
        { "label": "Guardar no navegador", "detail": "Catálogo no IndexedDB + dados no OPFS" }
      ]
    },
    {
      "label": "Tratar a entrada",
      "items": [
        { "label": "Distinguir caneta e dedos", "detail": "A caneta tem prioridade; os dedos passam a mover a tela" },
        { "label": "Reconhecer gestos", "detail": "Pinça para zoom; toques com dois e três dedos desfazem e refazem" }
      ]
    }
  ]
}
```

## Ler e gravar .aseprite no navegador

### O formato do arquivo

`.aseprite` é um formato binário little-endian: um cabeçalho de 128 bytes seguido de quadros, cada um formado por vários chunks. O número mágico do cabeçalho é `0xA5E0`, e o de cada quadro é `0xF1FA`. Nosso decodificador trata estes chunks:

| Tipo de chunk | Conteúdo                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| `0x2004`      | Camada: camada normal, grupo, camada de tilemap                                    |
| `0x2005`      | Cel: pixels brutos, cel vinculado, pixels compactados com zlib, tilemap compactado |
| `0x2006`      | Dados extras do cel (posição e tamanho precisos)                                   |
| `0x2007`      | Perfil de cor                                                                      |
| `0x2008`      | Referências a arquivos externos                                                    |
| `0x2018`      | Tags (intervalos de animação)                                                      |
| `0x2019`      | Paleta                                                                             |
| `0x2020`      | Dados do usuário (texto, cor, propriedades)                                        |
| `0x2022`      | Fatia                                                                              |
| `0x2023`      | Tileset                                                                            |

Os chunks de paleta antigos `0x0004` e `0x000B` também são lidos, e os chunks obsoletos de máscara (`0x2016`) e caminho (`0x2017`) são reconhecidos.

### Primeiro verificar, depois decodificar

Um arquivo aberto no navegador pode vir de qualquer lugar, então a decodificação é feita em duas passagens. A primeira percorre o arquivo inteiro e confere se o tamanho, o deslocamento e a contagem de cada chunk ficam dentro do arquivo. Só então começa a decodificação de verdade. Arquivos corrompidos ou acima dos limites são barrados na verificação, em vez de falhar no meio do caminho. Os limites atuais são:

| Item         | Limite               |
| ------------ | -------------------- |
| Lado da tela | 32.768 pixels        |
| Imagem única | 64 milhões de pixels |
| Quadros      | 4.096                |
| Camadas      | 256                  |

### Decodificação em um Worker

Descompactar dezenas de quadros leva tempo, e fazer isso na thread principal travaria a interface. Ao abrir um arquivo, nós o passamos para um Worker dedicado à decodificação, e os buffers de pixels decodificados voltam para a thread principal como objetos `Transferable`, sem cópia. Se o navegador não suportar Workers ou o Worker falhar, a decodificação volta para a thread principal.

Os dados de pixel são compactados com zlib. Preferimos o `DecompressionStream("deflate")` nativo do navegador e limitamos a saída ao tamanho declarado no cabeçalho do chunk, para evitar bombas de descompressão. Quando ele não é suportado, usamos o [fflate](https://github.com/101arrowz/fflate). Esse caminho aloca um buffer de saída exatamente do tamanho declarado e confere a soma de verificação Adler-32.

### Só descompactar os pixels necessários

Quando um arquivo abre, os cels RGB são validados, mas não totalmente descompactados. Os bytes compactados originais ficam na memória, e cada quadro é descompactado quando é necessário. Projetos grandes não precisam ser descompactados na memória de uma vez.

### Regravar o que você não mudou

Ao salvar em `.aseprite`, o codificador deixa intacto o que não foi alterado:

- Cels inalterados são gravados a partir dos bytes compactados guardados desde a abertura, sem recompactar.
- Chunks desconhecidos são gravados como estão, então arquivos feitos em versões mais novas do Aseprite não perdem dados ao serem salvos no Xprite.
- Cels recompactados só usam a versão compactada quando ela é menor que os dados brutos.
- A compactação usa o `CompressionStream` nativo do navegador. Quando ele não é suportado, o arquivo é salvo sem compactação. Fica maior, mas o Aseprite abre normalmente.

## Renderizar a tela só com Canvas 2D

O Xprite não usa WebGL. Telas de pixel art costumam ser pequenas; o difícil é manter cada pixel nítido. Em qualquer nível de zoom e densidade de tela, um pixel precisa aparecer como um quadrado de bordas nítidas, não como algo que o navegador suaviza até virar um borrão.

### Das camadas para a tela

```article-diagram
{
  "kind": "flow",
  "label": "Uma atualização de tela",
  "steps": [
    { "label": "Compor camadas", "detail": "Combinar o quadro atual pela ordem das camadas, opacidade e modo de mesclagem" },
    { "label": "Converter cores", "detail": "Converter com o perfil de cor do projeto e guardar o resultado em cache" },
    { "label": "Enviar a área alterada", "detail": "Aplicar putImageData só no retângulo que este traço alterou no canvas da imagem" },
    { "label": "Desenhar a visualização", "detail": "Repetir os pixels no nível de zoom e adicionar o xadrez, a grade de pixels e as bordas" },
    { "label": "Mostrar na tela", "detail": "Escalas inteiras desenham direto; escalas fracionárias usam tabelas de amostragem" }
  ]
}
```

Enquanto você desenha, o editor registra o retângulo que cada traço altera, e a renderização grava só essa área no canvas da imagem, em vez de reenviar a imagem inteira toda vez. A visualização pronta (pixels, xadrez, grade) fica em cache em um canvas base. A chave do cache inclui a versão dos pixels, a posição da visualização, as configurações de exibição e assim por diante. Mover o cursor não muda a chave, então o canvas base é reaproveitado e só a pré-visualização do pincel é redesenhada.

### Escalas inteiras e fracionárias

O último passo desenha a visualização na tela. Se a visualização corresponde à tela em uma escala inteira exata, a suavização é desligada e o `drawImage` do navegador faz o trabalho:

```ts
if (Number.isInteger(scaleX) && Number.isInteger(scaleY) /* and no offset */) {
  presentation.imageSmoothingEnabled = false;
  presentation.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight,
                         0, 0, canvas.width, canvas.height);
  return;
}
presentation.putImageData(renderer.render(context.getImageData(...)), 0, 0);
```

Em escalas fracionárias, como densidade de tela 1,5 ou zoom de 110% no navegador, cada navegador amostra o `drawImage` de um jeito. As colunas de pixels ficam desiguais, ou a imagem inteira se desloca meio pixel. Nesse caso, fazemos nós mesmos a amostragem por vizinho mais próximo: para o tamanho de destino, calculamos antes a qual pixel de origem cada coluna e linha corresponde e guardamos isso em duas tabelas `Int32Array`. A amostragem copia cada pixel como um único `Uint32`, e sequências de linhas idênticas são copiadas inteiras com `copyWithin`.

A interface segue a mesma ideia: cada controle é desenhado com 2 amostras por pixel lógico. Redimensionar a janela do navegador só muda o tamanho da área de trabalho; botões e menus continuam do mesmo tamanho.

### Importar e exportar imagens

O navegador codifica e decodifica PNG, JPEG, WebP e outras imagens:

- A decodificação prefere `createImageBitmap`, com um elemento `<img>` como alternativa.
- A codificação prefere `OffscreenCanvas.convertToBlob`, com o `toBlob` do `<canvas>` como alternativa.
- Quando um navegador não suporta um formato, o `toBlob` não gera erro; ele devolve um PNG sem avisar. Por isso, depois de codificar conferimos o tipo real do resultado, e antes de exportar codificamos uma imagem de teste de 1×1 para descobrir quais formatos o navegador consegue exportar.

## Onde seu trabalho fica guardado

Há dois lugares para salvar um projeto, escolhidos em **Destino do salvamento** na janela **Salvar como...**:

![A janela Salvar como: nome do arquivo, formato e as opções Navegador e Arquivos locais em Destino do salvamento](images/save-as-location-en.png)

| Local           | Recursos do navegador usados | Quando não está disponível             |
| --------------- | ---------------------------- | -------------------------------------- |
| Arquivos locais | File System Access API       | O arquivo é baixado                    |
| Navegador       | IndexedDB + OPFS             | Os dados do projeto ficam no IndexedDB |

Projetos no navegador existem só neste navegador, neste dispositivo, e não são sincronizados. Limpar os dados do site também os apaga. Veja o [guia do usuário](/help/#salvar-e-recuperar).

### Arquivos locais: gravar direto no arquivo original

Em navegadores com suporte à File System Access API (Chrome, Edge e outros no desktop), **Abrir** e **Salvar** abrem as janelas de arquivo do sistema. O que recebemos é um identificador do arquivo, não uma cópia:

- O identificador é guardado no IndexedDB, então o próximo **Salvar** grava no mesmo arquivo sem perguntar onde.
- Antes de gravar, pedimos permissão de leitura e escrita e então gravamos com `createWritable()`.
- Os navegadores exigem que a janela de arquivo venha direto de um clique do usuário, então chamamos `showSaveFilePicker()` logo após o clique, sem nenhuma outra tarefa assíncrona no meio.
- Quando a página está incorporada no iframe de outro site (um portal de jogos, por exemplo), o navegador não permite janelas de arquivo. O Xprite então baixa o arquivo, como faz em navegadores sem suporte.

### Navegador: catálogo no IndexedDB e dados no OPFS

Para projetos guardados no navegador, o catálogo (nome, tamanho, data de modificação, versão atual) fica sempre no IndexedDB. Os dados do projeto ficam no OPFS (origin private file system, uma área privada do disco que o navegador reserva para cada site) sempre que possível. O OPFS só é usado quando o navegador suporta Workers, `navigator.storage.getDirectory()`, Web Locks e identificadores de arquivo graváveis. O tipo de armazenamento é escolhido quando o projeto é criado e nunca muda, então uma mudança no suporte do navegador não faz projetos antigos sumirem.

A leitura e a gravação no OPFS rodam em um Worker dedicado, que usa um identificador de acesso síncrono (`createSyncAccessHandle`) para gravar, truncar e descarregar os dados. Todo salvamento segue estes passos:

```article-diagram
{
  "kind": "flow",
  "label": "Salvar um projeto no navegador",
  "steps": [
    { "label": "Codificar o projeto", "detail": "Em um Worker, codificar o projeto como .aseprite com metadados como o quadro e a camada atuais" },
    { "label": "Dividir os dados", "detail": "Acima de 256 KiB, dividir nas fronteiras dos chunks .aseprite em segmentos de até 1 MiB" },
    { "label": "Gravar novos segmentos", "detail": "Eliminar duplicatas por tamanho e SHA-256 e reaproveitar segmentos com conteúdo idêntico" },
    { "label": "Ler de volta e conferir", "detail": "Ler tudo de volta, comparar as somas de verificação e desistir na hora se houver truncamento" },
    { "label": "Publicar a versão", "detail": "Em uma transação do IndexedDB, apontar o catálogo para a nova versão e manter a anterior" }
  ]
}
```

Algumas regras evitam que os dados sejam corrompidos:

- Os dados gravados só recebem acréscimos. Cada chave pode ser gravada uma vez, e arquivos que falham no meio são apagados.
- Só a transação final do catálogo troca a versão atual, e apenas se nenhuma outra aba tiver mudado a versão antes (compare-and-swap).
- Quando o Xprite está aberto em várias abas, os Web Locks tornam as gravações mutuamente exclusivas.
- Dividir nas fronteiras dos chunks `.aseprite` mantém quadros e camadas inalterados nos mesmos segmentos. Editar um quadro só grava os segmentos que mudaram.

### Recuperação automática

A recuperação automática usa o mesmo caminho de armazenamento do salvamento no navegador. Enquanto você edita, o Xprite grava dados de recuperação a cada 2 minutos por padrão e os mantém por 7 dias. O intervalo e o número de dias podem ser alterados em **Editar → Preferências → Arquivos**. Se o navegador fechar de repente, escolha **Recuperar arquivos...** no Início para recuperar seu trabalho.

## Links de compartilhamento: o sprite fica depois do

**Arquivo → Compartilhar...** não envia nada. O sprite é compactado e gravado na parte do link depois de `#share=` (o fragmento da URL). Os navegadores não enviam ao servidor nada que venha depois de `#`, então o compartilhamento nunca passa por um servidor.

![A janela Compartilhar...: opções para compartilhar só o quadro atual ou as camadas visíveis, seguidas de um link que começa com https://xprite.cc/editor#share= e a contagem de caracteres](images/share-dialog-en.png)

```article-diagram
{
  "kind": "flow",
  "label": "Criar um link de compartilhamento",
  "steps": [
    { "label": "Montar candidatos", "detail": "Empacotar os pixels de vários jeitos: planos por canal, diferenças entre quadros, cor indexada, tiles" },
    { "label": "Ficar com o menor", "detail": "Testar cada candidato sem compactação, com DEFLATE e com Zstd, e ficar com o menor" },
    { "label": "Codificar como texto", "detail": "Links usam Base64url; QR codes testam Base32 e Base43 e ficam com o mais curto" },
    { "label": "Montar o link", "detail": "Endereço do editor + #share= + marcador de codificação + dados" }
  ]
}
```

- Empacotamento, compactação e decodificação rodam em um Worker. O Zstd roda como WebAssembly: os dados são compactados primeiro no nível 19, e resultados abaixo de 1 MiB são compactados de novo em um nível mais alto. Se o WebAssembly não carregar, só o DEFLATE é usado, e o link continua abrindo.
- O modo alfanumérico do QR code usa só 5,5 bits por caractere, o que é mais compacto que o modo byte, então os QR codes usam uma codificação Base43 feita só com caracteres desse modo.
- Quando um link é aberto, o editor lê os dados depois de `#share=`, remove-os da barra de endereço na hora com `history.replaceState` e os entrega a um Worker para decodificar.
- Links com mais de 1.800 caracteres vêm com um aviso de que alguns apps de mensagem podem cortá-los. Links com mais de 8.192 caracteres não são criados.

O link contém o projeto editável completo. Qualquer pessoa com o link completo pode abri-lo; os links não expiram e não podem ser revogados. Se você enviar um link ou QR code por um app de mensagens, esse app também recebe os dados da arte.

## Uso offline: uma versão completa por vez

Depois que você adiciona o Xprite à área de trabalho ou à Tela de Início, um Service Worker guarda o editor em cache para que ele abra sem conexão. (O cache precisa de uma visita on-line ao editor antes; veja os passos no [guia do usuário](/help/#adicionar-à-área-de-trabalho-e-usar-offline).) A estratégia de cache gira em torno de manter as versões consistentes:

- Cada build gera um manifesto de recursos daquela versão, com um hash SRI para cada arquivo. Na instalação, `cache.addAll` guarda o manifesto inteiro de uma vez. Se algum arquivo falhar no download ou o hash não bater, a versão não entra em vigor, então arquivos antigos e novos nunca se misturam.
- Quando tudo está em cache, um marcador de "pronto" é gravado, e as aberturas offline só usam versões com esse marcador.
- Uma nova versão assume assim que é instalada, mas páginas já abertas continuam rodando o código antigo. Recursos antigos com nomes de arquivo com hash são mantidos para que essas páginas ainda consigam carregá-los.
- Só o resultado do build vai para o cache. Análises, o endereço de feedback e as páginas do site não passam pelo cache.
- O cache de uma versão antiga só é apagado depois que todas as janelas do editor são fechadas.

Em navegadores com suporte, também pedimos armazenamento persistente (`navigator.storage.persist()`) para diminuir a chance de o navegador apagar seu trabalho quando o espaço acabar.

## Telas sensíveis ao toque e canetas

Um mouse tem um ponteiro, mas uma tela sensível ao toque pode ter uma caneta e vários dedos ao mesmo tempo. A camada de entrada lida com eles com estas regras:

| Situação                           | O que acontece                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Caneta e dedo tocam ao mesmo tempo | A caneta tem prioridade e interrompe a ação do dedo                             |
| Depois que uma caneta é detectada  | Um dedo move a tela por padrão, para evitar marcas acidentais da palma          |
| Um segundo dedo toca a tela        | O traço atual é cancelado e começa um gesto de dois dedos                       |
| Pinça com dois dedos               | Aplica zoom na tela                                                             |
| Toque com dois ou três dedos       | Desfazer ou refazer                                                             |
| Depois que um dedo toca a tela     | O Xprite primeiro decide se é um toque ou um arraste e só então começa a editar |

O limite de arraste também depende do tipo de ponteiro: um dedo precisa se mover mais de 8 pixels CSS para contar como arraste, enquanto um mouse ou uma caneta só precisa de 1 pixel.

### Traços mais finos

Para economizar trabalho, os navegadores juntam vários eventos `pointermove` de um mesmo quadro em um só. Quando você desenha com caneta, pegamos todas as amostras agrupadas de `getCoalescedEvents()`, cada uma com seu valor de pressão. Os navegadores também oferecem amostras previstas, que não usamos: um ponto previsto pode não bater com o traço real e nunca deve parar no histórico de desfazer.

```ts
/** Real samples only: predicted input must never reach document history. */
const coalesced = event.getCoalescedEvents?.() ?? [];
const actual = coalesced.filter(
  (point) => point.pointerId === event.pointerId && point.pointerType === "pen",
);
```

### Apple Pencil no iPad

No Safari do iPad, toques do Apple Pencil disparam comportamentos do sistema por padrão, como seleção de texto e Escrever à Mão. Os listeners de toque do React são passivos e não conseguem impedir o comportamento padrão, então registramos um listener nativo `touchstart` não passivo direto na tela e nos controles arrastáveis, e chamamos `preventDefault()` só quando `touchType` é `stylus`. Campos de texto e outras áreas editáveis não são afetados, então você ainda pode escrever neles com o Escrever à Mão.

## Layout: da janela do desktop ao celular em pé

A interface do Xprite recria o Aseprite 1.3. Os tamanhos das janelas e as posições dos controles vêm de medições do Aseprite 1.3.18, e testes os mantêm alinhados. Os gráficos do tema seguem o estilo pixelado do Aseprite, e a interface em chinês usa a fonte Fusion Pixel.

Em uma tela larga, você tem o layout de desktop conhecido: a barra de menus no topo, a paleta à esquerda, as ferramentas à direita e a linha do tempo embaixo.

![O layout largo: barra de menus no topo, paleta e seletor de cor à esquerda, ferramentas à direita, linha do tempo embaixo](images/workspace-wide-en.png)

Esse layout não cabe em um celular na vertical. Quando o **Layout do espaço de trabalho** está em **Auto** (o padrão), escolhemos um layout de acordo com o espaço disponível. Você também pode fixá-lo em **Layout largo** ou **Layout compacto**; veja o [guia do usuário](/help/#organizar-o-espaço-de-trabalho). As regras são:

| Com base em                             | Condição                                        | Resultado                                                                                         |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Proporção da área disponível            | ≥ 1,2                                           | Layout largo: painéis nas bordas                                                                  |
| Proporção da área disponível            | < 1,2                                           | Layout compacto: ferramentas em uma linha no topo, paleta e linha do tempo em abas abaixo da tela |
| Largura da área disponível              | < 768 pixels CSS                                | A interface passa para a densidade compacta                                                       |
| Pontos de toque ou precisão do ponteiro | Qualquer ponto de toque, ou `(pointer: coarse)` | Modo de interação por toque                                                                       |

No layout compacto, a barra de menus se recolhe no botão ☰ do canto superior esquerdo, e a interface evita as áreas seguras, como o entalhe e os cantos arredondados:

![O layout compacto em um celular na vertical: abas e uma linha de ferramentas no topo, a tela no meio e as abas Paleta e Linha do tempo embaixo](images/workspace-compact-en.png)

Layout e modo de interação são definidos separadamente. Um iPad na horizontal usa o layout largo e a interação por toque ao mesmo tempo. Estreitar a janela de um navegador no desktop muda para o layout compacto, mas mantém a interação por mouse.

## Dados que o Xprite envia

Editar, salvar e compartilhar não usam a rede. Só dois tipos de dados são enviados:

| Dados          | Quando são enviados                         | Incluem                                                                                               | Não incluem                                                      |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Análise de uso | Quando você usa a versão web oficial        | Visitas a páginas, uso de recursos, categorias de erro, recursos do navegador, localização aproximada | Pixels da arte, nomes de documentos, caminhos de arquivos locais |
| Feedback       | Quando você envia **Problemas e sugestões** | Tipo de feedback, mensagem, e-mail opcional, detalhes da visita atual                                 | —                                                                |

A análise de uso vai para o PostHog Cloud (EUA):

- O ID de visitante fica no `localStorage` do navegador.
- O endereço IP original é descartado depois que a localização aproximada é adicionada.
- A gravação de sessões e a captura automática de cliques estão desativadas.
- Se você ativar o Do Not Track no navegador e abrir o Xprite de novo, nenhum dado de uso é enviado.

Veja todos os detalhes no [aviso de privacidade](/privacy/).

## Código aberto

O código-fonte de tudo o que foi descrito aqui está no [GitHub](https://github.com/rhinoc/xprite). O código do editor é licenciado sob GPL-2.0-only.
