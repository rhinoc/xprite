---
published: 2026-10-10
updated: 2026-10-10
---

# Aseprite online: 4 editores de pixel art no navegador comparados

O Aseprite é um programa de computador. Os downloads [oficiais](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite) são para Windows, macOS e Ubuntu, então abrir um projeto `.aseprite` no navegador significa usar outra ferramenta que leia esse formato. Xprite, Novaboard, Manabit e Pixelorama importam `.aseprite`. A diferença está em quanto do projeto sobrevive à importação, se dá para salvar de volta em `.aseprite` e se é preciso fazer login:

- Para ver um arquivo ou exportar um PNG ou GIF dele: use o [visualizador do Xprite](/tools/viewer/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online).
- Para editar o arquivo e devolvê-lo para alguém que usa o Aseprite: use o Xprite ou o Pixelorama. Os dois salvam `.aseprite`.
- Para desenhar animações novas no navegador para GIFs, vídeos ou jogos: vale conhecer também o Novaboard e o Manabit.

|                      | Xprite                           | Novaboard                        | Manabit                                         | Pixelorama                         |
| -------------------- | -------------------------------- | -------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Preço                | 🆓 Grátis                        | 🆓 Grátis                        | 🆓 Plano grátis com limites                     | 🆓 Grátis                          |
| Conta                | ✅ Não precisa                   | ✅ Não precisa                   | ⚠️ Login para salvar                            | —                                  |
| Importar `.aseprite` | ✅ Abre o formato original       | ✅ Sim                           | ⚠️ Convertido em animação de camadas            | ⚠️ Sem fatias e máscaras           |
| Salvar `.aseprite`   | ✅ Sim                           | —                                | —                                               | ✅ Desde a v1.2.2                  |
| Outras exportações   | ✅ PNG, GIF, APNG, sprite sheet  | ✅ GIF, MP4, sprite sheet        | ✅ PNG, JPG, GIF, tira de animação              | ✅ PNG, GIF, APNG, sprite sheet    |
| Animação             | ✅ Quadros, tags, pele de cebola | ✅ Quadros, tags, pele de cebola | ✅ Animação de camadas, reprodução sincronizada | ✅ Quadros, tags, camadas de áudio |
| Tilemaps             | ✅ Editáveis                     | ⚠️ Modo de repetição contínua    | ✅ Editor de mapas                              | ✅ Camadas de tilemap              |
| Offline e desktop    | ⚠️ Abrir uma vez on-line antes   | ✅ Funciona offline              | 💰 App para Windows com licença                 | ✅ App de desktop grátis           |

## Confira o arquivo no visualizador primeiro

Quando alguém manda um arquivo `.aseprite`, muitas vezes você só precisa ver o que tem nele ou pegar um quadro para repassar. O visualizador do Xprite dá conta disso:

1. Abra o [visualizador](/tools/viewer/) e escolha **Arquivo → Abrir arquivo…**, ou arraste um arquivo `.ase` ou `.aseprite`.
2. Reproduza a animação. Em **Intervalo da animação**, escolha uma tag ou **Todos os quadros**.
3. Escolha **Arquivo → Exportar animação (.gif)** para um GIF, ou **Exportar quadro atual (.png)** para um único PNG.

![O menu Arquivo do visualizador, com Editar no Xprite, Exportar animação (.gif) e Exportar quadro atual (.png)](images/viewer-file-menu-en.png)

Ocultar camadas no visualizador só afeta a pré-visualização e a exportação; o arquivo não muda. Para fazer alterações, escolha **Editar no Xprite**, que abre o arquivo original no editor.

## Edite no navegador e salve de volta em `.aseprite`

O editor do Xprite lê `.ase` e `.aseprite` no formato original. Camadas, grupos de camadas, tilemaps, tags e durações de quadro em milissegundos são mantidos. Quando terminar, escolha **Arquivo → Salvar como → Arquivos locais** para salvar o arquivo `.aseprite` no seu dispositivo e depois abra no Aseprite para continuar.

![Xprite com example.aseprite aberto: camadas e quadros na linha do tempo embaixo, com o pele de cebola ativado](images/editor-with-aseprite-en.png)

O Xprite não abre estes arquivos, e o projeto que está aberto não é alterado:

- Profundidade de cor diferente de 8, 16 ou 32 bits
- Lado da tela maior que 32.768 pixels
- Mais de 4.096 quadros ou 256 camadas

O outro local em **Salvar como** é **Navegador**. Um projeto salvo ali só abre no mesmo navegador, no mesmo dispositivo, e é apagado quando você limpa os dados do site. Para um arquivo que você vai passar para outra pessoa, **Arquivos locais** é a opção mais segura.

![A janela Salvar como, com Navegador e Arquivos locais lado a lado em Destino do salvamento](images/save-as-browser-or-files-en.png)

O Pixelorama também exporta `.aseprite` desde a [v1.2.2](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2) (9 de setembro de 2026). A [importação](https://pixelorama.org/user_manual/Import) dele deixa de fora fatias, dados de usuário dos cels, perfis de cor, arquivos externos e máscaras, e converte projetos em escala de cinza para RGBA. O que não é lido na importação não volta na exportação.

## No que o Novaboard, o Manabit e o Pixelorama se saem melhor

Esses três são mais voltados a desenhar do zero no navegador, e cada um tem recursos que o Xprite não tem:

- [Novaboard](https://marcel0ll.itch.io/novaboard): sem instalação e sem cadastro. Além de `.aseprite`, abre arquivos PSD, ORA, GAL, PIXIL e GIF animado. Exporta MP4 e atlas JSON, e as camadas aceitam ajustes não destrutivos como matiz, curvas e contraste.
- [Manabit](https://manabit.app/docs/features/import-export/): um projeto pode reunir personagens, tilesets, mapas e interface, e o Map Builder pinta fases direto a partir de um tileset. Exporta animações como uma tira PNG com uma animação por linha, em escalas de 1× a 8×. O plano grátis, depois do login, inclui 1 projeto local e 1 projeto na nuvem com 25 MB de armazenamento. Uma licença única remove o limite de projetos locais e adiciona o app de desktop para Windows.
- [Pixelorama](https://pixelorama.org/user_manual/installation): grátis e de código aberto, com apps de desktop para Windows, macOS e Linux e uma versão web; a versão para Android é experimental. A linha do tempo aceita camadas de áudio, e os tilemaps podem ser retangulares, isométricos ou hexagonais.

## Quando você ainda precisa do Aseprite no computador

Se o seu fluxo depende de [extensões, scripts ou exportação por linha de comando](https://www.aseprite.org/docs/) do Aseprite, continue com o app de desktop. Ferramentas no navegador são melhores para conferir arquivos, fazer ajustes rápidos e entregar imagens prontas.

## Perguntas frequentes

### Existe uma versão web oficial do Aseprite?

Não. O Aseprite só está disponível para Windows, macOS e Ubuntu.

### Existe diferença entre `.ase` e `.aseprite`?

Não, é o mesmo formato. O Xprite abre as duas extensões.

### Os arquivos que abro no navegador são enviados para algum lugar?

O visualizador do Xprite processa os arquivos no seu dispositivo e não os envia. Projetos que o editor salva em **Navegador** também ficam no dispositivo atual.

---

Para começar, [abra um arquivo no visualizador](/tools/viewer/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online) ou [edite no Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online). Se você só precisa de uma imagem animada, veja [Aseprite para GIF](/tools/viewer/#export-gif). Para editar no iPad, veja [Aseprite no iPad](/pt-BR/compare/aseprite-on-ipad/).
