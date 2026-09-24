-- Migración: scraping incremental y versionado del corpus
-- Ejecutar manualmente en el SQL Editor de Supabase. Es aditiva: el código
-- anterior sigue funcionando, y el nuevo funciona sin ella (solo pierde el modo
-- incremental y el historial, con un aviso en el log del scraper).
--
-- ── Qué resuelve ────────────────────────────────────────────────────────────
-- 1. Antes cada ejecución re-embebía las 57 páginas aunque ninguna hubiera
--    cambiado. `eit_paginas` guarda el hash del texto limpio (y ETag /
--    Last-Modified) por URL y espacio vectorial: si nada cambió, no se llama al
--    modelo de embeddings ni se reescribe eit_docs.
-- 2. No había registro de QUÉ decía el sitio oficial en una fecha dada.
--    `eit_paginas_historial` guarda cada versión distinta del texto ingerido,
--    con su batch_id: una respuesta se puede rastrear hasta la versión exacta
--    del documento que se usó como evidencia.

create table if not exists eit_paginas (
  url text not null,
  embedding_model text not null,
  content_hash text not null,
  etag text,
  last_modified text,
  chunks int not null,
  batch_id uuid not null,
  pipeline_version text not null,
  checked_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  primary key (url, embedding_model)
);

create table if not exists eit_paginas_historial (
  id bigint generated always as identity primary key,
  url text not null,
  embedding_model text not null,
  content_hash text not null,
  contenido text not null,
  chunks int not null,
  batch_id uuid not null,
  captured_at timestamptz not null default now()
);

create index if not exists idx_eit_paginas_historial_url
  on eit_paginas_historial (url, captured_at desc);

-- Sin políticas: solo la service key (servidor y scraper) puede leer o escribir.
-- La anon key pública del proyecto queda sin acceso a estas tablas.
alter table eit_paginas enable row level security;
alter table eit_paginas_historial enable row level security;

-- ── Consultas útiles ────────────────────────────────────────────────────────
-- Páginas que cambiaron en los últimos 7 días:
--   select url, changed_at from eit_paginas
--   where changed_at > now() - interval '7 days' order by changed_at desc;
--
-- Versiones de una página:
--   select captured_at, content_hash, chunks from eit_paginas_historial
--   where url = 'https://eit.udp.cl/asuntos-estudiantiles/practicas/'
--   order by captured_at desc;
