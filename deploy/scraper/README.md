# VM de ingesta del Asistente EIT

Esta máquina ejecuta el scraper, la evaluación de recuperación y la purga de datos. No atiende a los estudiantes: el chat sigue en **leo** (Dokku). Si la VM se cae, el asistente sigue respondiendo con el último corpus ingerido.

```
            VM de ingesta (Ubuntu 26.04)                       leo (Dokku)
 sitios UDP ──► scraper (timer diario) ──► Supabase ◄── asistente-eit (chat)
                    │                     (eit_docs)          │
                    └─► Ollama local (bge-m3, CPU)            └─► Ollama (qwen2.5 + bge-m3, GPU)
```

## Por qué los embeddings corren en la misma VM

El scraper necesita el **mismo modelo** que usa el chat para convertir la pregunta en vector (`bge-m3`, 1024 dimensiones). Hay dos opciones:

| Opción | Ventaja | Costo |
| --- | --- | --- |
| **A. Ollama en la VM, solo `bge-m3` en CPU** (recomendada) | No hay que exponer el Ollama de leo en la red. La VM es autónoma. | Unos ~1,2 GB de RAM. Tarda algunos minutos más, lo que da lo mismo en un proceso nocturno. |
| B. Usar el Ollama de leo por red | No duplica el modelo. | Hay que hacer que Ollama escuche fuera de `localhost` y abrir el puerto 11434 **solo** hacia la IP de la VM. Ollama no tiene autenticación. |

Con la opción A, verifica que ambas máquinas usen la misma versión del modelo. El digest de `ollama list` debe coincidir en leo y en la VM. Si difiere, los vectores dejan de ser comparables.

## Instalación

```bash
# 1. Usuario de servicio sin login y directorios
sudo useradd --system --create-home --home-dir /var/lib/asistente-eit --shell /usr/sbin/nologin asistente
sudo mkdir -p /opt/asistente-eit /var/lib/asistente-eit/snapshots
sudo chown -R asistente:asistente /opt/asistente-eit /var/lib/asistente-eit

# 2. Node 24 LTS (desde el repositorio de NodeSource o el paquete de Ubuntu si ya trae 24)
node --version   # debe ser >= 22

# 3. Ollama + modelo de embeddings (opción A)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull bge-m3

# 4. Código y dependencias
sudo -u asistente git clone <repo> /opt/asistente-eit
cd /opt/asistente-eit && sudo -u asistente npm ci --omit=dev
```

Crea `/opt/asistente-eit/.env` con permisos `600`, con dueño `asistente`, y con solo lo que la VM necesita:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=bge-m3
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=...
DATA_RETENTION_DAYS=180
```

No copies `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` ni `CRON_SECRET` a esta máquina, porque no los usa.

```bash
# 5. Prueba manual antes de programar
sudo -u asistente node --env-file=.env scripts/scrape-eit.js
sudo -u asistente node --env-file=.env scripts/eval-retrieval.js

# 6. Timers
sudo cp deploy/scraper/*.service deploy/scraper/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now asistente-scraper.timer asistente-purge.timer
systemctl list-timers 'asistente-*'
```

## Operación

| Tarea | Comando |
| --- | --- |
| Ver la última ejecución | `journalctl -u asistente-scraper --since today` |
| Forzar scraping ahora | `sudo systemctl start asistente-scraper` |
| Re-ingerir todo (después de cambiar el chunking) | `sudo -u asistente node --env-file=.env scripts/scrape-eit.js --force` |
| Medir recuperación | `sudo -u asistente node --env-file=.env scripts/eval-retrieval.js --json /var/lib/asistente-eit/eval.json` |
| Simular la purga | `sudo -u asistente node --env-file=.env scripts/purge-old-data.js --dry-run` |
| Actualizar código | `cd /opt/asistente-eit && sudo -u asistente git pull && sudo -u asistente npm ci --omit=dev` |

El scraper termina con código distinto de 0 si falla alguna página, y systemd lo marca como `failed`. `systemctl --failed` es la primera revisión.

Los snapshots HTML de cada versión nueva quedan en `/var/lib/asistente-eit/snapshots/<host>/<ruta>/`. El texto limpio queda además en la tabla `eit_paginas_historial`.

## Red

- **Salida HTTPS (443)** hacia `eit.udp.cl`, `dae.udp.cl`, `www.udp.cl`, `estudiantes.udp.cl`, `admision.udp.cl` y el host de Supabase.
- **Entrada:** solo SSH (22) desde la red de administración. La VM no expone ningún servicio.
- Con la opción B, además hay salida al puerto 11434 de leo.

## Migraciones previas

Aplica en Supabase `scripts/migrations/004_registro_paginas.sql` (modo incremental + historial) y `005_busqueda_hibrida.sql` (búsqueda híbrida). Las dos son aditivas: el código funciona sin ellas, pero pierde esas capacidades y lo avisa en el log.
