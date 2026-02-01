# Guía de usuario — RAULI-VISION

Qué es RAULI-VISION, cómo buscar, cómo usar video y chat, y qué hacer cuando no hay conexión.

---

## Qué es RAULI-VISION

RAULI-VISION es un **dashboard unificado** pensado para entornos con **poco ancho de banda o conexión inestable**. Combina:

- **Búsqueda** ligera (resultados curados, menos datos).
- **Video** comprimido (calidades bajas para ahorrar datos).
- **Chat con IA** para resumir o preguntar sobre contenidos.

Funciona con dos piezas:

1. **Espejo** — Un servidor fuera de tu red (por ejemplo en un VPS) que hace búsquedas, obtiene videos y puede usar IA.
2. **Cliente local (proxy)** — Un programa en tu máquina que habla con el espejo, guarda caché y te sirve el **dashboard** en el navegador.

Tú usas siempre el **dashboard** en el navegador (por ejemplo `http://localhost:3000`). El proxy y el espejo se configuran una vez.

---

## Cómo buscar

1. Abre el dashboard (por ejemplo http://localhost:3000).
2. En la pestaña **Búsqueda**, escribe en el cuadro y pulsa **Buscar** (o Enter).
3. Verás una lista de resultados (título, enlace, fragmento). Los resultados se pueden guardar en caché para ahorrar peticiones.

Si aparece **"○ Local"** en la barra superior, el espejo no está disponible; aun así puedes ver la interfaz y, cuando el espejo vuelva, la búsqueda funcionará de nuevo.

---

## Cómo usar Video

1. Ve a la pestaña **Video**.
2. Escribe qué quieres ver y pulsa buscar.
3. El sistema muestra una lista de videos (título, canal, duración). Puedes solicitar uno en calidad baja (por ejemplo 360p) para usar menos datos.
4. El flujo real de descarga/stream depende de la configuración del espejo (puede estar simulado hasta que se configure yt-dlp/ffmpeg).

---

## Cómo usar el Chat (IA)

1. Ve a la pestaña **IA**.
2. Escribe tu mensaje y envía.
3. La respuesta puede ser un resumen o una contestación generada por el espejo. Si el espejo tiene integrada una IA real (OpenAI, Ollama, etc.), verás respuestas reales; si no, verás texto de ejemplo.

Opcionalmente puedes indicar una URL de contexto para que la IA resuma o hable sobre esa página.

---

## Qué hacer si no hay conexión

- **"○ Local" en la barra:** El dashboard no puede hablar con el espejo. Comprueba que:
  - El **proxy** (cliente local) esté en marcha (por ejemplo en el puerto 3000).
  - El **espejo** esté en marcha y accesible desde donde corre el proxy (puerto 8080 por defecto).
  - Si usas Docker, que los contenedores `espejo` y `proxy` estén levantados (`docker compose ps`).

- **Página en blanco o error al cargar:** Asegúrate de entrar por la URL del proxy (por ejemplo http://localhost:3000), no directamente al espejo. Si acabas de actualizar el dashboard, prueba "Buscar actualización" y, si aparece el modal, "Actualizar ahora".

- **Búsqueda o video no responden:** El espejo puede estar caído o la red entre proxy y espejo cortada. Revisa los pasos anteriores; cuando el espejo vuelva, las peticiones se reanudarán.

- **Actualización del dashboard:** Usa el botón **"Buscar actualización"**. Si hay una nueva versión, se mostrará un modal con la versión y el changelog; puedes elegir **"Actualizar ahora"** o **"Más tarde"**.

---

## Versión y estado

- En el **pie del dashboard** se muestra la versión del dashboard y la versión de la API (proxy/espejo).
- El endpoint `/api/health` (accesible desde el proxy) devuelve el estado del proxy, del espejo y, si aplica, estadísticas de caché.

Para más detalles técnicos y despliegue: [DESPLIEGUE.md](DESPLIEGUE.md), [ARQUITECTURA_RAULI-VISION.md](ARQUITECTURA_RAULI-VISION.md), [API_RAULI-VISION.md](API_RAULI-VISION.md).
