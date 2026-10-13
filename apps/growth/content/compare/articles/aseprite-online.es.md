---
published: 2026-10-10
updated: 2026-10-10
---

# Aseprite online: 4 editores de pixel art en el navegador comparados

Aseprite es un programa de escritorio. Las descargas [oficiales](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite) son para Windows, macOS y Ubuntu, así que abrir un proyecto `.aseprite` en el navegador implica usar otra herramienta que lea ese formato. Xprite, Novaboard, Manabit y Pixelorama pueden importar `.aseprite`. Se diferencian en cuánto del proyecto se conserva al importarlo, si puedes guardar de nuevo en `.aseprite` y si necesitas iniciar sesión:

- Para ver un archivo o exportar un PNG o un GIF: usa el [visor de Xprite](/tools/viewer/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online).
- Para editar el archivo y devolvérselo a alguien que usa Aseprite: usa Xprite o Pixelorama. Ambos guardan `.aseprite`.
- Para dibujar animaciones nuevas en el navegador para GIF, videos o juegos: también vale la pena probar Novaboard y Manabit.

|                           | Xprite                               | Novaboard                            | Manabit                                          | Pixelorama                            |
| ------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------ | ------------------------------------- |
| Precio                    | 🆓 Gratis                            | 🆓 Gratis                            | 🆓 Plan gratuito con límites                     | 🆓 Gratis                             |
| Cuenta                    | ✅ No hace falta                     | ✅ No hace falta                     | ⚠️ Inicio de sesión para guardar                 | —                                     |
| Importar `.aseprite`      | ✅ Abre el formato original          | ✅ Sí                                | ⚠️ Se convierte en animación de capas            | ⚠️ Sin slices ni máscaras             |
| Guardar `.aseprite`       | ✅ Sí                                | —                                    | —                                                | ✅ Desde la v1.2.2                    |
| Otras exportaciones       | ✅ PNG, GIF, APNG, hoja de sprites   | ✅ GIF, MP4, hoja de sprites         | ✅ PNG, JPG, GIF, tira de animación              | ✅ PNG, GIF, APNG, hoja de sprites    |
| Animación                 | ✅ Cuadros, etiquetas, papel cebolla | ✅ Cuadros, etiquetas, papel cebolla | ✅ Animación de capas, reproducción sincronizada | ✅ Cuadros, etiquetas, capas de audio |
| Mapas de tiles            | ✅ Editables                         | ⚠️ Modo de mosaico continuo          | ✅ Editor de mapas                               | ✅ Capas de mapa de tiles             |
| Sin conexión y escritorio | ⚠️ Abrir una vez con conexión antes  | ✅ Funciona sin conexión             | 💰 App para Windows con licencia                 | ✅ App de escritorio gratis           |

## Revisa primero el archivo en el visor

Cuando alguien te envía un archivo `.aseprite`, muchas veces solo necesitas ver qué contiene o sacar un cuadro para reenviarlo. El visor de Xprite basta para eso:

1. Abre el [visor](/tools/viewer/) y elige **Archivo → Abrir archivo…**, o arrastra un archivo `.ase` o `.aseprite`.
2. Reproduce la animación. En **Rango de animación**, elige una etiqueta o **Todos los cuadros**.
3. Elige **Archivo → Exportar animación (.gif)** para obtener un GIF, o **Exportar cuadro actual (.png)** para un solo PNG.

![El menú Archivo del visor, con Editar en Xprite, Exportar animación (.gif) y Exportar cuadro actual (.png)](images/viewer-file-menu-en.png)

Ocultar capas en el visor solo afecta a la vista previa y a la exportación; el archivo no cambia. Para hacer cambios, elige **Editar en Xprite**, que abre el archivo original en el editor.

## Edita en el navegador y guarda de nuevo en `.aseprite`

El editor de Xprite lee `.ase` y `.aseprite` en su formato original. Se conservan las capas, los grupos de capas, los mapas de tiles, las etiquetas y la duración de los cuadros en milisegundos. Cuando termines, elige **Archivo → Guardar como → Gestor de archivos** para guardar el archivo `.aseprite` en tu dispositivo y luego ábrelo en Aseprite para seguir trabajando.

![Xprite con example.aseprite abierto: capas y cuadros en la línea de tiempo de abajo, con el papel cebolla activado](images/editor-with-aseprite-en.png)

Xprite no puede abrir estos archivos, y el proyecto que tienes abierto no cambia:

- Profundidad de color distinta de 8, 16 o 32 bits
- Un lado del lienzo de más de 32.768 píxeles
- Más de 4096 cuadros o 256 capas

La otra ubicación de **Guardar como** es **Navegador**. Un proyecto guardado ahí solo se abre en el mismo navegador y en el mismo dispositivo, y se elimina al borrar los datos del sitio. Para un archivo que vas a pasarle a otra persona, **Gestor de archivos** es la opción más segura.

![El diálogo Guardar como, con Navegador y Gestor de archivos uno al lado del otro en Destino de guardado](images/save-as-browser-or-files-en.png)

Pixelorama también puede exportar `.aseprite` desde la [v1.2.2](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2) (9 de septiembre de 2026). Su [importación](https://pixelorama.org/user_manual/Import) omite slices, datos de usuario de los cels, perfiles de color, archivos externos y máscaras, y convierte los proyectos en escala de grises a RGBA. Lo que no se lee al importar no vuelve al exportar.

## En qué destacan Novaboard, Manabit y Pixelorama

Estos tres se inclinan más por dibujar desde cero en el navegador, y cada uno tiene funciones que Xprite no tiene:

- [Novaboard](https://marcel0ll.itch.io/novaboard): sin instalación ni registro. Además de `.aseprite`, abre archivos PSD, ORA, GAL, PIXIL y GIF animados. Exporta MP4 y atlas JSON, y las capas admiten ajustes no destructivos como tono, curvas y contraste.
- [Manabit](https://manabit.app/docs/features/import-export/): un proyecto puede reunir personajes, tilesets, mapas e interfaz, y el Map Builder pinta niveles directamente desde un tileset. Puede exportar animaciones como una tira PNG con una animación por fila, escalada de 1× a 8×. El plan gratuito, una vez que inicias sesión, incluye 1 proyecto local y 1 proyecto en la nube con 25 MB de almacenamiento. Una licencia de pago único quita el límite de proyectos locales y añade la app de escritorio para Windows.
- [Pixelorama](https://pixelorama.org/user_manual/installation): gratuito y de código abierto, con apps de escritorio para Windows, macOS y Linux y una versión web; la versión para Android es experimental. La línea de tiempo admite capas de audio, y los mapas de tiles pueden ser rectangulares, isométricos o hexagonales.

## Cuándo sigues necesitando Aseprite de escritorio

Si tu flujo de trabajo depende de [extensiones, scripts o exportación por línea de comandos](https://www.aseprite.org/docs/) de Aseprite, quédate con la app de escritorio. Las herramientas de navegador son mejores para revisar archivos, hacer arreglos rápidos y entregar imágenes terminadas.

## Preguntas frecuentes

### ¿Hay una versión web oficial de Aseprite?

No. Aseprite solo está disponible para Windows, macOS y Ubuntu.

### ¿Hay diferencia entre `.ase` y `.aseprite`?

No, son el mismo formato. Xprite abre ambas extensiones.

### ¿Se suben los archivos que abro en el navegador?

El visor de Xprite procesa los archivos en tu dispositivo y no los sube. Los proyectos que el editor guarda en **Navegador** también se quedan en el dispositivo actual.

---

Para empezar, [abre un archivo en el visor](/tools/viewer/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online) o [edítalo en Xprite](/?utm_source=compare&utm_medium=referral&utm_campaign=aseprite-online). Si solo necesitas una imagen animada, consulta [Aseprite a GIF](/tools/viewer/#export-gif). Para editar en iPad, consulta [Aseprite en iPad](/es/compare/aseprite-on-ipad/).
