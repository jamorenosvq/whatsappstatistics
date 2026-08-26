# Estadísticas de WhatsApp para GitHub Pages

## Qué hace

Esta página permite seleccionar una exportación `.txt` de WhatsApp y ejecutar el análisis en el navegador mediante Pyodide (Python en WebAssembly).

Se han conservado las partes de análisis estadístico del código proporcionado y se ha excluido completamente el bloque de análisis de sentimiento con VADER.

Además se ha añadido:

- Trigramas más frecuentes por usuario.
- Exportación de las tablas principales a Excel.
- Filtro de fechas configurable.
- Carga opcional de `GR.xlsx` para asociar nombres/provincias.
- El TXT permanece en el navegador; no se envía a un servidor propio.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube `index.html`, `styles.css` y `app.js` a la raíz.
3. En **Settings → Pages**, selecciona **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`.
4. Guarda y espera a que GitHub publique la página.

No hace falta ejecutar Python en GitHub: Pyodide descarga el intérprete de Python al navegador y ejecuta allí el análisis.

## Importante sobre GR.xlsx

Tu código original depende de `GR.xlsx` para convertir `username` a `contacto` y para asignar `Provincia`. Por eso esta versión permite cargarlo opcionalmente junto al TXT. Si no lo cargas, el análisis sigue funcionando con los nombres tal como aparecen en el TXT, pero no puede conocer las provincias.

## VADER

El bloque comprendido entre `ANÁLISIS DE SENTIMIENTO CON VADER` y su tabla se ha eliminado, por lo que no se genera ninguna métrica de sentimiento.


## Descarga de gráficos

Cada gráfico tiene botones para:
- Descargarlo como PNG en alta resolución.
- Descargarlo como HTML interactivo.

El HTML descargado conserva la interactividad de Plotly y puede abrirse sin que exista el repositorio.

## #PreguntaRandom

La página muestra una tabla con Fecha, Usuario y Mensaje de todos los mensajes que contienen `#PreguntaRandom`, además del gráfico diario. La misma información se incluye en la hoja `PreguntaRandom` del Excel.

## Estadísticas adicionales que recomiendo

Para una versión más completa y más divertida del análisis añadiría:

1. **Mapa de calor día de la semana × hora**: probablemente uno de los gráficos más vistosos para ver cuándo está más activo el grupo.
2. **Porcentaje de participación de cada usuario**: qué parte del total de mensajes aporta cada persona.
3. **Mensajes por mes**: permite detectar épocas de máxima actividad.
4. **Media de caracteres por mensaje por usuario**: diferencia entre quien escribe mucho y quien escribe mensajes largos.
5. **Récords del grupo**: día con más mensajes, hora más activa, usuario con más mensajes, mensaje más largo y día de mayor actividad.
6. **Top de palabras y trigramas por usuario**: ya incluido; sirve para ver el “vocabulario característico” de cada persona.
7. **Índice de diversidad léxica** (por ejemplo, palabras únicas / palabras totales): una estadística curiosa para comparar estilos de escritura.
8. **Emojis más utilizados**, tanto globalmente como por usuario.
9. **Mensajes con preguntas** (`¿...?`) y signos de exclamación por usuario.
10. **#PreguntaRandom**: ranking de quién publica más, qué días se utiliza más y listado completo de preguntas.
