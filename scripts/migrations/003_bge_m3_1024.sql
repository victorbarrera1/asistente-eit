-- Migración: embeddings bge-m3 (1024 dims) + guardrail de modelo
-- Ejecutar manualmente en el SQL Editor de Supabase ANTES de desplegar los
-- cambios de api/_lib/rag.js y api/_lib/scrape.js.
--
-- ── Por qué existe esta migración ───────────────────────────────────────────
-- Al migrar de Gemini a Ollama se cambió el modelo de embeddings a
-- nomic-embed-text, que también produce 768 dimensiones. La columna
-- `embedding vector(768)` aceptó los vectores nuevos sin quejarse, pero los
-- vectores YA ALMACENADOS venían de gemini-embedding-2. Vectores de modelos
-- distintos viven en espacios distintos: la similitud coseno entre ellos es
-- ruido, no significado. El resultado fue un retrieval roto que nunca lanzó
-- un error — sólo dejó de encontrar cosas.
--
-- Para que eso no pueda repetirse, esta migración agrega `embedding_model` a
-- cada fila y `buscar_docs_v2` filtra por él. Si el modelo configurado en la
-- app no coincide con el de los datos, el resultado son CERO filas — un fallo
-- explicable — en vez de un ranking de basura.
--
-- ── Estrategia: aditiva, nunca destructiva ──────────────────────────────────
-- Se agregan columnas nuevas y una función nueva. La columna `embedding`
-- (768) y la función `buscar_docs` quedan intactas, así que:
--   * el código actualmente desplegado sigue funcionando durante la migración
--   * el rollback es volver a desplegar el código viejo, sin tocar la BD
-- Una vez validado el corte, la limpieza opcional está al final del archivo.

-- ── 1. Columnas nuevas ──────────────────────────────────────────────────────
alter table eit_docs add column if not exists embedding_1024 vector(1024);
alter table eit_docs add column if not exists embedding_model text;

-- La columna vieja pasa a ser opcional: las filas nuevas ya no la llenan.
-- (Si nunca tuvo NOT NULL, esto es un no-op silencioso.)
alter table eit_docs alter column embedding drop not null;

-- ── 2. Índices ──────────────────────────────────────────────────────────────
-- HNSW sobre coseno para la búsqueda vectorial. pgvector soporta hasta 2000
-- dimensiones en HNSW, así que 1024 entra sin problema.
create index if not exists idx_eit_docs_embedding_1024
  on eit_docs using hnsw (embedding_1024 vector_cosine_ops);

-- El filtro por modelo se aplica en cada búsqueda: conviene indexarlo.
create index if not exists idx_eit_docs_embed_model
  on eit_docs (embedding_model);

-- ── 3. Función de búsqueda v2 ───────────────────────────────────────────────
-- Nombre nuevo a propósito: `buscar_docs` sigue existiendo para que el código
-- desplegado hoy no se caiga mientras se aplica esta migración.
create or replace function buscar_docs_v2(
  query_embedding vector(1024),
  match_count int default 5,
  match_threshold float default 0.60,
  p_embed_model text default 'bge-m3'
)
returns table (
  id bigint,
  url text,
  escuela text,
  seccion text,
  titulo text,
  contenido text,
  similitud float
)
language sql stable
as $$
  select
    eit_docs.id,
    eit_docs.url,
    eit_docs.escuela,
    eit_docs.seccion,
    eit_docs.titulo,
    eit_docs.contenido,
    1 - (eit_docs.embedding_1024 <=> query_embedding) as similitud
  from eit_docs
  where eit_docs.embedding_model = p_embed_model
    and eit_docs.embedding_1024 is not null
    and 1 - (eit_docs.embedding_1024 <=> query_embedding) >= match_threshold
  order by eit_docs.embedding_1024 <=> query_embedding
  limit match_count;
$$;

-- ── 4. Verificación post re-scrape ──────────────────────────────────────────
-- Después de correr `npm run scrape`, esto debe mostrar SOLO 'bge-m3'.
-- Si aparece más de un modelo, la tabla tiene vectores mezclados y hay que
-- purgar y volver a scrapear:
--
--   select embedding_model, count(*)
--   from eit_docs
--   group by embedding_model;
--
-- Filas que quedaron sin migrar (deberían ser 0 tras el re-scrape):
--
--   select count(*) from eit_docs where embedding_1024 is null;

-- ── 5. Limpieza — SOLO tras validar el corte en producción ──────────────────
-- No ejecutar junto con el resto. Es el punto de no retorno: elimina la
-- posibilidad de rollback a los vectores de 768.
--
--   drop function if exists buscar_docs(vector(768), int, float);
--   alter table eit_docs drop column if exists embedding;
