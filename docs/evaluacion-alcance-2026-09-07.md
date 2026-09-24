# Evaluación inicial del contrato de alcance

## Propósito y procedencia

Conjunto de **40 consultas sintéticas de desarrollo**, preparado a partir del alcance acordado: trámites y uso administrativo de plataformas. Incluye variaciones de los incidentes reportados, pero no representa tráfico real ni una muestra estadística. No contiene respuestas sobre requisitos o normativa y no tiene aprobación editorial de la Escuela.

Los casos están versionados en `api/_lib/fixtures/scope-contract.js`, con identificador estable, consulta, historial cuando corresponde y resultado esperado. Las etiquetas distinguen admisión a RAG, rechazo fijo y aclaración. **Admitir a RAG no prueba que haya información suficiente para responder.**

| Grupo | Casos | Qué examina |
| --- | ---: | --- |
| Administración | 16 | Inscripción, formularios, notas, contactos y navegación administrativa de plataformas. |
| Tareas/tutorías | 12 | Peticiones imperativas e indirectas de código, entregables o enseñanza técnica. |
| Consultas mixtas | 6 | Combinaciones de trámites y solicitudes de tareas, que deben rechazarse completas. |
| Contexto | 6 | Seguimientos, cortesías intermedias, cambio de tema y una pregunta ajena que menciona la identidad estudiantil. |

## Hallazgos corregidos

Antes de los cambios de esta revisión, **24 de 40** casos coincidían con el contrato. Las 16 discrepancias se distribuyeron así:

- Cinco trámites legítimos se rechazaban como tareas: por ejemplo, «Ayúdame a inscribir el ramo de Desarrollo Web» y «Explícame cómo subir mi tarea a Canvas».
- Nueve consultas que debían rechazarse o aclararse se admitían a RAG. Incluían «Quiero aprender Python, soy alumno UDP», una solicitud mixta de escribir un informe y un seguimiento de una petición indirecta de página HTML.
- Dos tutorías recibían aclaración en vez del rechazo previsto. Estas dos discrepancias no habilitaban IA, pero incumplían el mensaje acordado.

La detección ahora distingue operaciones administrativas concretas de la elaboración de tareas. Solo neutraliza el fragmento administrativo reconocido durante el análisis de intención; sigue examinando el resto de la solicitud. «Inscribir Cálculo y resuelve esta integral» conserva el rechazo. La consulta original sigue siendo la que se usa para buscar información cuando se admite.

También se detectan algunas formas indirectas («necesito una página», «quiero aprender», «qué es una derivada») y referencias como «puedes escribirlo por mí». Presentarse como alumno UDP, en la formulación cubierta, no basta para admitir una pregunta ajena.

## Resultado y reproducción

**40 de 40 casos coinciden** después de las correcciones. Este es un resultado sobre el mismo conjunto utilizado para encontrar y corregir errores; no mide generalización a consultas desconocidas.

```sh
npm run test:scope
npm test
```

La suite completa tiene **196 pruebas aprobadas**. Incluye dos verificaciones de integración que recorren este conjunto: los 22 casos de rechazo/aclaración terminan sin llamadas remotas y los 18 casos admitidos llegan a recuperación y generación protegida con proveedores simulados. Las respuestas anteriores del asistente no se reutilizan como evidencia.

No se usaron credenciales reales ni se consultaron Ollama o Supabase reales. Los tipos y el build siguen pendientes de instalar las dependencias; el registro npm no es accesible desde este entorno. Las pruebas de Node funcionan sin esas dependencias.

## Evaluación pendiente con la Escuela

El corpus de 200 consultas propuesto en la etapa 0 sigue pendiente. Debe incluir ejemplos independientes de estos ajustes, etiquetas revisadas por personas responsables del servicio y referencias documentales aprobadas para las respuestas institucionales. Separar el conjunto de desarrollo del conjunto final de evaluación y conservar ambos versionados.

Antes de ampliar la generación, evaluar especialmente formulaciones no cubiertas, múltiples trámites en una consulta, tutorías no técnicas, errores de escritura, preguntas mixtas, referencias entre turnos y diferencias de carrera/malla. Medir por separado falsos rechazos, admisiones fuera de alcance, recuperación de evidencia y afirmaciones sin respaldo.

Las reglas siguen siendo finitas. Ningún porcentaje de este conjunto garantiza ausencia universal de alucinaciones. Para impedir generación durante un incidente, está disponible `CHAT_RESPONSE_MODE=static`; para requisitos críticos siguen pendientes las fichas institucionales revisadas del plan.
