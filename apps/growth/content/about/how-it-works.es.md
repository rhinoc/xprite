# Cómo funciona Xprite

Xprite lleva el editor de Aseprite al navegador: no hay nada que instalar, no hace falta crear una cuenta y no hay ningún servidor que almacene tu arte. Este artículo explica, desde el lado de la ingeniería, cómo leemos y escribimos `.aseprite` en el navegador, cómo dibujamos píxeles nítidos con Canvas, dónde se guarda tu trabajo, cómo se abre el editor sin conexión y cómo una interfaz de escritorio pensada para el mouse se adapta a dedos, lápices y pantallas de teléfono.

## Panorama general

Todo el trabajo del editor ocurre en el navegador. Las tareas pesadas se ejecutan en Web Workers, el almacenamiento usa IndexedDB y OPFS del propio navegador, y la red solo se usa para cargar la página, enviar analítica anónima y mandar comentarios.

```article-diagram
{
  "kind": "map",
  "label": "Las partes de Xprite en el navegador",
  "root": "Xprite en el navegador",
  "branches": [
    {
      "label": "Leer y escribir archivos",
      "featured": true,
      "items": [
        { "label": "Analizar .aseprite", "detail": "Se decodifica en un Worker, con el hilo principal como alternativa" },
        { "label": "Exportar imágenes", "detail": "Se codifican con OffscreenCanvas o canvas" }
      ]
    },
    {
      "label": "Mostrar el lienzo",
      "items": [
        { "label": "Componer capas", "detail": "Solo Canvas 2D, sin WebGL" },
        { "label": "Ampliar píxeles", "detail": "Las escalas enteras dibujan directo; las fraccionarias muestrean con tablas" }
      ]
    },
    {
      "label": "Guardar el trabajo",
      "items": [
        { "label": "Escribir archivos en el dispositivo", "detail": "File System Access API, o una descarga si no está disponible" },
        { "label": "Guardar en el navegador", "detail": "Catálogo en IndexedDB + datos en OPFS" }
      ]
    },
    {
      "label": "Gestionar la entrada",
      "items": [
        { "label": "Distinguir lápiz y dedos", "detail": "El lápiz tiene prioridad; los dedos pasan a desplazar" },
        { "label": "Reconocer gestos", "detail": "Pellizcar para hacer zoom; toques con dos y tres dedos deshacen y rehacen" }
      ]
    }
  ]
}
```

## Leer y escribir .aseprite en el navegador

### El formato de archivo

`.aseprite` es un formato binario little-endian: una cabecera de 128 bytes seguida de cuadros, cada uno formado por varios chunks. El número mágico de la cabecera es `0xA5E0`, y el de cada cuadro, `0xF1FA`. Nuestro decodificador maneja estos chunks:

| Tipo de chunk | Contenido                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `0x2004`      | Capa: capa normal, grupo, capa de mapa de tiles                                                  |
| `0x2005`      | Cel: píxeles sin procesar, cel vinculado, píxeles comprimidos con zlib, mapa de tiles comprimido |
| `0x2006`      | Datos extra del cel (posición y tamaño precisos)                                                 |
| `0x2007`      | Perfil de color                                                                                  |
| `0x2008`      | Referencias a archivos externos                                                                  |
| `0x2018`      | Etiquetas (rangos de animación)                                                                  |
| `0x2019`      | Paleta                                                                                           |
| `0x2020`      | Datos de usuario (texto, color, propiedades)                                                     |
| `0x2022`      | Slice                                                                                            |
| `0x2023`      | Tileset                                                                                          |

También se leen los chunks de paleta antiguos `0x0004` y `0x000B`, y se reconocen los chunks obsoletos de máscara (`0x2016`) y trazado (`0x2017`).

### Primero comprobar, luego decodificar

Un archivo abierto en el navegador puede venir de cualquier parte, así que la decodificación se hace en dos pasadas. La primera recorre todo el archivo y comprueba que la longitud, el desplazamiento y la cantidad de cada chunk queden dentro del archivo. Solo entonces empieza la decodificación real. Los archivos dañados o que superan los límites se detectan en esa revisión, en lugar de fallar a mitad de camino. Los límites actuales son:

| Elemento          | Límite                 |
| ----------------- | ---------------------- |
| Lado del lienzo   | 32.768 píxeles         |
| Imagen individual | 64 millones de píxeles |
| Cuadros           | 4096                   |
| Capas             | 256                    |

### Decodificar en un Worker

Descomprimir decenas de cuadros lleva tiempo, y hacerlo en el hilo principal congelaría la interfaz. Al abrir un archivo, se lo pasamos a un Worker dedicado a decodificar, y los búferes de píxeles decodificados vuelven al hilo principal como objetos `Transferable`, sin copiarse. Si el navegador no admite Workers o el Worker falla, la decodificación pasa al hilo principal.

Los datos de píxeles están comprimidos con zlib. Preferimos el `DecompressionStream("deflate")` nativo del navegador y limitamos su salida al tamaño declarado en la cabecera del chunk para protegernos de las bombas de descompresión. Cuando no está disponible, usamos [fflate](https://github.com/101arrowz/fflate). Esa vía reserva un búfer de salida exactamente del tamaño declarado y verifica la suma de comprobación Adler-32.

### Descomprimir solo los píxeles necesarios

Al abrir un archivo, los cels RGB se validan, pero no se descomprimen por completo. Los bytes comprimidos originales se quedan en memoria y cada cuadro se descomprime cuando hace falta. Los proyectos grandes no tienen que descomprimirse en memoria de una sola vez.

### Reescribir tal cual lo que no cambiaste

Al guardar en `.aseprite`, el codificador deja intacto el contenido que no se tocó:

- Los cels sin cambios se escriben a partir de los bytes comprimidos guardados desde la apertura, sin volver a comprimir.
- Los chunks desconocidos se escriben tal cual, así que los archivos creados con versiones más nuevas de Aseprite no pierden datos al guardarse en Xprite.
- Los cels recomprimidos solo usan la versión comprimida cuando es más pequeña que los datos sin procesar.
- La compresión usa el `CompressionStream` nativo del navegador. Si no está disponible, el archivo se guarda sin comprimir. Ocupa más, pero Aseprite lo abre igual.

## Renderizar el lienzo solo con Canvas 2D

Xprite no usa WebGL. Los lienzos de pixel art suelen ser pequeños; lo difícil es que cada píxel se vea nítido. Con cualquier zoom y densidad de pantalla, un píxel tiene que verse como un cuadrado de bordes definidos, no como algo que el navegador suaviza hasta dejarlo borroso.

### De las capas a la pantalla

```article-diagram
{
  "kind": "flow",
  "label": "Una actualización de pantalla",
  "steps": [
    { "label": "Componer capas", "detail": "Combinar el cuadro actual según el orden de capas, la opacidad y el modo de fusión" },
    { "label": "Convertir colores", "detail": "Convertir con el perfil de color del proyecto y guardar el resultado en caché" },
    { "label": "Subir el área modificada", "detail": "Aplicar putImageData solo al rectángulo que cambió este trazo en el canvas de la imagen" },
    { "label": "Dibujar la vista", "detail": "Repetir los píxeles según el zoom y añadir el fondo de cuadros, la cuadrícula de píxeles y los bordes" },
    { "label": "Mostrar en pantalla", "detail": "Las escalas enteras dibujan directo; las fraccionarias muestrean con tablas" }
  ]
}
```

Mientras dibujas, el editor registra el rectángulo que cambia cada trazo, y el renderizado solo escribe esa zona en el canvas de la imagen, en lugar de reenviar la imagen completa cada vez. La vista terminada (píxeles, fondo de cuadros, cuadrícula) se guarda en caché en un canvas base. La clave de esa caché incluye la versión de los píxeles, la posición de la vista, los ajustes de visualización, etc. Mover el cursor no cambia la clave, así que el canvas base se reutiliza y solo se vuelve a dibujar la vista previa del pincel.

### Escalas enteras y fraccionarias

El último paso dibuja la vista en la pantalla. Si la vista corresponde a la pantalla con una escala entera exacta, se desactiva el suavizado y el `drawImage` del navegador hace el trabajo:

```ts
if (Number.isInteger(scaleX) && Number.isInteger(scaleY) /* and no offset */) {
  presentation.imageSmoothingEnabled = false;
  presentation.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight,
                         0, 0, canvas.width, canvas.height);
  return;
}
presentation.putImageData(renderer.render(context.getImageData(...)), 0, 0);
```

Con escalas fraccionarias, como una densidad de pantalla de 1,5 o un zoom del navegador del 110 %, cada navegador muestrea `drawImage` de forma distinta. Las columnas de píxeles quedan desiguales o toda la imagen se desplaza medio píxel. En ese caso hacemos nosotros el muestreo por vecino más cercano: para el tamaño de destino, calculamos de antemano a qué píxel de origen corresponde cada columna y cada fila, y lo guardamos en dos tablas `Int32Array`. El muestreo copia cada píxel como un único `Uint32`, y las series de filas idénticas se copian enteras con `copyWithin`.

La interfaz sigue la misma idea: cada control se dibuja con 2 muestras por píxel lógico. Cambiar el tamaño de la ventana del navegador solo cambia el tamaño del área de trabajo; los botones y los menús mantienen su tamaño.

### Importar y exportar imágenes

El navegador codifica y decodifica PNG, JPEG, WebP y otras imágenes:

- Para decodificar se prefiere `createImageBitmap`, con un elemento `<img>` como alternativa.
- Para codificar se prefiere `OffscreenCanvas.convertToBlob`, con `toBlob` de `<canvas>` como alternativa.
- Cuando un navegador no admite un formato, `toBlob` no lanza un error: devuelve un PNG sin avisar. Por eso, después de codificar comprobamos el tipo real del resultado, y antes de exportar codificamos una imagen de prueba de 1×1 para saber qué formatos puede exportar el navegador.

## Dónde se guarda tu trabajo

Hay dos lugares para guardar un proyecto, que se eligen en **Destino de guardado** dentro de **Guardar como...**:

![El diálogo Guardar como: nombre de archivo, formato y las opciones Navegador y Gestor de archivos en Destino de guardado](images/save-as-location-en.png)

| Ubicación          | Funciones del navegador que usa | Si no está disponible                          |
| ------------------ | ------------------------------- | ---------------------------------------------- |
| Gestor de archivos | File System Access API          | El archivo se descarga                         |
| Navegador          | IndexedDB + OPFS                | Los datos del proyecto se guardan en IndexedDB |

Los proyectos del navegador solo existen en este navegador y en este dispositivo, y no se sincronizan. Borrar los datos del sitio también los elimina. Consulta la [guía de uso](/help/#guardar-y-recuperar).

### Gestor de archivos: escribir directamente en el archivo original

En los navegadores compatibles con la File System Access API (Chrome, Edge y otros de escritorio), **Abrir** y **Guardar** muestran los diálogos de archivo del sistema. Lo que obtenemos es un identificador del archivo, no una copia:

- El identificador se guarda en IndexedDB, así que el siguiente **Guardar** escribe en el mismo archivo sin preguntar dónde.
- Antes de escribir, pedimos permiso de lectura y escritura, y luego escribimos con `createWritable()`.
- Los navegadores exigen que el diálogo de archivo provenga directamente de un clic del usuario, así que llamamos a `showSaveFilePicker()` justo después del clic, sin ninguna otra tarea asíncrona de por medio.
- Cuando la página está integrada en el iframe de otro sitio (un portal de juegos, por ejemplo), el navegador no permite diálogos de archivo. Entonces Xprite descarga el archivo, igual que en los navegadores sin compatibilidad.

### Navegador: catálogo en IndexedDB y datos en OPFS

En los proyectos guardados en el navegador, el catálogo (nombre, tamaño, fecha de modificación, versión actual) siempre está en IndexedDB. Los datos del proyecto se guardan en OPFS (origin private file system, una zona privada del disco que el navegador asigna a cada sitio) siempre que se puede. OPFS solo se usa cuando el navegador admite Workers, `navigator.storage.getDirectory()`, Web Locks e identificadores de archivo con escritura. El tipo de almacenamiento se elige al crear el proyecto y no cambia nunca, así que un cambio en la compatibilidad del navegador no puede hacer desaparecer proyectos antiguos.

Las lecturas y escrituras en OPFS se ejecutan en un Worker dedicado, que usa un identificador de acceso síncrono (`createSyncAccessHandle`) para escribir, truncar y volcar los datos. Cada guardado sigue estos pasos:

```article-diagram
{
  "kind": "flow",
  "label": "Guardar un proyecto en el navegador",
  "steps": [
    { "label": "Codificar el proyecto", "detail": "En un Worker, codificar el proyecto como .aseprite con metadatos como el cuadro y la capa actuales" },
    { "label": "Dividir los datos", "detail": "Por encima de 256 KiB, dividir por los límites de los chunks .aseprite en segmentos de hasta 1 MiB" },
    { "label": "Escribir segmentos nuevos", "detail": "Eliminar duplicados por tamaño y SHA-256 y reutilizar los segmentos con contenido idéntico" },
    { "label": "Releer y verificar", "detail": "Volver a leerlo todo, comparar sumas de comprobación y abandonar en cuanto haya un truncamiento" },
    { "label": "Publicar la versión", "detail": "En una transacción de IndexedDB, apuntar el catálogo a la nueva versión y conservar la anterior" }
  ]
}
```

Algunas reglas evitan que los datos se corrompan:

- Los datos escritos solo se amplían. Cada clave se puede escribir una sola vez, y los archivos que fallan a mitad se eliminan.
- Solo la transacción final del catálogo cambia la versión actual, y únicamente si ninguna otra pestaña la cambió antes (compare-and-swap).
- Cuando Xprite está abierto en varias pestañas, Web Locks hace que las escrituras sean mutuamente excluyentes.
- Dividir por los límites de los chunks `.aseprite` mantiene los cuadros y capas sin cambios en los mismos segmentos. Editar un cuadro solo escribe los segmentos que cambiaron.

### Recuperación automática

La recuperación automática usa la misma vía de almacenamiento que el guardado en el navegador. Mientras editas, Xprite guarda datos de recuperación cada 2 minutos de forma predeterminada y los conserva durante 7 días. Puedes cambiar el intervalo y el número de días en **Editar → Preferencias → Archivos**. Si el navegador se cierra inesperadamente, elige **Recuperar archivos...** en Inicio para recuperar tu trabajo.

## Enlaces para compartir: el sprite vive después del

**Archivo → Compartir...** no sube nada. El sprite se comprime y se escribe en la parte del enlace que va después de `#share=` (el fragmento de la URL). Los navegadores no envían al servidor nada de lo que va después de `#`, así que compartir nunca pasa por un servidor.

![El diálogo Compartir...: opciones para compartir solo el cuadro actual o las capas visibles, seguidas de un enlace que empieza por https://xprite.cc/editor#share= y su número de caracteres](images/share-dialog-en.png)

```article-diagram
{
  "kind": "flow",
  "label": "Crear un enlace para compartir",
  "steps": [
    { "label": "Preparar candidatos", "detail": "Empaquetar los píxeles de varias formas: planos por canal, diferencias entre cuadros, color indexado, tiles" },
    { "label": "Quedarse con el más pequeño", "detail": "Probar cada candidato sin comprimir, con DEFLATE y con Zstd, y quedarse con el más pequeño" },
    { "label": "Codificar como texto", "detail": "Los enlaces usan Base64url; los códigos QR prueban Base32 y Base43 y se quedan con el más corto" },
    { "label": "Armar el enlace", "detail": "Dirección del editor + #share= + marcador de codificación + datos" }
  ]
}
```

- El empaquetado, la compresión y la decodificación se ejecutan en un Worker. Zstd se ejecuta como WebAssembly: los datos se comprimen primero con nivel 19, y los resultados de menos de 1 MiB se vuelven a comprimir con un nivel más alto. Si WebAssembly no se carga, solo se usa DEFLATE, y el enlace se sigue abriendo.
- El modo alfanumérico de un código QR usa solo 5,5 bits por carácter, lo que es más compacto que el modo byte, así que los códigos QR usan una codificación Base43 formada solo por caracteres de ese modo.
- Cuando se abre un enlace, el editor lee los datos que van después de `#share=`, los quita de inmediato de la barra de direcciones con `history.replaceState` y se los pasa a un Worker para decodificarlos.
- Los enlaces de más de 1800 caracteres muestran un aviso de que algunas apps de mensajería pueden cortarlos. No se crean enlaces de más de 8192 caracteres.

El enlace contiene el proyecto editable completo. Cualquiera con el enlace completo puede abrirlo; los enlaces no caducan ni se pueden revocar. Si envías un enlace o un código QR por una app de mensajería, esa app también recibe los datos del arte.

## Uso sin conexión: una versión completa cada vez

Después de añadir Xprite al escritorio o a la pantalla de inicio, un Service Worker guarda el editor en caché para que se abra sin conexión. (La caché necesita que abras el editor una vez con conexión; consulta los pasos en la [guía de uso](/help/#añadir-al-escritorio-y-usar-sin-conexión).) La estrategia de caché gira en torno a mantener las versiones coherentes:

- Cada compilación genera un manifiesto de recursos de esa versión, con un hash SRI para cada archivo. Al instalar, `cache.addAll` guarda todo el manifiesto de una vez. Si algún archivo no se descarga o su hash no coincide, la versión no entra en vigor, así que nunca se mezclan archivos antiguos y nuevos.
- Cuando todo está en caché, se escribe un marcador de "listo", y los arranques sin conexión solo usan versiones con ese marcador.
- Una versión nueva toma el control en cuanto se instala, pero las páginas ya abiertas siguen ejecutando el código antiguo. Los recursos antiguos con nombres de archivo con hash se conservan para que esas páginas puedan seguir cargándolos.
- Solo se guarda en caché el resultado de la compilación. La analítica, el punto de envío de comentarios y las páginas del sitio no pasan por la caché.
- La caché de una versión antigua solo se elimina después de que se hayan cerrado todas las ventanas del editor.

En los navegadores compatibles, también solicitamos almacenamiento persistente (`navigator.storage.persist()`) para que sea menos probable que el navegador borre tu trabajo cuando falte espacio.

## Pantallas táctiles y lápices

Un mouse tiene un solo puntero, pero en una pantalla táctil puede haber un lápiz y varios dedos a la vez. La capa de entrada los gestiona con estas reglas:

| Situación                         | Qué pasa                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Un lápiz y un dedo tocan a la vez | El lápiz tiene prioridad e interrumpe la acción del dedo                                        |
| Después de detectar un lápiz      | Un dedo desplaza el lienzo de forma predeterminada, para evitar marcas accidentales de la palma |
| Se apoya un segundo dedo          | El trazo actual se cancela y empieza un gesto de dos dedos                                      |
| Pellizcar con dos dedos           | Hace zoom en el lienzo                                                                          |
| Tocar con dos o tres dedos        | Deshacer o rehacer                                                                              |
| Después de apoyar un dedo         | Xprite decide primero si es un toque o un arrastre y luego empieza a editar                     |

El umbral de arrastre también depende del tipo de puntero: un dedo tiene que moverse más de 8 píxeles CSS para que cuente como arrastre, mientras que a un mouse o un lápiz le basta con 1 píxel.

### Trazos más finos

Para ahorrar trabajo, los navegadores combinan varios eventos `pointermove` de un mismo fotograma en uno solo. Cuando dibujas con un lápiz, tomamos todas las muestras combinadas de `getCoalescedEvents()`, cada una con su valor de presión. Los navegadores también ofrecen muestras predichas, que no usamos: un punto predicho puede no coincidir con el trazo real y nunca debe acabar en el historial de deshacer.

```ts
/** Real samples only: predicted input must never reach document history. */
const coalesced = event.getCoalescedEvents?.() ?? [];
const actual = coalesced.filter(
  (point) => point.pointerId === event.pointerId && point.pointerType === "pen",
);
```

### Apple Pencil en iPad

En Safari para iPad, los toques del Apple Pencil activan por defecto comportamientos del sistema, como la selección de texto y Escribir a mano. Los listeners táctiles de React son pasivos y no pueden impedir el comportamiento predeterminado, así que registramos un listener nativo `touchstart` no pasivo directamente en el lienzo y en los controles arrastrables, y llamamos a `preventDefault()` solo cuando `touchType` es `stylus`. Los campos de texto y otras zonas editables no se ven afectados, así que puedes seguir escribiendo en ellos con Escribir a mano.

## Diseño: de una ventana de escritorio a un teléfono en vertical

La interfaz de Xprite recrea Aseprite 1.3. Los tamaños de los diálogos y las posiciones de los controles salen de mediciones de Aseprite 1.3.18, y hay pruebas que los mantienen alineados. Los gráficos del tema siguen el estilo pixelado de Aseprite, y la interfaz en chino usa la fuente Fusion Pixel.

En una pantalla ancha tienes el diseño de escritorio de siempre: la barra de menús arriba, la paleta a la izquierda, las herramientas a la derecha y la línea de tiempo abajo.

![El diseño ancho: barra de menús arriba, paleta y selector de color a la izquierda, herramientas a la derecha, línea de tiempo abajo](images/workspace-wide-en.png)

Ese diseño no cabe en un teléfono en vertical. Cuando **Diseño del espacio de trabajo** está en **Auto** (el valor predeterminado), elegimos un diseño según el espacio disponible. También puedes fijarlo en **Diseño ancho** o **Diseño compacto**; consulta la [guía de uso](/help/#organizar-el-espacio-de-trabajo). Las reglas son:

| Según                                   | Condición                                     | Resultado                                                                                                |
| --------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Relación de aspecto del área disponible | ≥ 1,2                                         | Diseño ancho: paneles en los bordes                                                                      |
| Relación de aspecto del área disponible | < 1,2                                         | Diseño compacto: herramientas en una fila arriba, paleta y línea de tiempo en pestañas debajo del lienzo |
| Ancho del área disponible               | < 768 píxeles CSS                             | La interfaz pasa a densidad compacta                                                                     |
| Puntos táctiles o precisión del puntero | Cualquier punto táctil, o `(pointer: coarse)` | Modo de interacción táctil                                                                               |

En el diseño compacto, la barra de menús se pliega en el botón ☰ de la esquina superior izquierda, y la interfaz respeta las zonas seguras, como la muesca y las esquinas redondeadas:

![El diseño compacto en un teléfono en vertical: pestañas y una fila de herramientas arriba, el lienzo en el centro y las pestañas Paleta y Línea de tiempo abajo](images/workspace-compact-en.png)

El diseño y el modo de interacción se deciden por separado. Un iPad en horizontal usa a la vez el diseño ancho y la interacción táctil. Estrechar la ventana de un navegador de escritorio cambia al diseño compacto, pero mantiene la interacción con el mouse.

## Datos que envía Xprite

Editar, guardar y compartir no usan la red. Solo se envían dos tipos de datos:

| Datos            | Cuándo se envían                          | Incluyen                                                                                                  | No incluyen                                                        |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Analítica de uso | Cuando usas la versión web oficial        | Visitas a páginas, uso de funciones, categorías de error, capacidades del navegador, ubicación aproximada | Píxeles del arte, nombres de documentos, rutas de archivos locales |
| Comentarios      | Cuando envías **Problemas y sugerencias** | Tipo de comentario, mensaje, correo electrónico opcional, datos de la visita actual                       | —                                                                  |

La analítica de uso se envía a PostHog Cloud (EE. UU.):

- El identificador de visitante se guarda en el `localStorage` del navegador.
- La dirección IP original se descarta después de añadir la ubicación aproximada.
- La grabación de sesiones y la captura automática de clics están desactivadas.
- Si activas Do Not Track en tu navegador y vuelves a abrir Xprite, no se envían más datos de uso.

Consulta todos los detalles en el [aviso de privacidad](/privacy/).

## Código abierto

Encontrarás el código fuente de todo lo descrito aquí en [GitHub](https://github.com/rhinoc/xprite). El código del editor tiene licencia GPL-2.0-only.
