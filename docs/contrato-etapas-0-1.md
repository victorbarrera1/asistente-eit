# Contrato y contención del Asistente EIT UDP

Fecha: 7 de septiembre de 2026. Incremento correspondiente a las etapas 0 y 1 del [plan integral](plan-integral-asistente-eit-2026-09-07.md).

## 1. Alcance confirmado

El usuario eligió **trámites y uso administrativo de plataformas**. Se permite orientar sobre reglamentos, prácticas, titulación, inscripción de ramos, servicios y navegación administrativa en las plataformas universitarias. No se permite entregar código, tutorías de contenidos ni resolver tareas, aunque el estudiante mencione una asignatura UDP o una entrega urgente.

| Consulta | Comportamiento esperado |
| --- | --- |
| «¿Dónde veo mis notas?» | Admitir; buscar respaldo y responder solo si hay documentos disponibles. |
| «¿Cómo inscribo Desarrollo Web?» | Admitir como trámite; el nombre de una materia técnica no basta para rechazar. |
| «Crea una página HTML de un cibercafé» | Respuesta fija de fuera de alcance, antes de cualquier llamada externa. |
| «Diseña una página en Astro y dime los requisitos de Práctica 1» | Rechazar la solicitud mixta y pedir que formule el trámite por separado. |
| «Hazlo ahora» después de pedir código | Mantener el rechazo, sin IA. |
| «Dame más detalles» después de consultar un trámite | Reconstruir la consulta desde el mensaje del usuario que se admitió. |
| Seguimiento sin una consulta anterior identificable | Pedir aclaración, sin IA. |
| Consulta no reconocida | Pedir una consulta institucional completa, sin IA. |
| Consulta institucional sin documentos recuperados utilizables | Abstenerse; no llamar al generador de respuestas. La búsqueda puede haber usado embeddings y reescritura. |
| Saludo o pregunta de identidad | Respuesta fija sobre el rol del asistente. |

«Sin procesar con IA» significa que la **consulta rechazada por la admisión** no se envía a embeddings, reescritura ni generación. El servidor sí recibe y examina el texto mediante reglas. Esas reglas son una primera contención; reconocer todo lenguaje natural sin errores no está garantizado.

## 2. Implementación para revisar

1. **Admisión antes de RAG — `api/_lib/chat-handler.js`.** `evaluateScope()` se ejecuta después de validar la petición y antes de `buildSystemPrompt()`. Los rechazos y aclaraciones son constantes del servidor y no esperan analítica remota. Las consultas admitidas sin documentos con URL y contenido reciben una abstención fija.
2. **Contrato de similitud — `api/_lib/rag.js`.** El reranking usa `doc.similarity ?? doc.similitud ?? 0.5`. Acepta ambos nombres de campo y conserva el valor cero. No cambia el esquema SQL ni los vectores existentes.
3. **Retención completa de la salida.** El streaming del proveedor permanece interno. El servidor acumula hasta 16.000 caracteres, examina el texto y exige finalización correcta antes de entregarlo. Si detecta código o una guía técnica cubierta por los patrones, descarta toda la salida y devuelve un rechazo fijo. Respuestas vacías, truncadas, JSON inválido, exceso de tamaño y fallos del proveedor producen HTTP 502 sin publicar el prefacio.
4. **Seguimientos — `api/_lib/scope-guard.js`.** Los seguimientos genéricos inspeccionan los mensajes anteriores del usuario, incluidos los anteriores a cortesías. No toman respuestas del asistente enviadas por el navegador como evidencia. Una pregunta institucional nueva puede cambiar de tema después de una solicitud rechazada. Al generador se envía la consulta actual o la consulta reconstruida, sin arrastrar respuestas anteriores del asistente.

Los lectores de Ollama y Gemini propagan los errores del validador y cancelan la lectura. Conservan UTF-8 dividido entre fragmentos y procesan el registro final aunque no termine en salto de línea. Cancelar la lectura local no demuestra que la GPU remota se detenga inmediatamente.

Los adaptadores Fetch/TanStack y Vercel esperan el resultado antes de emitir la respuesta HTTP. Conservan respuestas de texto para los clientes actuales e incorporan `X-Chat-Outcome`: `answered`, `out_of_scope`, `clarification`, `insufficient_evidence` o `limited`. Los fallos utilizan JSON y su estado HTTP; la saturación devuelve 503. El límite de concurrencia cubre también el trabajo RAG de las consultas admitidas y libera el cupo al fallar.

La retención completa aumenta el tiempo hasta ver la respuesta: el estudiante espera a que termine la generación y su validación. No se muestran fragmentos parciales del modelo.

### Modo de emergencia y control previo al despliegue

El interruptor `CHAT_RESPONSE_MODE` se configura en el servidor:

| Valor | Comportamiento del chat |
| --- | --- |
| `guarded` o variable ausente | RAG con admisión y validación de salida. Es el comportamiento predeterminado. |
| `static` | Solo mensajes fijos; sin llamadas a embeddings, reescritura, generación ni analítica remota. Las consultas institucionales reciben orientación general con el sitio de la Escuela, sin inventar requisitos. |
| Otro valor, incluido vacío | Se comporta como `static`; una errata no habilita IA. |

El modo estático mantiene validación de peticiones, límites por IP, rechazos de tareas y aclaraciones. Devuelve `X-Chat-Outcome: limited` para consultas institucionales. Los campos enviados por el navegador no pueden cambiar esta configuración. Aún no hay un catálogo de fichas aprobadas; el modo de emergencia utiliza únicamente mensajes fijos.

Para activarlo, el operador configura `CHAT_RESPONSE_MODE=static` en el entorno del despliegue y reinicia o reemplaza todos los procesos de la aplicación. Para volver, utiliza `CHAT_RESPONSE_MODE=guarded` una vez corregido y verificado el incidente. La variable no cancela retroactivamente solicitudes ya admitidas; debe comprobarse la sustitución de todos los procesos. Su alcance es el endpoint de chat: no desactiva trabajos de ingesta ni otras APIs. Se documenta en `.env.example`; no se modificaron las variables reales del servidor.

Se añade a `.gitlab-ci.yml` una etapa `verify` con Node 22 que ejecuta `npm ci`, `npx tsc --noEmit`, `npm test` y `npm run build`. La etapa `deploy` existente queda después de ella y conserva su regla para `main`. Un fallo de verificación impide alcanzar el despliegue en ese pipeline. El archivo queda preparado localmente; no se ejecutó un pipeline remoto ni se comprobó disponibilidad del runner.

## 3. Pruebas y verificación local

`npm test`: **196 pruebas aprobadas, cero fallos** en esta revisión. Usan proveedores y base de datos simulados; no consultan Ollama ni Supabase reales.

La cobertura incluye los dos ejemplos reportados, solicitudes mixtas, seguimientos rechazados y admitidos, cambios de tema, falta de documentos, conservación de similitud cero, retención de prefacios, guías técnicas en prosa, consulta administrativa con nombre de materia técnica, errores de transporte, finalización incompleta, UTF-8, cancelación y liberación de concurrencia. Se comprueban respuestas de ambos adaptadores HTTP.

Se añaden pruebas del modo estático con ambos proveedores, configuración vacía o desconocida, conservación del comportamiento predeterminado y rechazo de intentos del cliente de reactivar IA. Ambos adaptadores comprueban el estado `limited` y mantienen el rechazo de cuerpos inválidos.

La [evaluación inicial de alcance](evaluacion-alcance-2026-09-07.md) agrega 40 casos sintéticos con identificadores estables y dos pruebas que recorren esos casos en el handler. Se ejecuta por separado con `npm run test:scope`. Se corrigieron rechazos administrativos, peticiones indirectas y algunas admisiones motivadas solo por la identidad estudiantil. Los 40 casos pasan; son un conjunto de desarrollo, no la evaluación independiente de 200 consultas pendiente con la Escuela.

`git diff --check`: aprobado.

**Verificación pendiente en este entorno:** se intentaron `npx tsc --noEmit` y `npm run build`, pero faltan las dependencias locales. El build termina con `vite: command not found`; `npx` no puede obtener TypeScript. La instalación offline falla por paquetes ausentes en caché y `npm ci` con red falla con `ENOTFOUND registry.npmjs.org`. No se considera aprobado el typecheck ni el build de este incremento.

Cuando haya acceso al registro, ejecutar desde este checkout:

```sh
npm ci
npx tsc --noEmit
npm test
npm run build
```

Los archivos `.d.ts` mínimos de `api/_lib` ya forman parte del repositorio. Corrigen el contrato que TypeScript necesita para importar JavaScript desde las rutas; por sí solos no cambian el comportamiento del modelo ni evitan alucinaciones.

## 4. Límites y siguiente revisión

Esta entrega cubre las cuatro correcciones prioritarias y los ajustes de transporte necesarios para que sean comprobables. **No cierra toda la etapa 0 ni todo el plan de la etapa 1.**

- Falta validar con la Escuela el corpus de 200 consultas, respuestas de referencia y falsos rechazos, y confirmar el inventario del despliegue real.
- La admisión y el filtro de salida usan patrones finitos. Una consulta o tutoría formulada de otra manera puede escapar. El buffer impide publicar salidas que el filtro detecta, pero no convierte el filtro en un verificador semántico universal.
- Encontrar documentos con contenido y URL no prueba vigencia, autoridad ni que cada afirmación esté respaldada. Quedan pendientes las fichas revisadas para requisitos críticos, las citas verificables y las mejoras de ingesta/recuperación de las etapas 2 y 3.
- El interruptor de emergencia y el control de tipos/pruebas/build están implementados localmente. Falta probar la activación en el despliegue real y ejecutar el pipeline; aún no se integra la evaluación institucional ni el resto de controles del plan amplio en CI.
- El límite de 12 mensajes enviados por el cliente sigue vigente. Quedan pendientes el historial prolongado de la interfaz, la cancelación desde el navegador y la coordinación de cuotas entre réplicas.

El siguiente paso de revisión es confirmar los resultados de tipos/build con dependencias disponibles y evaluar las consultas administrativas reales antes de desplegar. No se ha realizado despliegue ni comparación en producción de Qwen frente a Llama.
