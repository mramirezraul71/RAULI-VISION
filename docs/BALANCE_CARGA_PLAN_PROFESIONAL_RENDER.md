# Balance de carga y capacidad — Plan Profesional Render + Espejo en PC

**Objetivo:** Definir balance de carga y cantidad de usuarios para **2 aplicaciones** (rauli-panaderia y RAULI-VISION) con el plan **Profesional** de Render y uso de **espejo en PC**.

---

## 1. Plan actual: Profesional (Render)

| Aspecto | Detalle |
|---------|---------|
| **Plan** | Profesional (equipos pequeños, startups) |
| **Precio workspace** | 19 USD/usuario/mes + coste de compute |
| **Ancho de banda incluido** | 500 GB/mes |
| **Balance de carga** | **Sí** — Render reparte tráfico entre instancias del mismo servicio. |
| **Autoscaling** | **Sí** — Escalado horizontal (mín/máx instancias por CPU o memoria). |
| **Escalado manual** | Hasta 100 instancias por servicio. |

Con Profesional puedes tener **varias instancias** por servicio y el tráfico se reparte entre ellas de forma automática.

---

## 2. Las 2 aplicaciones en Render

| App | Servicios en Render | Tipo | Plan instancia (ejemplo) |
|-----|----------------------|------|---------------------------|
| **RAULI-VISION** | espejo-backend, proxy-backend | Web (Go) | Starter (512 MB, 0.5 CPU) |
| **rauli-panaderia** | Rauli-Panaderia-1 | Web (Python 3) | El que tengas asignado en el Dashboard |

Recursos por instancia **Starter** (según [Render Pricing](https://render.com/pricing)):

- **RAM:** 512 MB  
- **CPU:** 0.5  
- **Precio:** 7 USD/mes por instancia  

Cada servicio puede tener **1 o más instancias**; con Profesional puedes usar **autoscaling** (mín/máx instancias).

---

## 3. Balance de carga

### 3.1 Cómo funciona en Render

- **Una instancia por servicio:** No hay reparto; todo el tráfico va a esa instancia.
- **Varias instancias por servicio:** Render hace **balanceo de carga** entre ellas (tráfico repartido).
- **Autoscaling (plan Profesional):** Puedes definir `minInstances` y `maxInstances` y umbrales de CPU/memoria para que Render escale solo.

### 3.2 Configuración recomendada para las 2 apps

**Opción A — Sin autoscaling (instancias fijas)**  
En el Dashboard de Render, para cada servicio:

- **espejo-backend:** 1 instancia (Starter).  
- **proxy-backend:** 1 instancia (Starter).  
- **Rauli-Panaderia-1:** 1 instancia (tipo que tengas).

**Opción B — Con autoscaling (Blueprint)**  
En `render.yaml` puedes añadir para cada servicio, por ejemplo:

```yaml
# Ejemplo para espejo-backend
numInstances: 1   # o quitar y usar scaling
scaling:
  minInstances: 1
  maxInstances: 3
  targetCPUPercent: 70
  targetMemoryPercent: 80
```

Así, RAULI-VISION (espejo + proxy) y rauli-panaderia comparten el mismo workspace Profesional; el balance de carga es **por servicio** (cada uno con sus propias instancias y su propio LB si hay más de 1).

### 3.3 Reparto de tráfico entre las 2 apps

- **rauli-panaderia:** Todo el tráfico a su(s) instancia(s) (Rauli-Panaderia-1).  
- **RAULI-VISION:** Tráfico público → proxy-backend → espejo-backend (y opcionalmente **espejo en PC** para parte del tráfico, ver abajo).

No hay un único “balanceador” que reparta entre las 2 apps; cada app tiene su URL y sus propios servicios. El “balance” es por servicio (varias instancias del mismo servicio).

---

## 4. Capacidad de usuarios

### 4.1 Criterios usados

- **Starter:** 512 MB RAM, 0.5 CPU.  
- **Go (espejo, proxy):** Poco uso de RAM por petición; límite práctico suele ser CPU y conexiones concurrentes.  
- **Python (panaderia):** Depende del framework; típicamente algo más pesado que Go por petición.  
- **Espejo en PC:** Según [CAPACIDAD_PC_Y_DECISION_DESPLIEGUE.md](CAPACIDAD_PC_Y_DECISION_DESPLIEGUE.md), la PC aguanta bien 5–10 clientes ligeros en LAN; con margen se puede estimar **hasta ~20–30 usuarios** usando solo el espejo (y/o proxy) en PC.

### 4.2 Solo Render (sin espejo en PC)

Estimación **por instancia** (1 instancia Starter por servicio):

| Servicio / App | Usuarios concurrentes orientativos | Notas |
|----------------|-------------------------------------|--------|
| **espejo-backend** (Go) | ~25–50 | API ligera; límite por CPU y conexiones. |
| **proxy-backend** (Go) | ~25–50 | Caché reduce carga al espejo. |
| **RAULI-VISION (espejo + proxy)** | **~25–40** | Cuello de botella: la instancia más cargada (normalmente proxy o espejo con 1 instancia cada uno). |
| **Rauli-Panaderia-1** (Python) | ~15–35 | Depende del framework y lógica; 1 instancia Starter. |

**Total solo Render (1 instancia por servicio):**

- **RAULI-VISION:** ~25–40 usuarios concurrentes.  
- **rauli-panaderia:** ~15–35 usuarios concurrentes.  
- No se suman como “un solo techo” porque son apps distintas; cada una con su propio límite.

### 4.3 Con espejo (y/o proxy) en PC

Si parte de los usuarios de **RAULI-VISION** usa **espejo en PC** (y opcionalmente proxy en PC):

- **En Render (público):** Siguen aplicando los ~25–40 usuarios concurrentes para quienes entren por la URL de Render (proxy-backend → espejo-backend).  
- **En PC (LAN/local):** Esos usuarios no consumen instancias de Render. La PC puede atender del orden de **~10–30 usuarios** adicionales (según documento de capacidad de PC).  

**Capacidad total orientativa RAULI-VISION:**

- **Solo Render:** ~25–40 usuarios concurrentes.  
- **Render + espejo en PC:** ~35–70 usuarios concurrentes (25–40 por Render + 10–30 por PC), dependiendo de cuántos usen la instancia en PC.

**rauli-panaderia** no usa espejo en PC en esta arquitectura; su capacidad sigue siendo ~15–35 concurrentes por instancia en Render.

### 4.4 Aumentar capacidad en Render

- **Más instancias por servicio:** En el Dashboard (o con `numInstances` / `scaling` en Blueprint) subir a 2 o 3 instancias para proxy-backend y/o espejo-backend. Con Profesional, el tráfico se reparte entre instancias (más usuarios concurrentes en total para ese servicio).  
- **Instancia más grande:** Pasar de Starter a Standard (2 GB, 1 CPU) aumenta usuarios concurrentes por instancia (aproximadamente doble o más según tipo de peticiones).

---

## 5. Resumen

| Tema | Conclusión |
|------|------------|
| **Plan** | Profesional: autoscaling y balance de carga entre instancias del mismo servicio. |
| **Balance de carga** | Por servicio: cada app (RAULI-VISION, rauli-panaderia) con sus propios servicios; cada servicio puede tener 1 o más instancias con LB automático. |
| **RAULI-VISION (solo Render)** | ~25–40 usuarios concurrentes (1 instancia Starter en espejo y 1 en proxy). |
| **RAULI-VISION (Render + espejo en PC)** | ~35–70 usuarios concurrentes (mismo Render + ~10–30 en PC). |
| **rauli-panaderia** | ~15–35 usuarios concurrentes por instancia en Render. |
| **Para crecer** | Aumentar instancias (y usar autoscaling) o subir tipo de instancia (Starter → Standard, etc.). |

Para aplicar autoscaling en los servicios de RAULI-VISION puedes añadir el bloque `scaling` en `render.yaml` (plan Profesional) y hacer sync del Blueprint.
