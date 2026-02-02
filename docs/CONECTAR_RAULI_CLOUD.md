# Conectar RAULI-VISION con RAULI-CLOUD (Ollama)

Para que el chat de RAULI-VISION use tu IA local (Ollama) a través de RAULI-CLOUD:

## 1. Tener RAULI-CLOUD en marcha

- Carpeta: `C:\dev\rauli_cloud_final`
- Ejecuta **INICIAR_SISTEMA.bat** para levantar el backend en **http://localhost:8000**
- Ollama debe estar corriendo en tu PC (puerto 11434)

## 2. Configurar el espejo de RAULI-VISION

Antes de arrancar el espejo (backend de RAULI-VISION), define estas variables de entorno:

| Variable           | Descripción                          | Ejemplo                    |
|--------------------|--------------------------------------|----------------------------|
| `RAULI_CLOUD_URL`  | URL base de RAULI-CLOUD              | `http://localhost:8000`    |
| `RAULI_CLOUD_MODEL`| Modelo de Ollama a usar (opcional)   | `llama3.1` (por defecto)   |

### Windows (CMD)

```bat
set RAULI_CLOUD_URL=http://localhost:8000
set RAULI_CLOUD_MODEL=llama3.1
.\run-espejo.ps1
```

### Windows (PowerShell)

```powershell
$env:RAULI_CLOUD_URL = "http://localhost:8000"
$env:RAULI_CLOUD_MODEL = "llama3.1"
.\scripts\run-espejo.ps1
```

### Linux / Mac

```bash
export RAULI_CLOUD_URL=http://localhost:8000
export RAULI_CLOUD_MODEL=llama3.1
# luego inicia el espejo
```

## 3. Orden de arranque

1. **Ollama** en marcha (modelo descargado, p. ej. `llama3.1`).
2. **RAULI-CLOUD**: ejecutar `INICIAR_SISTEMA.bat` en `C:\dev\rauli_cloud_final`.
3. **Espejo RAULI-VISION** con `RAULI_CLOUD_URL=http://localhost:8000`.
4. **Dashboard RAULI-VISION** (proxy/frontend) como siempre.

Cuando entres al **Chat** en RAULI-VISION, las respuestas las generará Ollama a través de RAULI-CLOUD. Si `RAULI_CLOUD_URL` no está definida, el espejo seguirá usando la respuesta de ejemplo.
