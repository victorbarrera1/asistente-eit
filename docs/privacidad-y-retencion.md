# Privacidad y retención de datos

Inventario de qué datos guarda el Asistente EIT, dónde los guarda y por cuánto tiempo. Sirve para responder a la DTI y para decidir el plazo de retención. Refleja el código al 23-09-2026.

## Datos que se guardan

| Dato | Dónde | Quién lo escribe | Contiene datos personales | Retención |
| --- | --- | --- | --- | --- |
| Pregunta del estudiante (máx. 500 caracteres) y si hubo evidencia | Supabase `preguntas_log` | `logQuestion()` en `api/_lib/rag.js` | **Posible.** Es texto libre y el estudiante puede escribir su nombre, RUT o una situación personal. | `DATA_RETENTION_DAYS` (180 días por defecto) |
| 👍/👎 con pregunta, respuesta y comentario opcional | Supabase `feedback` | `api/_lib/feedback-handler.js` | Posible, en el texto libre | Igual que arriba |
| Estrellas y comentario de satisfacción | Supabase `satisfaction_feedback` | `api/_lib/feedback-handler.js` | Posible, en el comentario | Igual que arriba |
| Copia opcional del feedback | Google Forms (solo si `GOOGLE_FORM_FEEDBACK_URL` está definido) | `feedback-handler.js` | Posible | La define quien administra el formulario. La purga automática **no** lo alcanza. |
| Historial de la conversación | `localStorage` del navegador del estudiante | `src/components/UdpChat.tsx` | Sí, pero no sale del dispositivo | Hasta que el estudiante lo borra |
| IP del cliente | Memoria del proceso (rate limiting) | `api/_lib/rate-limit.js` | Sí | Ventana de 5 a 15 minutos. No se escribe en disco ni en la base de datos. |
| IP en logs de auditoría del login de admin | Logs de Dokku/journal | `admin-handler.js` | Sí | La que tenga la rotación de logs del servidor |
| Corpus institucional y su historial | Supabase `eit_docs`, `eit_paginas`, `eit_paginas_historial` | Scraper | No, es contenido público de sitios UDP | Indefinida (sirve para auditoría) |

**No se guardan:** la conversación completa en el servidor, identificadores de cuenta, cookies de seguimiento ni analítica de terceros.

## Controles implementados

- **Purga automática.** `scripts/purge-old-data.js` borra de las tres tablas de estudiantes todo lo anterior al plazo configurado. En la VM de ingesta se ejecuta cada semana (`deploy/scraper/asistente-purge.timer`). Rechaza plazos menores a 30 días para evitar un borrado accidental por configuración.
- **Truncado.** Las preguntas registradas se cortan en 500 caracteres y el feedback en 3.000.
- **Acceso.** Solo la service key del servidor lee estas tablas. El panel `/admin` exige contraseña fuerte, sesión firmada con HMAC de 8 horas, rate limiting y verificación de origen.
- **Sin analítica en rechazos.** Las consultas fuera de alcance no se registran (`chat-handler.js`).

## Decisiones pendientes con la DTI

1. **Plazo de retención.** 180 días es un valor provisorio que cubre un semestre de análisis. Confirmar si la universidad tiene una política institucional.
2. **Ubicación de los datos.** Supabase es un servicio en la nube de terceros. Si la DTI exige que los datos de estudiantes queden en infraestructura UDP, se puede migrar a PostgreSQL + pgvector en un servidor propio. El código solo usa la API REST de PostgREST, que puede autoalojarse sin cambiar la aplicación.
3. **Aviso al estudiante.** Agregar en la interfaz una línea visible del tipo "Tus preguntas se guardan de forma anónima por N días para mejorar el asistente. No escribas datos personales."
4. **Google Forms.** Decidir si se mantiene el reenvío. Si se mantiene, su retención debe gestionarse aparte.
