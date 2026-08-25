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
