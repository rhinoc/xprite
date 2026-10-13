# Guía de uso

- [Guardar y recuperar](#guardar-y-recuperar)
- [Abrir y exportar archivos](#abrir-y-exportar-archivos)
- [Organizar el espacio de trabajo](#organizar-el-espacio-de-trabajo)
- [Mostrar y ocultar controles](#mostrar-y-ocultar-controles)
- [Mouse, trackpad y atajos](#mouse-trackpad-y-atajos)
- [Dedos y lápiz](#dedos-y-lápiz)
- [Barra de accesos rápidos](#barra-de-accesos-rápidos)
- [Pegar una imagen externa](#pegar-una-imagen-externa)
- [Tomar un color de la pantalla](#tomar-un-color-de-la-pantalla)
- [Añadir al escritorio y usar sin conexión](#añadir-al-escritorio-y-usar-sin-conexión)
- [Exportar diseños de Animal Crossing](#exportar-diseños-de-animal-crossing)
- [Compartir un sprite](#compartir-un-sprite)
- [Repetición del dibujo](#repetición-del-dibujo)
- [Navegadores y dispositivos](#navegadores-y-dispositivos)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Informar de un problema](#informar-de-un-problema)

## Guardar y recuperar

**Archivo → Guardar como** ofrece dos ubicaciones:

- **Navegador**: el proyecto se guarda solo en este navegador y en este dispositivo, y no se sincroniza. Para volver a abrirlo, usa **Archivos recientes** en Inicio.
- **Gestor de archivos**: el proyecto se guarda en tu dispositivo como archivo `.aseprite` o `.png`. Para volver a abrirlo, usa **Archivo → Abrir...**. Si el navegador no tiene diálogo de guardado, el archivo se descarga.

![Opciones de ubicación en Guardar como.](images/en/save-as.webp)

Borrar los datos del sitio elimina tanto los proyectos del navegador como las copias de recuperación. Antes de cambiar de dispositivo o de navegador, o de borrar los datos, guarda una copia en **Gestor de archivos**.

Si la página muestra "Los cambios no están guardados en este navegador.", deja el proyecto abierto y elige **Reintentar guardar**, o usa **Guardar como → Gestor de archivos** para guardar una copia en archivo.

De forma predeterminada, Xprite guarda datos de recuperación cada 2 minutos y conserva los sprites editados durante 7 días. Puedes cambiar ambos valores en **Editar → Preferencias → Archivos**. Si el navegador se cierra inesperadamente, elige **Recuperar archivos...** en Inicio y restaura tu trabajo desde **Sesiones anteriores**.

Para eliminar una copia del navegador, primero cierra el proyecto, abre su menú en **Archivos recientes** y elige **Eliminar copia del navegador**. Se eliminan el proyecto del navegador, su imagen en caché y sus copias de recuperación. Los archivos que guardaste en tu dispositivo no se ven afectados.

## Abrir y exportar archivos

**Archivo → Abrir...** abre:

- Proyectos de Aseprite (`.ase`, `.aseprite`), con sus capas, cuadros y etiquetas.
- Imágenes como PNG y JPEG, en cualquier formato que tu navegador pueda decodificar.
- GIF y WebP animados, con cada cuadro importado como un cuadro.

Para abrir una hoja de sprites, usa **Archivo → Importar hoja de sprites** y define los límites de los cuadros para que Xprite encuentre cada uno.

Los proyectos de Aseprite pueden medir hasta 32.768 píxeles de ancho y de alto, con hasta 4096 cuadros y 256 capas. Xprite todavía no implementa todas las funciones de Aseprite y no puede ejecutar scripts ni extensiones de Aseprite, así que algunos proyectos pueden no abrirse exactamente igual que en Aseprite.

Cuando abres una foto, o una imagen que quizá no sea pixel art, aparece el diálogo **Pixelar imagen**:

- Define el ancho y el alto (1–16.384) y el número de colores (2–256), y elige **Pixelar e importar**.
- Elige **Mantener original** para importar la imagen tal cual.

Todas las opciones de exportación están en **Archivo → Exportar**:

- **Exportar como...**: imágenes sueltas en PNG, JPEG o WebP; animaciones en GIF, APNG o WebP.
- **Exportar hoja de sprites**: PNG, opcionalmente con **Datos JSON**.
- **Exportar tileset**: PNG, disponible cuando la capa actual es una capa de mapa de tiles.

Algunos navegadores no pueden exportar JPEG o WebP y muestran "JPEG no disponible en este navegador" o "WebP no disponible en este navegador". En ese caso, exporta en PNG.

Si ves "No se pudo abrir el archivo.", revisa en este orden:

- El archivo es un proyecto de Aseprite o una imagen en un formato que admite tu navegador.
- El archivo está completo y no se dañó al descargarlo o copiarlo.
- El proyecto de Aseprite está dentro de los límites de tamaño, cuadros y capas indicados arriba.

## Organizar el espacio de trabajo

Usa **Diseño del espacio de trabajo**, junto a las pestañas de documentos, para organizar los paneles.

![Botón de diseño del espacio de trabajo.](images/shared/layout-button.webp)

- Arrastra las asas o pestañas de los paneles y sigue las guías para acoplarlos, ponerlos uno al lado del otro o combinarlos en pestañas.
- Abre el menú del asa o la pestaña de un panel para dejarlo flotante o elegir **Contraer en un botón**.

**Auto** elige un diseño según el espacio disponible en la ventana.

Usa **Guardar actual...** para guardar una distribución. Los cambios en un diseño guardado seleccionado lo actualizan; para conservar la distribución anterior, guarda antes una copia nueva.

![Lista de diseños del espacio de trabajo.](images/en/layout-menu.webp)

## Mostrar y ocultar controles

Las opciones de la barra de menús y de las barras de herramientas están en **Ver → Mostrar**.

![Menú Ver → Mostrar.](images/en/view-show.webp)

Si ocultas la barra de menús, usa **Menú**, a la izquierda de las pestañas de documentos, para volver a **Ver → Mostrar**. Si ocultas la barra de opciones de herramienta, haz clic en la herramienta seleccionada para abrir sus ajustes.

Desliza a lo largo de la barra de herramientas para llegar a las que no caben. Una barra horizontal también se desplaza con la rueda del mouse o el trackpad.

## Mouse, trackpad y atajos

De forma predeterminada, la rueda del mouse hace zoom en el lienzo, deslizar dos dedos en el trackpad lo desplaza y pellizcar hace zoom.

Si el dispositivo no se detecta bien, elige **Rueda del mouse** o **Trackpad** en **Editar → Preferencias → Editor → Dispositivo de rueda**. Los ajustes de zoom con la rueda y con dos dedos están en la misma sección.

Si tu navegador o tu sistema ya usa un atajo, usa el menú o la barra de accesos rápidos, o cambia la combinación en **Editar → Atajos de teclado**.

## Dedos y lápiz

Gestos predeterminados:

- **Arrastrar con dos dedos** desplaza el lienzo.
- **Pellizcar con dos dedos** hace zoom. Al soltar, el zoom se ajusta a un nivel fijo.
- **Tocar con dos dedos** deshace.
- **Tocar con tres dedos** rehace.
- **Mantener dos o tres dedos quietos** repite deshacer o rehacer.
- **Mantener pulsado con un dedo** toma un color.

Los dedos dibujan hasta que usas un lápiz. A partir de ahí, los dedos desplazan el lienzo y el lápiz dibuja.

Para que los dedos siempre dibujen o siempre desplacen, elige un modo en **Editar → Preferencias → Táctil → Acción con un dedo**. Esta sección también controla el zoom con pellizco, los gestos de deshacer y rehacer, la selección de color y los tiempos de pulsación.

![Preferencias táctiles.](images/en/touch-settings.webp)

## Barra de accesos rápidos

Actívala en **Ver → Mostrar → Barra de accesos rápidos**. Los botones de dirección mueven la selección de píxel en píxel; **Mantener proporción**, **Desde el centro** y **Duplicar al arrastrar** sustituyen a las teclas modificadoras correspondientes.

![Los cuatro botones para mover una selección.](images/shared/selection-arrows.webp)

![De izquierda a derecha: Mantener proporción, Duplicar al arrastrar y Desde el centro.](images/shared/selection-modifiers.webp)

Con Selección rectangular, Selección elíptica o Lazo en modo **Reemplazar** o **Intersección**, toca fuera de la selección para quitarla. También funciona cuando los dedos están configurados para desplazar; arrastrar sigue desplazando el lienzo.

## Pegar una imagen externa

Pegar imágenes desde otra app puede requerir permiso del navegador para usar el portapapeles.

Si no puedes pegar, abre la imagen como archivo y luego cópiala al proyecto de destino dentro de Xprite.

## Tomar un color de la pantalla

Mantén pulsado **Alt** (**Option** en Mac) y haz clic en el botón del color de primer plano o de fondo para tomar un color fuera del editor.

![Botones de color de primer plano y de fondo.](images/shared/color-buttons.webp)

Tomar colores de la pantalla requiere Chrome o Edge de escritorio, con Xprite abierto por HTTPS o en localhost. Si tu navegador no lo admite, abre la imagen en Xprite y toma los colores desde ahí.

## Añadir al escritorio y usar sin conexión

- **Chrome o Edge**: elige **Ayuda → Agregar al escritorio**. Si no aparece, usa **Instalar app** en el menú del navegador.
- **Safari en Mac**: elige **Archivo → Agregar al Dock…**.
- **Safari en iPhone o iPad**: toca **Compartir** y luego **Agregar a pantalla de inicio**. **Compartir** puede estar dentro del menú de la página.

![Botón de instalar en la barra de direcciones de Chrome.](images/en/chrome-install-button.webp)

Abre el editor una vez con conexión antes de usarlo sin conexión. Si no se abre sin conexión, conéctate y vuelve a abrirlo.

## Exportar diseños de Animal Crossing

En **Archivo → Exportar…**, elige **Formato de exportación → Juegos y manualidades → Animal Crossing**. Haz clic en una celda de la imagen de origen para seleccionar su código QR. Pasa el cursor por el borde derecho, el borde inferior o la esquina inferior derecha de la celda seleccionada y arrastra para cambiar el tamaño. Arrastra el origen de la cuadrícula para moverla; las asas de espaciado aparecen arriba o a la izquierda. Las asas aparecen al pasar el cursor; en pantallas táctiles, toca un borde para mostrar su asa y arrástrala. También puedes escribir los valores a la izquierda.

## Compartir un sprite

Elige **Archivo → Compartir...** y luego **Copiar enlace** para enviar el enlace, o **Guardar código QR**. La otra persona abre el enlace o escanea el código para ver tu sprite. El sprite se comprime en la parte del enlace que va después de `#share=`. El enlace se crea en tu dispositivo y no se sube nada a ningún servidor.

- Cualquiera con el enlace completo puede abrir el sprite. Los enlaces no caducan ni se pueden revocar.
- Los enlaces de más de 1800 caracteres muestran un aviso de que algunas apps de mensajería pueden cortarlos. No se pueden crear enlaces de más de 8192 caracteres.
- Si el sprite es demasiado grande, comparte solo el cuadro actual o las capas visibles, o exporta un archivo y envíalo.
- Cuando el enlace es demasiado largo para un código QR, solo puedes copiar el enlace.

## Repetición del dibujo

Elige **Sprite → Proceso de dibujo → Iniciar grabación** para empezar a grabar. Cuando termines, elige **Detener grabación** para abrir la repetición, o **Continuar grabación** para añadir más.

Abre **Repetición del dibujo…** para ver una grabación:

- **Exportar…** la guarda como archivo `.xprite-replay`, que puedes reproducir más tarde con **Abrir repetición…**.
- El desplegable del botón de exportar incluye **Exportar GIF del lienzo…** para obtener un GIF animado.

Las repeticiones se guardan con los proyectos del navegador, pero los archivos PNG y Aseprite no las incluyen. Exporta un archivo `.xprite-replay` aparte antes de cambiar de navegador o de dispositivo.

## Navegadores y dispositivos

Leer y escribir archivos, el portapapeles y tomar colores de la pantalla dependen de lo que tu navegador admita y permita. Xprite no tiene una versión mínima de navegador. En su lugar, abre **Editar → Preferencias → Diagnóstico** y revisa la **Comprobación de compatibilidad del navegador**. Una marca indica que la función es compatible.

![La página Diagnóstico de Preferencias: la comprobación de compatibilidad del navegador muestra 8 elementos, entre ellos File System Access, OPFS, IndexedDB y Web Workers, todos marcados.](images/en/browser-compatibility-check.webp)

Qué pasa cuando falla una comprobación:

- ⚠️ File System Access · Open: se usa el selector de archivos del propio navegador.
- ⚠️ File System Access · Save: **Gestor de archivos** descarga el archivo.
- ⚠️ OPFS project storage: los proyectos del navegador se guardan en IndexedDB.
- ❌ IndexedDB: no se pueden guardar los archivos recientes.
- ❌ Web Workers: no están disponibles los enlaces para compartir ni la exportación WebP sin pérdida.
- ⚠️ CompressionStream: los archivos `.aseprite` se guardan sin comprimir y ocupan más.

Mensajes habituales:

- "Compartir no está disponible en este navegador.": el navegador no admite Web Workers. Exporta un archivo y envíalo.
- "IndexedDB no está disponible; los archivos recientes no se conservarán en este navegador.": el navegador desactivó o limitó el almacenamiento del sitio. Guarda en **Gestor de archivos**.
- "Otra pestaña del navegador bloquea el almacenamiento de archivos recientes.": Xprite está abierto en más de una pestaña. Cierra las demás y vuelve a intentarlo.
- "El lienzo de Aseprite supera el límite de recursos del navegador": el lienzo del proyecto de Aseprite es demasiado grande para el navegador.

Los lienzos grandes y los proyectos con más cuadros y capas usan más memoria. Los teléfonos y las tabletas tienen menos memoria que las computadoras, así que en ellos es más probable que los proyectos grandes no se abran o vayan lentos.

## Preguntas frecuentes

### ¿Xprite es gratis?

Sí. Xprite es gratuito y de código abierto. El código del editor tiene licencia GPL-2.0-only, y los paquetes de interfaz reutilizables, licencia MIT.

### ¿Necesito una cuenta?

No. Abre la página y empieza a dibujar. No hay cuentas y tu trabajo no se sincroniza con ninguna.

### ¿Mi trabajo se sube a un servidor?

No. Editar, guardar y compartir ocurre en tu navegador, y Xprite no tiene ningún servidor que almacene arte. Por la red solo se envían la analítica de páginas y los comentarios que tú mandes, y ninguno incluye tu arte. Consulta el [aviso de privacidad](/privacy/) y [cómo funciona Xprite](/about/how-it-works/).

### ¿Qué relación tiene Xprite con Aseprite?

Xprite sigue la interfaz y la forma de trabajar de Aseprite, pero es un proyecto independiente. No está afiliado a Aseprite ni a Igara Studio S.A., ni cuenta con su respaldo.

### ¿Cómo cambio el idioma de la interfaz?

De forma predeterminada, la interfaz sigue el idioma del navegador. Para cambiarlo, ve a **Editar → Preferencias → General → Idioma**.

### Mi trabajo desapareció. ¿Qué hago?

Primero busca en **Archivos recientes** en Inicio. Si no está ahí, elige **Recuperar archivos...** y busca en **Sesiones anteriores**. Consulta [Guardar y recuperar](#guardar-y-recuperar).

## Informar de un problema

Elige **Ayuda → Problemas y sugerencias**, o **Comentarios** a la derecha de Inicio. También puedes abrir una issue en [GitHub Issues](https://github.com/rhinoc/xprite/issues). Indica tu navegador, tu dispositivo y los pasos que llevaron al problema.

Si hacen falta registros de diagnóstico, expórtalos desde **Editar → Preferencias → Diagnóstico**. El diálogo de error del editor también tiene un botón para exportar.
