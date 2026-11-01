---
published: 2026-10-10
updated: 2026-10-10
---

# Alternativas ao Piskel: 3 editores de animação em pixel art comparados

O [Piskel](https://www.piskelapp.com/) é um editor de sprites grátis e de código aberto que roda no navegador. Ele é ótimo para pequenas animações em loop e exporta GIFs e sprite sheets sem complicação. Conforme os projetos crescem, a gente costuma querer organizar várias animações, trocar projetos com quem usa o Aseprite, desenhar com caneta no tablet ou compartilhar o trabalho com uma comunidade. Escolha a ferramenta pelo que você precisa:

- Você tem uma pilha de projetos `.piskel` para continuar editando: use o Pixelorama, que abre `.piskel` diretamente.
- Você quer editar `.aseprite` no navegador ou desenhar no iPad com caneta e dedos: use o Xprite.
- Você quer postar enquanto desenha e participar de eventos da comunidade: use o Pixilart.

|                      | Piskel                                         | Xprite                                       | Pixelorama                              | Pixilart                              |
| -------------------- | ---------------------------------------------- | -------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Preço                | 🆓 Grátis, com anúncios                        | 🆓 Grátis                                    | 🆓 Grátis, versão Steam 💰              | 🆓 Grátis, PRO 💰                     |
| Abrir `.piskel`      | ✅ Formato nativo                              | ❌ Converter antes em GIF ou sprite sheet    | ✅ Sim                                  | —                                     |
| Projetos `.aseprite` | ❌ Não                                         | ✅ Abre e salva                              | ✅ Importa; exporta desde a v1.2.2      | —                                     |
| Animação             | ✅ Camadas, pele de cebola                     | ✅ Tags, duração dos quadros, pele de cebola | ✅ Tags, camadas de áudio               | ✅ Duração por quadro, pele de cebola |
| Toque                | —                                              | ✅ A caneta desenha, os dedos navegam        | ⚠️ A versão para Android é experimental | ✅ App para celular                   |
| Offline e desktop    | ⚠️ A versão de desktop recebe pouca manutenção | ⚠️ Abrir uma vez on-line antes               | ✅ App de desktop grátis                | —                                     |

## Quando continuar com o Piskel

Para ciclos curtos de caminhada, ícones animados ou exercícios em sala de aula, o Piskel basta. Ele tem camadas, pele de cebola e uma pré-visualização ao vivo cuja velocidade pode ser mudada a qualquer momento. Exporta GIF, sprite sheets PNG e ZIP.

O Piskel também tem versões offline para Windows, macOS e Linux, mas elas [recebem testes limitados](https://www.piskelapp.com/download) e não têm calendário regular de lançamentos, por isso a versão web é a recomendada. O [Piskel for Kids](https://www.piskelapp.com/faq), voltado a crianças e professores, não tem anúncios nem recursos sociais como a galeria.

## Pixelorama: abre `.piskel` diretamente

O [Pixelorama](https://pixelorama.org/user_manual/Import) importa `.piskel`, além de `.aseprite`, PSD e arquivos do Krita, o que faz dele o caminho mais direto para migrar projetos antigos.

- **Animação**: tags de quadro dividem um projeto em várias animações, e camadas de áudio sincronizam a animação com o som.
- **Plataformas**: os apps de desktop para Windows, macOS e Linux e a versão web são grátis. A [versão Steam](https://pixelorama.org/user_manual/installation) é paga, tem os mesmos recursos e acrescenta extras da Steam, como atualizações automáticas. A versão para Android ainda é experimental.
- **Arquivos**: os projetos são salvos como `.pxo`. Desde a [v1.2.2](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2), também exporta `.aseprite`.

## Xprite: edite projetos do Aseprite no navegador

O Xprite lê e grava `.aseprite` no formato original, mantendo camadas, tags e duração dos quadros, então funciona bem para trocar arquivos com quem usa o Aseprite.

- **Toque**: assim que você usa uma caneta, a caneta desenha e os dedos movem a tela. Toque com dois dedos para desfazer e com três para refazer. Os gestos podem ser alterados em **Editar → Preferências → Toque**.
- **Salvamento**: **Arquivo → Salvar como** salva em **Navegador** ou **Arquivos locais**. Um projeto salvo no navegador só abre no mesmo navegador, no mesmo dispositivo, então salve em **Arquivos locais** os arquivos que você quer levar para outro lugar.
- **Offline**: abra o editor uma vez com internet e, depois disso, ele funciona offline.

O Xprite não abre `.piskel` diretamente; veja abaixo como migrar seu trabalho.

## Pixilart: publique seu trabalho assim que terminar

O [Pixilart](https://www.pixilart.com/features) junta um editor e uma comunidade de arte no mesmo lugar, e dá para desenhar na web ou no app para celular. As animações podem ter uma duração diferente para cada quadro, e há pele de cebola. A tela pode ter até 700 pixels de lado.

A versão grátis é totalmente usável. O [PRO](https://www.pixilart.com/subscribe) custa US$ 4,99 por mês, remove os anúncios e sincroniza arquivos `.pixil` editáveis entre computador e celular.

## Leve seu trabalho do Piskel para o Xprite

O Xprite não lê `.piskel`, então exporte primeiro seu trabalho do Piskel como imagens:

1. **Guarde o original**: baixe uma cópia `.piskel` do Piskel como backup.
2. **Exporte a animação**: exporte um GIF. Se quiser controlar como os quadros são cortados, exporte uma sprite sheet PNG.
3. **Abra o GIF**: no Xprite, abra o GIF com **Arquivo → Abrir...**. Todos os quadros e suas durações são importados.
4. **Importe uma sprite sheet**: para uma sprite sheet PNG, use **Arquivo → Importar sprite sheet** e marque na tela as bordas de um quadro para dividi-la. Sprite sheets não guardam a duração dos quadros, então defina de novo na linha do tempo depois de importar.

GIFs e sprite sheets só carregam os pixels mesclados, então as camadas do Piskel e seus nomes se perdem. Se você precisa das camadas, exporte cada camada separadamente no Piskel e monte de novo no Xprite. O GIF é limitado a 256 cores e deixa pixels semitransparentes opacos, então use uma sprite sheet PNG quando as cores importarem.

## Perguntas frequentes

### O Piskel abre arquivos `.aseprite`?

Não. O Piskel só importa `.piskel`, GIF e PNG.

### Qual ferramenta é mais parecida com o Piskel?

O Pixelorama. Ele também é grátis e de código aberto, e abre `.piskel` diretamente.

---

Para testar no navegador, [abra o Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives) e importe um GIF. Se você trabalha com projetos do Aseprite, veja [Aseprite online](/pt-BR/compare/aseprite-online/).
