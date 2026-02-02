# Balance de carga y vías de publicación — RAULI-VISION

**Objetivo:** Analizar la capacidad de carga actual, la disponibilidad por tipo de despliegue y las vías recomendadas para publicar la aplicación (PC, nube, híbrido y otras).

---

## 1. Balance de carga actual

### 1.1 A nivel de aplicación (sin infraestructura de LB)

| Mecanismo | Componente | Efecto |
|-----------|------------|--------|
| **Rate limit** | Espejo: 120 req/min por IP; Proxy: 180 req/min por IP | Evita picos por cliente; no reparte carga entre instancias. |
| **Caché SQLite** | Proxy | Reduce peticiones al espejo (búsquedas, health); baja carga en el túnel. |
| **Compresión Brotli** | Espejo | Reduce ancho de banda por respuesta; no aumenta capacidad de peticiones/segundo. |
| **Sin cola ni workers** | Espejo | Cada petición se atiende en el mismo proceso; bajo concurrencia real. |

**Conclusión:** No hay balanceo de carga entre instancias. La app está pensada para **una instancia de espejo** y **una de proxy** por despliegue. El “balance” actual es solo **reducción de carga** (caché + rate limit), no distribución entre varios nodos.

### 1.2 Escalado por tipo de despliegue

| Despliegue | Espejo | Proxy | ¿Balanceo? | Capacidad orientativa |
|------------|--------|-------|------------|------------------------|
| **PC local (run-all.ps1)** | 1 proceso | 1 proceso | No | Decenas de usuarios (LAN). |
| **Docker Compose** | 1 contenedor | 1 contenedor | No | Centenares de usuarios (misma máquina). |
| **Render / Fly / Railway** | 1 servicio por defecto | 1 servicio | No (1 instancia) | Depende del plan; típico 1–2 instancias. |
| **Kubernetes (Helm)** | replicas + HPA | replicas + HPA | Sí (Service + Ingress) | Escalado horizontal; límite por nodos y recursos. |

El chart **Helm** (`helm/rauli-vision`) ya contempla:

- **replicaCount** (p. ej. 3 para proxy, 5 para backend Go).
- **HPA** (target CPU/memoria, min/max replicas).
- **Ingress** (nginx) con rate limit por ventana.
- **Pod anti-affinity** para repartir pods en nodos.

Para tener balanceo de carga real hace falta desplegar en un cluster (K8s o managed K8s) y usar ese chart o adaptarlo al stack actual (espejo + proxy Go).

---

## 2. Vías de publicación y disponibilidad

### 2.1 PC local (tu máquina)

| Aspecto | Descripción |
|---------|-------------|
| **Cómo** | `.\scripts\run-all.ps1` o Docker Compose en la misma PC. |
| **Disponibilidad** | Solo cuando la PC está encendida y los procesos activos. Apagado = servicio caído. |
| **Acceso** | LAN (localhost o IP local). Exposición a internet requiere tunel (ngrok, Cloudflare Tunnel) o abrir puertos (no recomendado por seguridad). |
| **Carga** | Una sola instancia; sin LB. Adecuado para uso personal o pequeño grupo (familia, oficina). |
| **Costo** | Cero de infraestructura; solo consumo eléctrico y ancho de banda de tu conexión. |

**Recomendación:** Ideal para **desarrollo**, **demostración** y para el modelo “**proxy local + espejo en nube**” (el espejo fuera, el proxy en tu PC).

---

### 2.2 Nube (PaaS / VPS)

#### 2.2.1 Render (PaaS)

| Aspecto | Descripción |
|---------|-------------|
| **Cómo** | `render.yaml` en el repo; conectar GitHub y desplegar. **Nota:** el `render.yaml` actual define el proxy como **Python** (`simple-server.py`); el proxy real es **Go**. Hay que actualizar a build/start del binario Go. |
| **Disponibilidad** | Plan free: servicio se “duerme” tras inactividad (cold start 30–60 s). Plan de pago: siempre activo. |
| **Carga** | Una instancia por servicio por defecto; se puede subir a más en plan paid. Sin LB entre instancias en la configuración típica. |
| **Costo** | Free limitado; paid por recurso (CPU/RAM). |
| **Encaje** | Bueno para **espejo** (backend) público. El **proxy** en Render tiene sentido si quieres un único punto de entrada en la nube; si el modelo es “túnel Cuba”, el proxy debería estar en local. |

#### 2.2.2 Vercel (frontend estático + proxy a backend)

| Aspecto | Descripción |
|---------|-------------|
| **Cómo** | `vercel.json`: build del **dashboard** (React) y rutas `/api/*` y `/auth/*` reenviadas a la URL del backend (p. ej. Render). Sustituir `your-backend-url.onrender.com` por la URL real. |
| **Disponibilidad** | Muy alta; CDN global. |
| **Carga** | Solo frontend y reenvío; la carga real la asume el backend (Render u otro). |
| **Costo** | Plan free generoso para proyectos personales. |
| **Encaje** | Publicar **solo el dashboard** con API apuntando al espejo (o espejo+proxy) en la nube. No sustituye al proxy Go con caché; es otra topología (front en Vercel, backend en Render/VPS). |

#### 2.2.3 VPS (DigitalOcean, Linode, Hetzner, etc.)

| Aspecto | Descripción |
|---------|-------------|
| **Cómo** | SSH al servidor; instalar Docker (o binarios Go); usar `docker-compose up -d` o systemd para espejo y proxy. Opcional: nginx/Caddy como reverse proxy con HTTPS. |
| **Disponibilidad** | 24/7 si el VPS está contratado; depende del SLA del proveedor. |
| **Carga** | Una máquina: una instancia de cada servicio. Para LB real: varias VPS + nginx/HAProxy o tráfico por un LB gestionado (ej. DigitalOcean LB). |
| **Costo** | Fijo mensual (desde ~5 USD/mes). |
| **Encaje** | Muy adecuado para el **espejo** (siempre encendido, fuera de Cuba). El proxy puede ir en el mismo VPS (demo global) o en PC local (modelo túnel). |

#### 2.2.4 Fly.io / Railway

| Aspecto | Descripción |
|---------|-------------|
| **Cómo** | Dockerfile o buildpack; despliegue vía CLI o GitHub. |
| **Disponibilidad** | Similar a Render; planes free con posibles cold starts. |
| **Carga** | Escalar instancias desde el panel. |
| **Encaje** | Alternativa a Render para espejo o proxy; revisar que el proxy desplegado sea el binario **Go**, no Python. |

---

### 2.3 Híbrido (recomendado para el modelo “túnel”)

| Capa | Dónde | Rol |
|------|--------|-----|
| **Espejo** | Nube (Render / VPS / Fly) | Siempre accesible desde internet; hace búsqueda, video, IA, compresión. |
| **Proxy + dashboard** | PC local (o Raspberry) | Caché SQLite, sirve PWA, reenvía al espejo; usuarios finales solo hablan con el proxy en LAN. |

**Disponibilidad:**

- **Espejo:** Depende del proveedor (24/7 en VPS/paid; cold start en free).
- **Proxy/Dashboard:** Cuando la PC/Raspberry esté encendida y los servicios en marcha.

**Ventaja:** Máximo ahorro de ancho de banda y mejor resiliencia ante cortes: el proxy sirve caché y estático aunque el espejo falle un rato.

---

### 2.4 Otras vías

| Vía | Descripción | Disponibilidad |
|-----|-------------|----------------|
| **Raspberry Pi** | Mismo esquema que PC local: espejo en nube, proxy + dashboard en la Raspberry (Docker o binarios Go). | Cuando la Raspberry esté encendida. |
| **GitHub Pages** | Solo **dashboard** estático; API apuntando a una URL externa (espejo o proxy en nube). Sin proxy con caché en GitHub Pages. | Alta (CDN). |
| **APK (PWA empaquetada)** | TWA/Capacitor con la URL del dashboard (local o nube). No añade disponibilidad; depende de dónde esté el backend. | La del backend que use la app. |
| **Kubernetes (GKE, EKS, AKS, etc.)** | Usar el Helm chart; varios replicas + Ingress = LB y alta disponibilidad. | Alta si el cluster está gestionado y con múltiples nodos. |

---

## 3. Resumen de disponibilidad por vía

| Vía | Disponibilidad típica | Notas |
|-----|------------------------|--------|
| **PC local** | Horas/día (cuando está encendida) | Sin alta disponibilidad. |
| **Raspberry Pi** | Idem | Menor consumo; misma lógica que PC. |
| **Render free** | Con cold start tras inactividad | Bueno para pruebas/demo. |
| **Render paid** | 24/7 (según SLA) | Una instancia por servicio si no se escala. |
| **Vercel (frontend)** | Muy alta | Solo frontend; backend por separado. |
| **VPS** | 24/7 (SLA del proveedor) | Control total; un solo nodo si no se monta LB. |
| **Fly / Railway** | Similar a Render | Revisar cold start en plan free. |
| **Kubernetes (Helm)** | Alta (multi-réplica + HA) | Requiere cluster; chart ya preparado. |

---

## 4. Recomendaciones priorizadas

### 4.1 Para uso personal / familia / “túnel Cuba”

1. **Espejo en nube (siempre encendido)**  
   - **Opción A:** VPS (DigitalOcean, Hetzner, etc.) con Docker Compose (espejo solo) y, si quieres, Caddy/nginx con HTTPS.  
   - **Opción B:** Render (o Fly) en plan de pago para el espejo; actualizar `render.yaml` para que el servicio “backend” sea el binario **Go** del espejo, no Python.

2. **Proxy + dashboard en PC o Raspberry**  
   - Ejecutar `.\scripts\run-all.ps1` (o equivalente en Linux) o `docker compose up -d` con espejo + proxy en local.  
   - O solo proxy en local apuntando a `ESPEJO_URL` del paso 1.  
   - Así tienes caché local y ahorro de ancho de banda; la disponibilidad del “sistema” depende de que la PC/Raspberry esté encendida.

3. **No hace falta balanceo de carga** en este escenario: una instancia de espejo y una de proxy son suficientes.

---

### 4.2 Para publicar una demo / acceso público global

1. **Frontend (dashboard)** en **Vercel**:  
   - `vercel.json` con build del dashboard y `routes` de `/api/*` y `/auth/*` al backend.  
   - Sustituir `your-backend-url.onrender.com` por la URL real del backend.

2. **Backend (espejo + proxy en uno, o solo espejo)** en **Render** o **VPS**:  
   - Si todo va en un mismo servicio: un solo despliegue que sirva API + estático (proxy Go con dashboard embebido).  
   - Actualizar `render.yaml` para que el “proxy” sea **Go** (build/start del proxy), no Python.  
   - En VPS: `docker compose up -d` con espejo + proxy; delante, nginx/Caddy con HTTPS.

3. **Disponibilidad:** Vercel muy alta; backend según plan (cold start en free, 24/7 en paid/VPS).  
4. **Carga:** Una instancia de backend; si crece el tráfico, escalar a más instancias en Render o añadir un LB en VPS (varias instancias detrás de nginx/HAProxy).

---

### 4.3 Para producción seria (más usuarios, más disponibilidad)

1. **Espejo:** Varias instancias detrás de un load balancer (cloud LB o nginx/HAProxy en VPS). Opcional: Redis para caché/sesión si se añade en el futuro.  
2. **Proxy:** Si el proxy está en la nube, también varias instancias; caché SQLite por instancia o migrar a Redis para compartir estado si se necesita.  
3. **Kubernetes:** Usar el chart en `helm/rauli-vision` adaptado al stack actual (imágenes de espejo y proxy Go, sin Python). HPA + Ingress dan balanceo y escalado automático.  
4. **Dominio + HTTPS:** En todos los casos públicos, usar Caddy/nginx o el LB del cloud con certificado (Let’s Encrypt o gestionado).

---

### 4.4 Acciones concretas recomendadas

| Prioridad | Acción |
|-----------|--------|
| **Alta** | Actualizar **render.yaml**: servicio proxy con runtime **Go**, build `go build -o proxy ./cmd/proxy`, start `./proxy`; `ESPEJO_URL` apuntando al servicio espejo en Render. |
| **Alta** | Actualizar **vercel.json**: reemplazar `your-backend-url.onrender.com` por la URL real del backend (ej. `https://espejo-backend.onrender.com` o la URL del proxy si el front llama al proxy). |
| **Media** | Documentar en **DESPLIEGUE.md** o **DEPLOYMENT.md** las dos topologías: “híbrido (espejo nube + proxy local)” y “todo en nube (demo público)”. |
| **Media** | Para balanceo real sin K8s: añadir ejemplo de **docker-compose** con 2–3 réplicas de espejo detrás de nginx como LB (opcional). |
| **Baja** | Revisar **Helm** para alinear nombres e imágenes con el stack actual (espejo + proxy Go; quitar referencias a backend Python si ya no se usa). |

---

## 5. Conclusión

- **Balance de carga hoy:** Solo mitigación de carga (rate limit + caché). No hay distribución entre varias instancias salvo que se use Docker Compose con varias réplicas o Kubernetes con el chart actual.
- **Disponibilidad:** PC/Raspberry = cuando estén encendidos; nube free = posible cold start; nube paid o VPS = 24/7; K8s = alta si está bien configurado.
- **Vías de publicación más útiles:**  
  - **Túnel / bajo ancho de banda:** Espejo en nube (VPS o Render) + proxy en PC o Raspberry.  
  - **Demo pública:** Dashboard en Vercel + backend (espejo o espejo+proxy) en Render o VPS, con `render.yaml` y `vercel.json` corregidos.  
  - **Producción con LB:** Varias instancias detrás de un LB (cloud o nginx) o despliegue en Kubernetes usando el Helm chart adaptado al stack Go.

Con estas correcciones en `render.yaml` y `vercel.json` y la documentación de topologías, el repo queda listo para publicar por PC, nube e híbrido con criterios claros de disponibilidad y carga.
