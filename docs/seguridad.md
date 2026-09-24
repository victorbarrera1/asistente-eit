# Seguridad del Asistente EIT: auditoría del 23-09-2026

Auditoría ofensiva del stack completo: API, panel de administración, frontend, scraper, base de datos, dependencias y repositorio. Cada hallazgo se reprodujo contra el servidor compilado (`node .output/server/index.mjs`) o con una prueba automatizada antes y después de corregirlo.

## Hallazgos

| # | Severidad | Vector | Impacto | Estado | Evidencia |
| --- | --- | --- | --- | --- | --- |
| 1 | Baja (revisado) | `.env.production` en el historial de git (`df7eeda`, rama `gitlab/main`) | Revisado: todas las claves venían vacías salvo `VERCEL_OIDC_TOKEN`, un token de Vercel de vida corta (~12 h) emitido en junio de 2026 y ya expirado | Sin acción urgente | `git show df7eeda:.env.production` |
| 2 | **Alta** | Rotar `X-Real-IP` o `X-Forwarded-For` evadía todo el rate limiting | Fuerza bruta ilimitada contra `/api/admin-login`, fuerza bruta contra `CRON_SECRET` y saturación de la GPU | Corregido | 8/8 intentos sin 429 antes; bloqueo al 6.º después. `rate-limit.test.js` |
| 3 | **Alta** | Sin RLS ni privilegios mínimos en Supabase (probable) | Con la `anon key`, que no es secreta, se podían leer las preguntas de estudiantes, borrar feedback o envenenar `eit_docs` | Migración lista: **aplicar** `006_rls_y_privilegios.sql` | `scripts/migrations/006_rls_y_privilegios.sql` |
| 4 | Media | CSP de páginas sin `script-src` ni `connect-src` | Un XSS habría ejecutado código y exfiltrado la conversación | Corregido: CSP con nonce por petición | Navegador: script inline, handler `onerror` y `fetch` a otro dominio bloqueados; chat y admin funcionan |
| 5 | Media | Enlaces arbitrarios en respuestas del modelo mostrados como "Fuentes oficiales" | Phishing con la identidad de la UDP si una fuente es comprometida o el modelo inventa una URL | Corregido: solo `*.udp.cl` o URLs presentes en la evidencia | `output-links.test.js` |
| 6 | Media | El scraper seguía redirecciones a cualquier destino | SSRF desde leo o la VM hacia `localhost:11434` o la red interna | Corregido: cada salto se valida contra `*.udp.cl` | `scrape-incremental.test.js` |
| 7 | Media | Un solo cliente podía ocupar los 4 cupos de generación | Denegación de servicio a los demás estudiantes | Corregido: máximo 2 por cliente | `MAX_CONCURRENT_CHATS_PER_CLIENT` |
| 8 | Media | Con la tabla de rate limiting llena (10.000 claves) dejaban de registrarse claves nuevas | El límite se desactivaba para todos (fail-open) | Corregido: se desaloja la entrada más antigua | `rate-limit.test.js` |
| 9 | Media | 8 vulnerabilidades en dependencias (undici, vite, postcss, nanoid, js-yaml…) | Varias de severidad alta, sobre todo en build y tooling | Corregido con `npm audit fix` (sin cambios mayores) | `npm audit`: 0 vulnerabilidades |
| 10 | Baja | El logout solo borraba la cookie del navegador | Una cookie copiada seguía válida 8 h | Corregido: revocación en el servidor | curl: 401 tras logout |
| 11 | Baja | La comparación de la contraseña de admin revelaba su largo por timing | Reduce el espacio de búsqueda | Corregido: comparación de SHA-256 | `admin-handler.js` |
| 12 | Baja | Tokens de sesión con expiración arbitraria aceptados si la firma era válida | Refuerza el impacto de una fuga del secreto | Corregido: se rechaza una expiración mayor al TTL | `admin-security.test.js` |
| 13 | Baja | IPv6 se limitaba por dirección y no por prefijo | Un cliente rota direcciones dentro de su /64 | Corregido: agrupación por /64 | `rate-limit.test.js` |

### Ya estaba bien (verificado)

- Renderizado de la salida del modelo: son elementos React (sin `innerHTML`), los enlaces aceptan solo `http/https` y llevan `rel="noopener noreferrer"`.
- Admin: contraseña fuerte obligatoria, sesión HMAC HttpOnly `SameSite=Lax`, verificación de Origin y auditoría de intentos.
- API: límite de 128 KB (también con `chunked`), solo `application/json`, sin CORS (el navegador bloquea llamadas desde otros dominios) y CSP `default-src 'none'`.
- El widget solo se puede embeber desde `*.udp.cl`, y el parámetro `welcome` (phishing) ya se había eliminado.
- El scraper elimina el texto oculto (vector de prompt injection) y el contexto entra al modelo como datos JSON.
- Todas las llamadas externas tienen timeout.

## Cómo se resuelve ahora la IP del cliente

1. **La IP del socket manda.** Una cabecera de proxy solo se acepta si la conexión viene de una red de confianza (`TRUSTED_PROXY_CIDRS`; por defecto loopback y redes privadas, porque Nginx de Dokku conecta desde Docker).
2. Detrás del proxy se usa la entrada de `X-Forwarded-For` que agregó ese proxy (la última con `TRUSTED_PROXY_HOPS=1`). Las anteriores las escribe el cliente.
3. `X-Real-IP` ya **no** se usa salvo que se declare en `TRUSTED_IP_HEADER`. Nginx de Dokku no la reescribe por defecto, y ese era el bypass.
4. Una conexión directa desde fuera de la red de confianza ignora todas las cabeceras.

## Lo que tienes que hacer tú

### 1. Archivo `.env.production` en el historial (revisado, sin riesgo vigente)

El archivo se subió en `df7eeda` y se quitó en `c692cad`. Revisado el 23-09-2026: `GEMINI_API_KEY` y el resto de las variables estaban vacías. El único valor sensible era `VERCEL_OIDC_TOKEN`, un token que Vercel emite con una vigencia de unas 12 horas y que expiró hace meses. No hay que rotar nada por este archivo.

Para que no se repita, `.gitignore` ya excluye `.env`, `.env.production` y `.env*.local`. Antes de cada commit, revisa `git status`: `vercel env pull` crea estos archivos en la raíz.

### 2. Aplicar la migración de Supabase

Ejecuta `scripts/migrations/006_rls_y_privilegios.sql` y verifica que la anon key ya no lee datos:

```bash
curl "$SUPABASE_URL/rest/v1/preguntas_log?select=*&limit=1" -H "apikey: <ANON_KEY>"
```

Debe devolver `[]` o un error de permisos. Después, confirma que el asistente sigue respondiendo.

### 3. Verificar la cadena de proxies en leo

```bash
dokku nginx:show-config asistente-eit | grep -iE "x-forwarded-for|x-real-ip|listen"
docker ps --format '{{.Names}} {{.Ports}}' | grep asistente
```

- `X-Forwarded-For` debe ser `$remote_addr` o `$proxy_add_x_forwarded_for`. Con cualquiera de los dos, el valor correcto es `TRUSTED_PROXY_HOPS=1`.
- El contenedor **no** debe publicar puertos hacia el host (sin `0.0.0.0:xxxx->`). Si otra máquina de la red privada pudiera conectarse directo a la app, podría falsificar `X-Forwarded-For`. En ese caso, fija `TRUSTED_PROXY_CIDRS` a la IP del bridge de Docker (por ejemplo `172.17.0.1/32`).
- Si hay un balanceador de la universidad delante de Nginx, usa `TRUSTED_PROXY_HOPS=2`. Si no, todo el campus compartiría una sola cuota.

### 4. Secretos de 32+ caracteres y HTTPS

- `ADMIN_SESSION_SECRET` y `CRON_SECRET` de 32+ caracteres. Si no, el panel y el cron se niegan a funcionar.
- `FORCE_HTTPS=true` solo después de confirmar que el proxy envía `X-Forwarded-Proto`.

## Riesgos residuales (aceptados o fuera del código)

- **Rate limiting en memoria.** Funciona con un proceso (Dokku). Con varias instancias, cada una tiene su propio contador. Contra una botnet con miles de IPs, lo que protege es la contraseña fuerte, no el límite por IP.
- **`style-src 'unsafe-inline'`.** React emite atributos `style`. El riesgo es bajo porque los scripts siguen bloqueados.
- **Prompt injection.** El filtro de alcance y el de enlaces reducen el impacto, pero ningún filtro basado en reglas es completo. Ante un incidente, `CHAT_RESPONSE_MODE=static` desactiva la IA.
- **Supabase en la nube.** Ver `docs/privacidad-y-retencion.md`.
