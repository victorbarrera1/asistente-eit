# Revisión de alcance y respuestas sin respaldo — Asistente EIT UDP

Revisión local del 7 de septiembre de 2026, en `/Users/victor/asistente-udp/bot_asistencia_udp`. Al cierre de la revisión, HEAD es `e789e20`. Se revisaron frontend, adaptadores HTTP, handler compartido, filtros, prompt, RAG, ingesta, migraciones, pruebas y configuración de despliegue. No se verificaron el modelo cargado en el servidor institucional, el corpus de Supabase ni el commit desplegado. No se ejecutaron consultas contra servicios reales.

## Resultado del cambio solicitado

Se agregaron siete declaraciones `.d.ts` junto a los módulos de `api/_lib` importados por TanStack. Describen únicamente la superficie usada por las rutas: entradas desconocidas que valida JavaScript, callbacks de texto, resultados de éxito/error, cookies, rate limiting e ingesta. No se modificaron implementaciones, dependencias ni opciones de TypeScript. Las declaraciones no comprueban internamente el JavaScript y deberán mantenerse sincronizadas con sus contratos.

El chequeo inicial tenía 15 errores TS7016. `npx tsc --noEmit` y `npm run build` pasaron con las declaraciones. El build emitió advertencias de dependencias sobre directivas `use client` ignoradas. La suite existente pasó 101/101 pruebas. Eso no demuestra ausencia de alucinaciones ni valida producción.

## Qué muestran los ejemplos del usuario

Entregar una guía después de negarse es una infracción del alcance del asistente. No demuestra por sí mismo una falsedad factual: los requisitos citados de Práctica I también están escritos en el prompt estático. Su vigencia debe verificarse contra la normativa institucional; esta revisión no los certifica.

El código actual ya contiene un endurecimiento reciente de expresiones regulares y pruebas con ambos mensajes exactos. Ambos se rechazan en la prueba local. Esto no permite afirmar que ese código esté desplegado, ni que las variantes y los seguimientos queden cubiertos.

## Flujo observado

`UdpChat.tsx` envía el historial del navegador a `/api/chat`. Tanto el adaptador TanStack como el de Vercel llaman a `runChatHandler`. Este valida formato, recorta historial, busca documentos, opcionalmente reescribe la consulta con el generador, evalúa alcance y finalmente genera texto por streaming. El frontend muestra cada fragmento y lo conserva en el historial.

La configuración por defecto selecciona Ollama, `qwen2.5:7b`, embeddings `bge-m3` de 1024 dimensiones y `buscar_docs_v2`. Gemini sigue disponible por configuración explícita. Cambiar Llama por Qwen no exige reindexar si se mantiene el mismo modelo de embeddings; el despliegue debe confirmar esa identidad.

## Hallazgos y consecuencias

| Prioridad | Evidencia local | Consecuencia |
| --- | --- | --- |
| Alta | `chat-handler.js:169` construye RAG antes de `evaluateScope` en la línea 180. `rag.js:488` puede llamar a embeddings y a `rewriteQuery`. | Incluso una tarea finalmente rechazada puede procesarse en la GPU. La consulta mixta del usuario provocó una reescritura en la prueba con servicios simulados. |
| Alta | `scope-guard.js:252` permite `sin_clasificar`; también permite `on_topic_sin_contexto`. | Una consulta ajena o una consulta institucional sin respaldo llega al generador. La suite existente incluso exige permitir preguntas ajenas como la capital de Francia. |
| Alta | `chat-handler.js:217` acumula y filtra, pero reenvía cada fragmento aceptado inmediatamente. Después del corte sigue esperando la generación; no la aborta. | El prefacio o una guía sin sintaxis de código ya pueden haberse mostrado. El aviso posterior no retira lo enviado. Tampoco se verifica si fechas, contactos o requisitos están respaldados. |
| Alta | `evaluateScope` examina solo el último mensaje de usuario. El historial viene del cliente y se reenvía al modelo. `validateChatRequest` incluso acepta un historial compuesto solo por mensajes `assistant`. | Un seguimiento como «continúa con lo anterior» no hereda una decisión de rechazo. Respuestas previas incorrectas pueden volver a usarse como contexto conversacional; los roles permitidos no autentican el historial. |
| Media | La migración `003_bge_m3_1024.sql:60` devuelve `similitud`, mientras `rag.js:384` lee `doc.similarity`. La migración anterior usa el mismo nombre español. | Con ese contrato SQL, el reranking sustituye la similitud por 0,5 y pierde esa señal. En una prueba dos documentos con similitudes 0,60 y 0,99 obtuvieron la misma puntuación final. El RPC desplegado aún debe comprobarse. |
| Media | `rag.js:444` deduplica por URL; se eligen tres fragmentos antes de deduplicar y se recortan a 1200 caracteres. | Dos fragmentos complementarios de una misma página se reducen a uno. Si los tres primeros vienen de la misma URL, puede quedar una sola pieza de evidencia aunque hubiera otras páginas disponibles. |
| Media | `searchDocs` devuelve `[]` tanto sin resultados como ante errores. `buildSystemPrompt` permite continuar después de fallos. `assertAIConfig` no tiene una llamada de arranque en el código de aplicación inspeccionado. | Un error de configuración o de base de datos se puede convertir en generación sin evidencia. El aviso en el prompt no impone abstención en el servidor. |
| Media | `recentHistory` se recibe en `buildSystemPrompt` pero no se usa para recuperar documentos. El presupuesto del historial se calcula en caracteres. | Consultas como «¿y para la segunda?» pierden contexto en la búsqueda. El límite en caracteres no garantiza el presupuesto real de tokens de todo el prompt. |
| Media | El prompt mezcla reglas con requisitos permanentes y pide responder con seguridad. El aviso sin documentos dice que solo se utilicen contactos. | Hay instrucciones en tensión y datos normativos sin metadatos de vigencia por afirmación. Un dato estático puede estar desactualizado aunque el modelo lo reproduzca fielmente. |
| Media | El scraper extrae texto HTML y enlaces a PDF/DOC; no descarga ni extrae el contenido de esos documentos. | Conocer el enlace a un reglamento no significa tener sus requisitos indexados. Hace falta comprobar cobertura real de los documentos usados como fuente. |
| Media | `logQuestion` registra pregunta truncada y presencia de documentos. `.gitlab-ci.yml` contiene solo despliegue. | No hay evidencia suficiente para comparar Qwen con Llama, reconstruir el respaldo de cada respuesta o impedir un despliegue que falle la política de alcance. |
| Media | En TanStack el stream se abre antes de ejecutar el handler y los errores solo se escriben si `streamStarted` es verdadero. La saturación devuelve 503 sin ese campo. | Puede terminar en HTTP 200 vacío y el frontend muestra «No se recibió respuesta». Es un defecto de transporte separado de las alucinaciones. |

## Reproducciones locales

Se interceptó `fetch` y se simularon embeddings, documentos vacíos y respuestas de Ollama. Las pruebas no permiten afirmar qué respuesta generaría el Qwen real: demuestran qué llamadas permite el servidor y qué texto deja llegar al usuario.

| Caso | Resultado observado |
| --- | --- |
| Solicitud mixta de Astro y requisitos de práctica | Rechazo final; antes llamó a embeddings, búsqueda y reescritura generativa. No llamó a `/api/chat`. |
| Solicitud urgente de cibercafé | Rechazo final; antes llamó a embeddings y búsqueda. |
| Capital de Francia, sin documentos | Llegó a `/api/chat`; se reenvió la respuesta simulada sin respaldo. |
| Ejemplo de punteros en C | Pasó el filtro de entrada; un prefacio de programación llegó al cliente antes de interceptar el bloque de código. |
| «continua con lo anterior» | Pasó el filtro; una guía simulada sin bloque de código se reenvió íntegra. |
| Dos fragmentos de una URL | Se perdió el segundo, aunque contenía información diferente. |
| Historial solo de `assistant` | La validación lo aceptó. |

## Propuesta, en orden de implementación

1. **Admisión antes de cualquier IA.** Separar la evaluación de intención de la búsqueda. Rechazar tareas claras y solicitudes mixtas con una respuesta fija antes de embeddings, reescritura o generación. Para el ejemplo mixto: «No diseño páginas ni resuelvo entregas. Puedes preguntarme por separado por los requisitos de Práctica I». Un caso ambiguo debe pedir aclaración mediante texto fijo o selección de trámite. No autorizar una solicitud solo porque contenga «UDP» o porque aparezca algún documento.
2. **Abstención explícita.** Diferenciar fuera de alcance, pregunta institucional sin respaldo y fallo de recuperación. Responder con plantillas distintas. Saludos y contactos pueden resolverse con datos aprobados sin inferencia. Cero documentos útiles o fallo del RAG no debe habilitar una respuesta normativa libre.
3. **Validar antes de mostrar.** Si se conserva generación, acumular la respuesta completa en el servidor y revisar alcance y respaldo antes de liberarla. Validar solo código no basta. Una infracción debe sustituir la respuesta completa; abortar también la generación cuando corresponda. La espera puede conservar el indicador visual del frontend.
4. **Trámites críticos con respuestas controladas.** Guardar fichas aprobadas para prácticas, titulación, contactos, fechas y requisitos, con URL, extracto de respaldo, carrera/malla, fecha de revisión y vigencia. Renderizar mediante plantillas. Un modelo puede seleccionar identificadores de fichas, pero el servidor debe comprobarlos y pedir aclaración si la selección no es inequívoca. No permitir que genere libremente esos requisitos.
5. **Corregir recuperación e ingesta.** Unificar `similitud`, conservar fragmentos distintos de una misma fuente, medir cobertura de la pregunta y recuperar seguimientos legítimos con contexto controlado. Incorporar contenido de PDF verificados cuando corresponda. Calibrar el umbral 0,55 con consultas etiquetadas: el valor no es una probabilidad de que la respuesta sea verdadera.
6. **Evaluación de extremo a extremo.** Probar ambos adaptadores HTTP, consultas mixtas, urgencias, paráfrasis, seguimientos, historial manipulado, fallos de RAG y preguntas administrativas legítimas. Para rechazos tempranos, verificar cero llamadas a embeddings, reescritura y generación. Para salidas inválidas, verificar cero texto inválido entregado. Integrar tipado, build y estas pruebas antes de desplegar.

El requisito literal de «no procesar con IA» requiere una entrada controlada: selección de trámites o reglas deterministas con aclaración/rechazo de todo lo no reconocido. Un clasificador basado en otro LLM también procesa la consulta y puede equivocarse. La comprensión abierta de lenguaje natural no ofrece una garantía absoluta con una lista creciente de regex.

Tampoco se puede prometer cero alucinaciones manteniendo generación libre. Las respuestas aprobadas y plantillas eliminan la invención generativa en esa ruta, pero su exactitud sigue dependiendo de la vigencia de las fuentes y de elegir la ficha correcta. Mi recomendación es mantener el stack actual y cerrar primero estas rutas; no volver a cambiar de modelo sin una evaluación comparativa.

## Verificación pendiente en producción

Confirmar commit desplegado, modelo y versión/digest de Ollama, configuración activa, firma de `buscar_docs_v2`, cantidad y antigüedad de fragmentos BGE-M3, ejecución del scraper y fuentes recuperadas para los incidentes. Comparar Llama y Qwen con el mismo corpus, preguntas y parámetros: medir respuestas sin respaldo, rechazos correctos, falsos rechazos y latencia. No basta con que Qwen redacte mejor.

## Referencias técnicas

- [OWASP: seguridad de RAG](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html): aislamiento de fragmentos, procedencia, validación de salida y abstención ante fallos. Son controles complementarios al prompt.
- [Ollama: salidas estructuradas](https://docs.ollama.com/capabilities/structured-outputs): permite imponer un esquema JSON y validarlo. Puede servir para devolver identificadores de fichas; garantizar el formato no garantiza la verdad de sus valores. Bajar temperatura aumenta consistencia, no aporta respaldo documental.
