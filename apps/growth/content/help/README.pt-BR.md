# Guia do usuário

- [Salvar e recuperar](#salvar-e-recuperar)
- [Abrir e exportar arquivos](#abrir-e-exportar-arquivos)
- [Organizar o espaço de trabalho](#organizar-o-espaço-de-trabalho)
- [Mostrar e ocultar controles](#mostrar-e-ocultar-controles)
- [Mouse, trackpad e atalhos](#mouse-trackpad-e-atalhos)
- [Dedos e caneta](#dedos-e-caneta)
- [Barra de atalhos](#barra-de-atalhos)
- [Colar uma imagem externa](#colar-uma-imagem-externa)
- [Pegar uma cor da tela](#pegar-uma-cor-da-tela)
- [Adicionar à área de trabalho e usar offline](#adicionar-à-área-de-trabalho-e-usar-offline)
- [Exportar designs do Animal Crossing](#exportar-designs-do-animal-crossing)
- [Compartilhar um sprite](#compartilhar-um-sprite)
- [Replay do desenho](#replay-do-desenho)
- [Navegadores e dispositivos](#navegadores-e-dispositivos)
- [Perguntas frequentes](#perguntas-frequentes)
- [Relatar um problema](#relatar-um-problema)

## Salvar e recuperar

Em **Arquivo → Salvar como** há dois locais para salvar:

- **Navegador**: o projeto fica guardado só neste navegador, neste dispositivo, e não é sincronizado. Para reabrir depois, use **Arquivos recentes** no Início.
- **Arquivos locais**: o projeto é salvo como arquivo `.aseprite` ou `.png` no seu dispositivo. Para reabrir depois, use **Arquivo → Abrir...**. Se o navegador não tiver janela de salvar, o arquivo é baixado.

![Opções de local em Salvar como.](images/en/save-as.webp)

Limpar os dados do site apaga os projetos do navegador e os backups de recuperação. Antes de trocar de dispositivo ou de navegador, ou de limpar os dados, salve uma cópia em **Arquivos locais**.

Se a página mostrar "As alterações não estão salvas neste navegador.", mantenha o projeto aberto e escolha **Tentar salvar novamente**, ou use **Salvar como → Arquivos locais** para salvar uma cópia em arquivo.

Por padrão, o Xprite grava dados de recuperação a cada 2 minutos e mantém sprites editados por 7 dias. Os dois valores podem ser alterados em **Editar → Preferências → Arquivos**. Se o navegador fechar de repente, escolha **Recuperar arquivos...** no Início e restaure o trabalho em **Sessões anteriores**.

Para excluir uma cópia do navegador, feche o projeto primeiro, abra o menu dele em **Arquivos recentes** e escolha **Excluir cópia do navegador**. Isso apaga o projeto do navegador, a imagem em cache e os backups de recuperação. Arquivos salvos no dispositivo não são afetados.

## Abrir e exportar arquivos

**Arquivo → Abrir...** abre:

- projetos do Aseprite (`.ase`, `.aseprite`), com camadas, quadros e tags;
- imagens como PNG e JPEG, em qualquer formato que o navegador consiga decodificar;
- GIF e WebP animados, com cada quadro importado como um quadro.

Para abrir uma sprite sheet, use **Arquivo → Importar sprite sheet** e defina os limites dos quadros para o Xprite encontrar cada um.

Projetos do Aseprite podem ter até 32.768 pixels de largura e altura, até 4.096 quadros e 256 camadas. O Xprite ainda não implementa todos os recursos do Aseprite e não executa scripts nem extensões do Aseprite, então alguns projetos podem não abrir exatamente como no Aseprite.

Quando você abre uma foto, ou uma imagem que talvez não seja pixel art, aparece a janela **Pixelizar imagem**:

- Defina largura e altura (1–16.384) e o número de cores (2–256) e escolha **Pixelizar e importar**.
- Escolha **Manter original** para importar a imagem como está.

Todas as opções de exportação ficam em **Arquivo → Exportar**:

- **Exportar como...**: imagens únicas em PNG, JPEG ou WebP; animações em GIF, APNG ou WebP.
- **Exportar sprite sheet**: PNG, opcionalmente com **Dados JSON**.
- **Exportar tileset**: PNG, disponível quando a camada atual é uma camada de tilemap.

Alguns navegadores não exportam JPEG ou WebP e mostram "JPEG indisponível neste navegador" ou "WebP indisponível neste navegador". Nesse caso, exporte em PNG.

Se aparecer "Não foi possível abrir o arquivo.", verifique nesta ordem:

- O arquivo é um projeto do Aseprite ou uma imagem em formato aceito pelo navegador.
- O arquivo está completo e não foi corrompido ao baixar ou copiar.
- O projeto do Aseprite está dentro dos limites de tamanho, quadros e camadas citados acima.

## Organizar o espaço de trabalho

Use **Layout do espaço de trabalho**, ao lado das abas de documentos, para organizar os painéis.

![Botão de layout do espaço de trabalho.](images/shared/layout-button.webp)

- Arraste as alças ou abas dos painéis e siga as guias para encaixá-los, colocá-los lado a lado ou juntá-los em abas.
- Abra o menu da alça ou da aba de um painel para deixá-lo flutuante ou escolher **Recolher em botão**.

**Auto** escolhe um layout de acordo com o espaço disponível na janela.

Use **Salvar atual...** para salvar uma organização. Mudanças em um layout salvo selecionado atualizam esse layout; para manter a versão anterior, salve uma nova cópia antes.

![Lista de layouts do espaço de trabalho.](images/en/layout-menu.webp)

## Mostrar e ocultar controles

As opções da barra de menus e das barras de ferramentas ficam em **Exibir → Mostrar**.

![Menu Exibir → Mostrar.](images/en/view-show.webp)

Depois de ocultar a barra de menus, use **Menu**, à esquerda das abas de documentos, para voltar a **Exibir → Mostrar**. Depois de ocultar a barra de opções da ferramenta, clique na ferramenta selecionada para abrir as configurações dela.

Deslize ao longo da barra de ferramentas para alcançar as que não cabem. Uma barra horizontal também rola com a roda do mouse e com o trackpad.

## Mouse, trackpad e atalhos

Por padrão, a roda do mouse aplica zoom na tela, deslizar dois dedos no trackpad move a tela e o gesto de pinça aplica zoom.

Se o dispositivo for detectado errado, escolha **Roda do mouse** ou **Trackpad** em **Editar → Preferências → Editor → Dispositivo de rolagem**. As opções de zoom com a roda e com dois dedos ficam na mesma seção.

Se o navegador ou o sistema já usar um atalho, use o menu ou a barra de atalhos, ou mude a combinação em **Editar → Atalhos de teclado**.

## Dedos e caneta

Gestos padrão:

- **Arrastar com dois dedos** move a tela.
- **Pinçar com dois dedos** aplica zoom. Ao soltar, o zoom se ajusta a um nível fixo.
- **Tocar com dois dedos** desfaz.
- **Tocar com três dedos** refaz.
- **Manter dois ou três dedos parados** repete o desfazer ou o refazer.
- **Tocar e segurar com um dedo** seleciona uma cor.

Os dedos desenham até você usar uma caneta. Depois disso, os dedos movem a tela e a caneta desenha.

Para que os dedos sempre desenhem ou sempre movam a tela, escolha um modo em **Editar → Preferências → Toque → Ação com um dedo**. Essa seção também controla o zoom por pinça, os gestos de desfazer e refazer, a seleção de cor e os tempos de espera.

![Preferências de toque.](images/en/touch-settings.webp)

## Barra de atalhos

Ative em **Exibir → Mostrar → Barra de atalhos**. Os botões de direção movem a seleção um pixel por vez; **Manter proporção**, **A partir do centro** e **Duplicar ao arrastar** substituem as teclas modificadoras correspondentes.

![Os quatro botões para mover uma seleção.](images/shared/selection-arrows.webp)

![Da esquerda para a direita: Manter proporção, Duplicar ao arrastar e A partir do centro.](images/shared/selection-modifiers.webp)

Com Seleção retangular, Seleção elíptica ou Laço no modo **Substituir** ou **Interseção**, toque fora da seleção para limpá-la. Isso também funciona quando os dedos estão configurados para mover a tela; arrastar continua movendo a tela.

## Colar uma imagem externa

Colar imagens de outro app pode exigir permissão de área de transferência no navegador.

Se não der para colar, abra a imagem como arquivo e depois copie para o projeto de destino dentro do Xprite.

## Pegar uma cor da tela

Segure **Alt** (**Option** no Mac) e clique no botão da cor principal ou de fundo para pegar uma cor fora do editor.

![Botões de cor principal e de fundo.](images/shared/color-buttons.webp)

Pegar cores da tela exige Chrome ou Edge no computador, com o Xprite aberto por HTTPS ou em localhost. Se o navegador não tiver suporte, abra a imagem no Xprite e pegue as cores dela ali.

## Adicionar à área de trabalho e usar offline

- **Chrome ou Edge**: escolha **Ajuda → Adicionar à área de trabalho**. Se o item não aparecer, use **Instalar app** no menu do navegador.
- **Safari no Mac**: escolha **Arquivo → Adicionar ao Dock…**.
- **Safari no iPhone ou iPad**: toque em **Compartilhar** e depois em **Adicionar à Tela de Início**. **Compartilhar** pode estar dentro do menu da página.

![Botão de instalar na barra de endereço do Chrome.](images/en/chrome-install-button.webp)

Abra o editor uma vez com internet antes de usar offline. Se ele não abrir offline, conecte-se e abra de novo.

## Exportar designs do Animal Crossing

Em **Arquivo → Exportar…**, escolha **Formato de exportação → Jogos e artesanato → Animal Crossing**. Clique em uma célula da imagem de origem para selecionar o QR code dela. Passe o cursor sobre a borda direita, a borda inferior ou o canto inferior direito da célula selecionada e arraste para redimensionar. Arraste a origem da grade para movê-la; as alças de espaçamento aparecem acima ou à esquerda. As alças aparecem ao passar o cursor; em telas sensíveis ao toque, toque em uma borda para mostrar a alça e arraste. Os valores também podem ser digitados à esquerda.

## Compartilhar um sprite

Escolha **Arquivo → Compartilhar...** e depois **Copiar link** para enviar o link, ou **Salvar QR code**. A outra pessoa abre o link ou escaneia o código para ver seu sprite. O sprite é compactado na parte do link depois de `#share=`. O link é criado no seu dispositivo e nada é enviado a um servidor.

- Qualquer pessoa com o link completo pode abrir o sprite. Os links não expiram e não podem ser revogados.
- Links com mais de 1.800 caracteres vêm com um aviso de que alguns apps de mensagem podem cortá-los. Links com mais de 8.192 caracteres não podem ser criados.
- Se o sprite for grande demais, compartilhe só o quadro atual ou as camadas visíveis, ou exporte um arquivo e envie.
- Quando o link é longo demais para um QR code, só é possível copiar o link.

## Replay do desenho

Escolha **Sprite → Processo de desenho → Iniciar gravação** para começar a gravar. Ao terminar, escolha **Parar gravação** para abrir o replay, ou **Continuar gravação** para acrescentar mais.

Abra **Replay do desenho…** para assistir a uma gravação:

- **Exportar…** salva a gravação como arquivo `.xprite-replay`, que pode ser reproduzido depois com **Abrir replay…**.
- O menu do botão de exportar tem **Exportar GIF da tela…** para gerar um GIF animado.

Os replays são salvos junto com os projetos do navegador, mas arquivos PNG e Aseprite não os incluem. Exporte um arquivo `.xprite-replay` separado antes de trocar de navegador ou dispositivo.

## Navegadores e dispositivos

Ler e gravar arquivos, a área de transferência e pegar cores da tela dependem do que o navegador suporta e permite. O Xprite não tem versão mínima de navegador. Em vez disso, abra **Editar → Preferências → Diagnóstico** e veja a **Verificação de compatibilidade do navegador**. Uma marca de seleção indica que o recurso é suportado.

![A página Diagnóstico nas Preferências: a verificação de compatibilidade do navegador lista 8 itens, incluindo File System Access, OPFS, IndexedDB e Web Workers, todos marcados.](images/en/browser-compatibility-check.webp)

O que acontece quando uma verificação falha:

- ⚠️ File System Access · Open: usa-se o seletor de arquivos do próprio navegador.
- ⚠️ File System Access · Save: **Arquivos locais** baixa o arquivo.
- ⚠️ OPFS project storage: os projetos do navegador ficam no IndexedDB.
- ❌ IndexedDB: não é possível salvar arquivos recentes.
- ❌ Web Workers: compartilhamento por link e exportação WebP sem perdas ficam indisponíveis.
- ⚠️ CompressionStream: arquivos `.aseprite` são salvos sem compactação e ficam maiores.

Mensagens comuns:

- "O compartilhamento não está disponível neste navegador.": o navegador não suporta Web Workers. Exporte um arquivo e envie.
- "IndexedDB indisponível; os arquivos recentes não serão mantidos neste navegador.": o navegador desativou ou limitou o armazenamento do site. Salve em **Arquivos locais**.
- "O armazenamento de arquivos recentes está bloqueado por outra aba do navegador.": o Xprite está aberto em mais de uma aba. Feche as outras abas e tente de novo.
- "A tela do Aseprite excede o limite de recursos do navegador": a tela do projeto do Aseprite é grande demais para o navegador.

Telas maiores e mais quadros e camadas usam mais memória. Celulares e tablets têm menos memória que computadores, então projetos grandes têm mais chance de não abrir ou ficar lentos neles.

## Perguntas frequentes

### O Xprite é gratuito?

Sim. O Xprite é gratuito e de código aberto. O código do editor é licenciado sob GPL-2.0-only, e os pacotes de UI reutilizáveis sob MIT.

### Preciso de conta?

Não. Abra a página e comece a desenhar. Não há contas, e seu trabalho não é sincronizado com nenhuma.

### Meu trabalho é enviado para um servidor?

Não. Editar, salvar e compartilhar acontecem no navegador, e o Xprite não tem servidor que guarde artes. Só são enviados pela rede a análise de páginas e o feedback que você mandar, e nenhum dos dois inclui sua arte. Veja o [aviso de privacidade](/privacy/) e [como o Xprite funciona](/about/how-it-works/).

### Qual a relação entre o Xprite e o Aseprite?

O Xprite segue a interface e o jeito de trabalhar do Aseprite, mas é um projeto independente. Ele não é afiliado nem endossado pelo Aseprite ou pela Igara Studio S.A.

### Como mudo o idioma da interface?

Por padrão, a interface segue o idioma do navegador. Para mudar, vá em **Editar → Preferências → Geral → Idioma**.

### Meu trabalho sumiu. O que fazer?

Primeiro procure em **Arquivos recentes** no Início. Se não estiver lá, escolha **Recuperar arquivos...** e procure em **Sessões anteriores**. Veja [Salvar e recuperar](#salvar-e-recuperar).

## Relatar um problema

Escolha **Ajuda → Problemas e sugestões**, ou **Feedback** no lado direito do Início. Você também pode abrir uma issue no [GitHub Issues](https://github.com/rhinoc/xprite/issues). Informe o navegador, o dispositivo e os passos que levaram ao problema.

Se forem necessários logs de diagnóstico, exporte-os em **Editar → Preferências → Diagnóstico**. A janela de erro do editor também tem um botão de exportar.
