# Estadísticas de WhatsApp — GitHub Pages

Versión actualizada de la página para analizar una exportación `.txt` de WhatsApp directamente en el navegador.

## Cambios de esta versión

- Eliminada **Riqueza léxica**.
- Eliminado **Preguntas por usuario**.
- **Media de palabras por mensaje por usuario**, ordenada de mayor a menor.
- **Participación de cada usuario** mediante gráfico circular de tarta.
- **Ranking de emojis** convertido en tabla con emoji y número de usos.
- La nube pasa a ser una **nube de trigramas**, con posiciones aleatorias, tamaños proporcionales a frecuencia y colores variados.
- Añadido **mapa interactivo de España por provincias**.
  - Cada provincia se colorea según el número de mensajes.
  - Al hacer clic en una provincia aparece el desglose por miembro.
  - El desglose muestra mensajes y porcentaje que representa cada miembro sobre el total de esa provincia.
  - Se mantiene también la tabla de mensajes por provincia.

## Requisitos para el mapa provincial

Hay que cargar `GR.xlsx` con una columna de contacto/usuario y otra llamada `Provincia` (la versión actual admite varias variantes razonables de esos encabezados).

El mapa utiliza límites provinciales GeoJSON y se muestra mediante Plotly. La página necesita conexión a Internet para cargar Pyodide, Plotly, SheetJS y el GeoJSON provincial.

## Preprocesamiento

Palabras, trigramas, tablas y nube utilizan el texto preprocesado: minúsculas, eliminación de URLs/ruido, stopwords españolas y lematización morfológica conservadora antes de calcular las frecuencias.

No se ejecuta VADER ni análisis de sentimiento.

## Publicación

Sube `index.html`, `styles.css`, `app.js` y `README.md` a la raíz del repositorio de GitHub Pages.
