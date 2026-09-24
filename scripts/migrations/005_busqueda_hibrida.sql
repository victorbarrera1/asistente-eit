-- Migración: búsqueda híbrida (semántica + léxica) con Reciprocal Rank Fusion
-- Ejecutar manualmente en el SQL Editor de Supabase. Aditiva: si la función no
-- existe, api/_lib/rag.js vuelve solo a buscar_docs_v2 y lo avisa en el log.
--
-- ── Por qué ─────────────────────────────────────────────────────────────────
-- La búsqueda vectorial entiende paráfrasis ("echarse un ramo" ≈ "reprobar"),
-- pero es débil con términos exactos: códigos de asignatura (CIT-2000), siglas
-- (DAE, TNE, CDAI), nombres propios. La búsqueda de texto completo de Postgres
-- es exactamente lo contrario. RRF combina ambos rankings sin tener que calibrar
-- sus puntajes, que viven en escalas distintas:
--     rrf(d) = Σ 1 / (k + rango_en_cada_lista(d)),  k = 60
--
-- ── Salvaguarda ─────────────────────────────────────────────────────────────
-- Un documento que solo coincide léxicamente ("ramo" aparece en media web) NO
-- entra si su similitud semántica es menor a `lexical_floor`. Sin esto, una
-- palabra común bastaría para "encontrar evidencia" y el asistente dejaría de
-- abstenerse cuando corresponde.

-- Normalización de acentos inmutable (requisito de las columnas generadas).
-- Se usa translate() y no la extensión unaccent para no depender del esquema en
-- que Supabase la instale. La ñ se conserva a propósito ("año" ≠ "ano").
create or replace function eit_normalizar(t text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(lower(coalesce(t, '')), 'áéíóúüàèìòù', 'aeiouuaeiou')
$$;

alter table eit_docs add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('spanish', eit_normalizar(titulo)), 'A') ||
    setweight(to_tsvector('spanish', eit_normalizar(contenido)), 'B')
  ) stored;

create index if not exists idx_eit_docs_fts on eit_docs using gin (fts);

create or replace function buscar_docs_hibrido(
  query_embedding vector(1024),
  query_text text,
  match_count int default 5,
  match_threshold float default 0.55,
  p_embed_model text default 'bge-m3',
  lexical_floor float default 0.40,
  rrf_k int default 60
)
returns table (
  id bigint,
  url text,
  escuela text,
  seccion text,
  titulo text,
  contenido text,
  similitud float,
  rrf_score float,
  fuente text
)
language sql
stable
as $$
  with q as (
    select websearch_to_tsquery('spanish', eit_normalizar(query_text)) as tsq
  ),
  semantica as (
    select d.id,
           row_number() over (order by d.embedding_1024 <=> query_embedding) as rango
    from eit_docs d
    where d.embedding_model = p_embed_model
      and d.embedding_1024 is not null
      and 1 - (d.embedding_1024 <=> query_embedding) >= match_threshold
    order by d.embedding_1024 <=> query_embedding
    limit match_count * 4
  ),
  lexica as (
    select d.id,
           row_number() over (order by ts_rank_cd(d.fts, q.tsq) desc) as rango
    from eit_docs d, q
    where d.embedding_model = p_embed_model
      and d.embedding_1024 is not null
      and d.fts @@ q.tsq
      and 1 - (d.embedding_1024 <=> query_embedding) >= lexical_floor
    order by ts_rank_cd(d.fts, q.tsq) desc
    limit match_count * 4
  ),
  fusion as (
    select coalesce(s.id, l.id) as id,
           coalesce(1.0 / (rrf_k + s.rango), 0) + coalesce(1.0 / (rrf_k + l.rango), 0) as rrf_score,
           case
             when s.id is not null and l.id is not null then 'ambas'
             when s.id is not null then 'semantica'
             else 'lexica'
           end as fuente
    from semantica s
    full outer join lexica l on s.id = l.id
  )
  select d.id, d.url, d.escuela, d.seccion, d.titulo, d.contenido,
         1 - (d.embedding_1024 <=> query_embedding) as similitud,
         f.rrf_score::float,
         f.fuente
  from fusion f
  join eit_docs d on d.id = f.id
  order by f.rrf_score desc
  limit match_count;
$$;

-- ── Verificación ────────────────────────────────────────────────────────────
-- La columna fts debe estar poblada en todas las filas:
--   select count(*) filter (where fts is null) as sin_fts, count(*) from eit_docs;
-- Qué tan bien encuentra un término exacto:
--   select titulo, ts_rank_cd(fts, websearch_to_tsquery('spanish', eit_normalizar('toma de ramos')))
--   from eit_docs where fts @@ websearch_to_tsquery('spanish', eit_normalizar('toma de ramos'))
--   order by 2 desc limit 5;
