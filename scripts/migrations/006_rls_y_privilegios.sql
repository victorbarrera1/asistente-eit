-- Migración: cerrar el acceso público a los datos (RLS + privilegios mínimos)
-- Ejecutar manualmente en el SQL Editor de Supabase. Idempotente: se puede
-- correr más de una vez y omite lo que no exista.
--
-- ── Por qué ─────────────────────────────────────────────────────────────────
-- Supabase publica todas las tablas de `public` a través de PostgREST. La
-- aplicación usa solo la service key (que ignora RLS), pero la `anon key` del
-- proyecto NO es secreta: está pensada para ir en frontends y aparece en el
-- dashboard. Si una tabla no tiene RLS, esa clave basta para leer las preguntas
-- y comentarios de los estudiantes, borrar el feedback o insertar documentos
-- falsos en eit_docs (envenenar el corpus del asistente).
--
-- Esta migración deja todo accesible SOLO para service_role:
--   1. Activa RLS sin políticas en cada tabla → anon/authenticated ven 0 filas.
--   2. Revoca los privilegios de tabla a anon/authenticated (segunda barrera).
--   3. Revoca la ejecución de las funciones RPC a anon/authenticated: sin esto,
--      cualquiera podría invocar buscar_docs_* y usar tu base como servicio.
--
-- ── Verificación ─────────────────────────────────────────────────────────────
-- Tras aplicarla, esto debe devolver 401/403 o una lista vacía:
--   curl "$SUPABASE_URL/rest/v1/preguntas_log?select=*" -H "apikey: <ANON_KEY>"
-- Y el asistente debe seguir respondiendo (usa la service key).

do $$
declare
  t text;
  tablas text[] := array[
    'eit_docs',
    'eit_paginas',
    'eit_paginas_historial',
    'preguntas_log',
    'feedback',
    'satisfaction_feedback',
    'avisos_urgentes'
  ];
begin
  foreach t in array tablas loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant all on table public.%I to service_role', t);
      raise notice 'RLS activo y privilegios cerrados en %', t;
    end if;
  end loop;
end $$;

-- Secuencias de columnas identity/serial (inserción directa con anon).
do $$
declare
  s record;
begin
  for s in
    select c.oid::regclass as seq
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname = 'public'
  loop
    execute format('revoke all on sequence %s from anon, authenticated', s.seq);
  end loop;
end $$;

-- Funciones de búsqueda y normalización: solo service_role.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('buscar_docs', 'buscar_docs_v2', 'buscar_docs_hibrido', 'eit_normalizar')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    raise notice 'Ejecución restringida: %', f.sig;
  end loop;
end $$;

-- Funciones que se creen después (migraciones futuras) tampoco quedan públicas.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ── Auditoría: tablas de public que siguen sin RLS (debería quedar vacío) ────
--   select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
