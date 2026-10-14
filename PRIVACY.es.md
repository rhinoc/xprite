# Aviso de privacidad

[English](PRIVACY.md)

Última actualización: 8 de octubre de 2026.

Este aviso describe los datos que usan el editor web, la página de presentación, los componentes web, los artículos y las herramientas independientes de Xprite. Xprite no requiere una cuenta. Los sitios que integran o alojan Xprite, como itch.io, pueden tener sus propias prácticas de privacidad.

## Trabajo guardado en tu navegador

Xprite procesa tu arte en el navegador. Los proyectos, los archivos recientes, los datos de recuperación, los ajustes predefinidos y las preferencias de la interfaz pueden guardarse en el almacenamiento del navegador o en archivos que elijas. Xprite no sube tu arte para editarlo ni lo sincroniza con una cuenta. Borrar los datos del sitio en el navegador también puede eliminar los proyectos guardados localmente y los datos de recuperación; guarda antes una copia de tus trabajos importantes.

Archivos guarda una copia de las imágenes y proyectos que importas en las herramientas y el editor, con sus nombres, fechas, etiquetas y comentarios, en el almacenamiento de este navegador (el sistema de archivos privado del origen e IndexedDB) para que puedas volver a abrirlos. Estas copias nunca salen de tu dispositivo. Los elementos de la Papelera se eliminan a los 30 días, y Vaciar Papelera los elimina en el acto. Archivos puede pedir al navegador que conserve este almacenamiento de forma persistente; el navegador decide. Los eventos de uso de Archivos registran acciones, rangos aproximados de tamaño y categorías de error, nunca nombres, comentarios ni contenido de los archivos.

El comando Compartir crea una URL que contiene en su fragmento el proyecto editable comprimido. Xprite genera y lee estos datos de forma local, sin subir ningún archivo. Enviar el enlace o el código QR por otra app comparte esos datos del proyecto con la app y con quienes lo reciben. Cualquiera con el enlace completo puede abrir el proyecto; esas copias no caducan ni se pueden revocar.

## Datos de uso

Las compilaciones web de producción con analítica activada envían eventos de uso a PostHog Cloud en Estados Unidos. Estos eventos abarcan visitas a páginas, clics de entrada al editor y a las herramientas, archivos leídos correctamente con una vista previa utilizable, resultados entregados al navegador para su descarga, categorías de error al abrir o exportar, etapas y disponibilidad del inicio, cambios de vista, restauración, apertura y edición de documentos, intentos manuales de guardar o exportar y sus resultados, acciones seleccionadas de la interfaz y errores depurados. Pueden incluir capacidades del navegador y del dispositivo, la ruta de la página sin parámetros de consulta ni fragmentos de la URL, el nombre del host de referencia, el tiempo que la página o el editor estuvieron visibles, las dimensiones o el formato del documento y una ubicación aproximada, como país, región o ciudad. No incluyen píxeles de tu arte, nombres de documentos, rutas de archivos locales ni datos de cuenta. Las escrituras de recuperación en segundo plano no se registran como guardados manuales.

PostHog guarda un identificador de visitante en el `localStorage` de este navegador para contar las visitas repetidas. Usa la dirección IP de la solicitud para añadir una ubicación aproximada a los nuevos eventos y descarta la IP original antes de almacenar el evento. Los perfiles de personas y la captura automática de clics están desactivados. Se graba una muestra de las sesiones como repeticiones de la estructura de la página y las interacciones: los campos de texto se enmascaran, el contenido de los lienzos, como las ilustraciones, no se graba, y las direcciones de páginas y solicitudes grabadas conservan solo la ruta, sin parámetros de consulta ni fragmentos. Los fallos de la analítica no interrumpen el editor ni las herramientas.

El identificador anónimo puede relacionar acciones en las páginas públicas y en el editor dentro del mismo navegador y del mismo sitio. Cada carga de documento tiene además su propio identificador de visita. Los cambios de ruta registran una visita a la página; los cambios de consulta o hash y la hidratación no duplican visitas. Los navegadores de desarrollo y de pruebas de aceptación pueden establecer un marcador local de tráfico interno, que viaja con los eventos para poder excluir esas visitas del análisis. Un evento de descarga significa que el resultado se entregó al navegador, no que se haya escrito un archivo en el disco.

Al enviar el diálogo de comentarios se mandan a PostHog el tipo elegido, el texto escrito y el correo electrónico opcional, junto con el contexto de la visita. Los borradores sin enviar se quedan en memoria hasta que se recarga la página. Si el envío falla, el borrador se conserva para reintentarlo.

PostHog conserva los eventos según sus [reglas de retención de eventos](https://posthog.com/docs/data/events-retention). El identificador del navegador normalmente se mantiene hasta que tú o tu navegador borren los datos de este sitio.

Los enlaces de las comparativas pueden asociar uno de tres identificadores fijos de artículo (`aseprite-online`, `aseprite-on-ipad` o `piskel-alternatives`) a la visita actual al editor y a sus acciones. Xprite solo acepta estos identificadores con la fuente de comparación y el medio de referencia fijos. No recopila valores de campaña arbitrarios, palabras clave de búsqueda ni parámetros de consulta o hash de la URL sin procesar, y no guarda esta atribución para visitas posteriores.

## Tu elección

Si tu navegador ofrece **Do Not Track**, actívalo y vuelve a abrir Xprite para que este navegador deje de enviar informes de uso. Esto no elimina los informes anteriores. Borrar los datos del sitio también restablece el identificador de visitante, pero puede eliminar trabajos guardados localmente.

## Preguntas

Si tienes preguntas sobre este aviso o sobre los datos que recopila Xprite, [contacta con el mantenedor a través de GitHub Issues](https://github.com/rhinoc/xprite/issues). No publiques datos personales ni arte en una issue pública; pide un medio de contacto privado si lo necesitas.
