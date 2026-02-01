# RAULI-VISION — Cliente local (proxy)

Proxy + caché SQLite que corre dentro de Cuba. Sirve el dashboard (estático) y reenvía peticiones al servidor espejo con JWT. Caché agresivo para reducir tráfico por el túnel.

**Stack previsto:** Go (o Node), SQLite, embed o disco para build del dashboard.

**Documentación:** Ver [docs/ARQUITECTURA_RAULI-VISION.md](../docs/ARQUITECTURA_RAULI-VISION.md) y [docs/API_RAULI-VISION.md](../docs/API_RAULI-VISION.md).

**Estructura:** Ver [docs/ESTRUCTURA_REPOS_RAULI-VISION.md](../docs/ESTRUCTURA_REPOS_RAULI-VISION.md).
