---
published: 2026-10-10
updated: 2026-10-30
---

# Xprite vs Piskel: uma alternativa grátis ao Piskel que abre arquivos Aseprite

O Xprite é um editor de pixel art grátis e de código aberto no navegador que, diferente do Piskel, abre e salva arquivos `.aseprite` e funciona em celulares e tablets. O Piskel ainda é a opção mais simples para animações curtas no navegador do computador, e é o único dos dois que abre arquivos `.piskel`.

- Você quer editar `.aseprite`, desenhar com caneta ou com os dedos, ou definir uma duração diferente em cada quadro: use o Xprite.
- Você faz loops curtos no computador e quer o mínimo de menus possível: fique com o Piskel.
- Você tem um monte de projetos `.piskel` para continuar editando em outra ferramenta: use o Pixelorama, que abre `.piskel` direto.

[Abra o Xprite no navegador](/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives). Não precisa instalar nada nem criar conta.

## Xprite vs Piskel em um relance

|               | Piskel                                                                    | Xprite                                                        |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Preço         | 🆓 Grátis, com anúncios. Piskel for Kids sem anúncios                     | 🆓 Grátis, sem conta                                          |
| Código-fonte  | ✅ Código aberto, Apache-2.0                                              | ✅ Código aberto, GPL-2.0-only                                |
| Dispositivos  | ⚠️ Navegadores de desktop. Sem suporte a celular ou tablet                | ✅ Navegadores em computadores, tablets e celulares           |
| Caneta e toque| ❌ Não                                                                    | ✅ A caneta desenha; os dedos movem, dão zoom e desfazem      |
| `.piskel`     | ✅ Formato nativo                                                         | ❌ Exporte primeiro um GIF ou uma sprite sheet PNG            |
| `.aseprite`   | ❌ Não                                                                    | ✅ Abrir e salvar                                             |
| Camadas       | ✅ Sim                                                                    | ✅ Sim, mais RGB, tons de cinza e indexado                    |
| Onion skin    | ✅ Sim                                                                    | ✅ Sim                                                        |
| Timing        | ⚠️ Um único FPS para a animação inteira                                   | ✅ Duração por quadro, mais tags para dividir animações       |
| Exportar      | ✅ GIF, sprite sheet PNG, PNG, ZIP de quadros, PixiJS JSON, array em C    | ✅ PNG, GIF, APNG, WebP, sprite sheet PNG com JSON, tilesets  |
| Offline       | ⚠️ Apps para Windows, macOS e Linux, com releases no melhor esforço       | ⚠️ Adicionar à área de trabalho ou início; abrir uma vez online |
| Salvamento    | Arquivo `.piskel`, ou este navegador                                      | Arquivo `.aseprite` ou `.png`, ou este navegador              |

## Onde o Piskel é melhor

- **Abre seus projetos `.piskel`.** O Xprite não consegue lê-los.
- **Menos para aprender.** O Piskel tem menos ferramentas e uma prévia ao vivo cuja velocidade você muda enquanto desenha. Para um ciclo de caminhada ou um ícone animado, muitas vezes basta.
- **Piskel for Kids.** A [edição para crianças](https://www.piskelapp.com/faq) não tem anúncios, não rastreia informação pessoal e não tem recursos sociais — bom para sala de aula. O Xprite envia analytics de uso anônimas (sem obras), descritas no [aviso de privacidade](/privacy/).
- **Apps de desktop para baixar.** O Piskel oferece [apps offline](https://www.piskelapp.com/download) para Windows, macOS e Linux. Eles recebem testes “muito limitados” e não têm calendário de release, então o Piskel recomenda a versão web.
- **Alguns destinos de exportação a mais**: uma sprite sheet PixiJS com JSON, um arquivo C com o quadro como array, e um ZIP de quadros que pode ser dividido por camada.

## Onde o Xprite é melhor

- **Arquivos Aseprite.** O Xprite lê e escreve `.ase` e `.aseprite`, mantendo camadas, quadros e tags. Você pode devolver o arquivo a quem usa Aseprite. Alguns projetos podem não ser totalmente compatíveis, e scripts/extensões do Aseprite não rodam.
- **Celulares e tablets.** O próprio [README](https://github.com/piskelapp/piskel#mobiletablets) do Piskel diz que não há suporte a mobile. No Xprite, depois que você usa uma caneta, a caneta desenha e os dedos movem; belisque para zoom, toque com dois dedos para desfazer e três para refazer. Veja [dedos e caneta](/help/#fingers-and-a-pen).
- **Timing e estrutura.** Cada quadro pode ter a própria duração, e tags dividem um arquivo em várias animações. Há camadas de tilemap e cor indexada quando um projeto de jogo precisa.
- **Mais formatos de exportação.** GIF, APNG e WebP animados, e sprite sheets PNG com JSON opcional.

Antes de migrar: o Xprite é mantido por uma pessoa e ainda está evoluindo, então algumas funções podem ter bugs. Projetos salvos em **Navegador** ficam naquele navegador daquele dispositivo — salve em **Gerenciador de arquivos** o que você quiser guardar.

## Qual você deve escolher?

- **Iniciantes, crianças e GIFs rápidos no computador**: Piskel, ou Piskel for Kids na sala de aula.
- **Quem troca arquivos com usuários de Aseprite**: Xprite.
- **Desenhar no iPad ou no celular**: Xprite. O Piskel não tem suporte a mobile.
- **Sprites de jogo que precisam de duração por quadro, tags ou sprite sheet com JSON**: Xprite.
- **Continuar editando projetos `.piskel` antigos fora do Piskel**: Pixelorama.

## Outras alternativas ao Piskel

- [Pixelorama](https://pixelorama.org/user_manual/Import): grátis e de código aberto, com apps de desktop e versão web. Importa `.piskel`, `.aseprite`, PSD e Krita, então é o caminho mais direto para migrar projetos antigos do Piskel. Projetos são salvos como `.pxo`.
- [Pixilart](https://www.pixilart.com/features): editor e comunidade de arte juntos, na web e em apps mobile. Tem duração por quadro e onion skin. Um plano PRO pago remove anúncios e sincroniza arquivos `.pixil`.

## Leve seu trabalho do Piskel para o Xprite

1. **Guarde o original**: baixe uma cópia `.piskel` do Piskel como backup.
2. **Exporte a animação** do Piskel como GIF, ou como sprite sheet PNG se quiser controlar o corte dos quadros.
3. **Abra o GIF** no Xprite com **Arquivo → Abrir…**. Cada quadro do GIF vira um quadro.
4. **Para uma sprite sheet**, use **Arquivo → Importar sprite sheet** e defina os limites do quadro. Sheets não guardam timing — ajuste as durações na timeline depois.

GIFs e sprite sheets só carregam os pixels mesclados, então as camadas se perdem. Para mantê-las, use a exportação ZIP do Piskel com **Split by layers** e remonte as camadas no Xprite. O GIF fica limitado a 256 cores — use uma sprite sheet PNG quando a cor importar.

Se você só precisa dos quadros para um motor de jogo, a ferramenta [GIF para sprite sheet](/tools/gif-to-sprite-sheet/) transforma um GIF em uma sheet PNG com coordenadas e timing em JSON, sem abrir o editor. “Pixel art” de IA mole ou fora da grade pode ser limpa com [Corrigir pixel art de IA](/tools/fix-ai-pixel-art/) (Recover Grid) antes de continuar editando em um editor grátis no navegador.

## Perguntas frequentes

### Qual é a melhor alternativa grátis ao Piskel?

Depende do que você precisa. Xprite se quiser abrir `.aseprite` ou desenhar no celular/tablet; Pixelorama se precisar abrir `.piskel`. Ambos são grátis e de código aberto.

### O Xprite consegue abrir arquivos `.piskel`?

Não. Exporte um GIF ou uma sprite sheet PNG do Piskel e abra no Xprite.

### O Piskel consegue abrir arquivos `.aseprite`?

Não. O Piskel importa `.piskel` e imagens PNG, JPG, BMP e GIF animado.

### O Piskel funciona no iPad ou no celular?

O README do Piskel diz que não há suporte a mobile. O Xprite roda em navegadores de celular e tablet, com gestos de caneta e toque.

### O Piskel ainda é mantido?

O repositório no GitHub recebeu commits em outubro de 2026. A versão mais recente no GitHub é a v0.15.0 de novembro de 2018, e os apps de desktop só têm releases no melhor esforço.

---

[Abra o Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives) e importe um GIF do Piskel para testar. Tem um `.aseprite` para conferir primeiro? Abra no [visualizador de Aseprite](/tools/viewer/?utm_source=compare&utm_medium=referral&utm_campaign=piskel-alternatives). Para saber mais sobre o Xprite, veja [o que é o Xprite](/about/), ou compare [editores Aseprite online](/compare/aseprite-online/).
