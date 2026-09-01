-- Migración: threshold de similitud en buscar_docs
-- Ejecutar manualmente en el SQL Editor de Supabase antes de desplegar
-- los cambios de api/_lib/rag.js (Tarea 4.1).
--
-- IMPORTANTE: esta definición asume la firma estándar de un RPC de
-- búsqueda semántica sobre pgvector para la tabla `eit_docs` (columnas:
-- id, url, escuela, seccion, titulo, contenido, embedding vector(768),
-- batch_id). Si tu función `buscar_docs` original tiene columnas o
-- nombres distintos, ajusta el SELECT antes de ejecutar este script.
-- Puedes ver la definición actual con:
--   select pg_get_functiondef(oid) from pg_proc where proname = 'buscar_docs';

create or replace function buscar_docs(
  query_embedding vector(768),
  match_count int default 5,
  match_threshold float default 0.65
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
    1 - (eit_docs.embedding <=> query_embedding) as similitud
  from eit_docs
  where 1 - (eit_docs.embedding <=> query_embedding) >= match_threshold
  order by eit_docs.embedding <=> query_embedding
  limit match_count;
$$;
