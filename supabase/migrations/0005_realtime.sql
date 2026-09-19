-- =====================================================================
-- 0005_realtime.sql — live job feed
-- The client subscribes to its own generations; status writes made by the
-- server are pushed to the browser, so no polling loop is needed.
-- =====================================================================

-- full row on UPDATE/DELETE payloads so filters and optimistic merges work
alter table public.generations replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'generations'
  ) then
    alter publication supabase_realtime add table public.generations;
  end if;
end
$$;
