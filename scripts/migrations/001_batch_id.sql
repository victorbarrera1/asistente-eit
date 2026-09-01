-- Migración: ingestión versionada/atómica para eit_docs
-- Ejecutar manualmente en el SQL Editor de Supabase antes de desplegar
-- los cambios de api/_lib/scrape.js (Tarea 3.1).
--
-- Contexto: el scraper ahora inserta cada nueva versión de una página bajo
-- un batch_id (UUID) único. Solo tras verificar que todos los chunks del
-- batch nuevo se insertaron correctamente, se eliminan las filas del batch
-- anterior para esa URL. Esto evita la ventana de "sin datos" que existía
-- con el DELETE-antes-de-INSERT anterior.

-- 1. Agregar la columna batch_id. Se usa un valor por defecto para que las
--    filas existentes (de antes de esta migración) queden agrupadas bajo un
--    único batch "legacy" y no se traten como huérfanas.
alter table eit_docs
  add column if not exists batch_id uuid not null default gen_random_uuid();

-- 2. Backfill: agrupar todas las filas existentes de una misma URL bajo el
--    mismo batch_id (para que la primera ejecución del scraper post-migración
--    las reemplace como una unidad coherente, en vez de tratarlas como
--    batches individuales por fila).
with legacy_batches as (
  select url, gen_random_uuid() as batch_id
  from eit_docs
  group by url
)
update eit_docs d
set batch_id = lb.batch_id
from legacy_batches lb
where d.url = lb.url;

-- 3. Índice compuesto para acelerar las consultas de count/delete por (url, batch_id).
create index if not exists idx_eit_docs_url_batch on eit_docs (url, batch_id);
