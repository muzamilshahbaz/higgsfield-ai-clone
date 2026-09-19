-- =====================================================================
-- 0003_rls.sql — row level security
-- Reads go through the user's JWT and are governed here. Writes that
-- touch money or provider results go through the service-role client,
-- which bypasses RLS by design.
-- =====================================================================

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.presets       enable row level security;
alter table public.generations   enable row level security;
alter table public.assets        enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.likes         enable row level security;

-- ------------------------------ profiles ------------------------------
-- Strictly own-row. The Explore feed reads denormalised author columns on
-- generations instead of widening this policy.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ------------------------------ projects ------------------------------
create policy projects_select_own on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy projects_update_own on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy projects_delete_own on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------ presets -------------------------------
-- Public read-only catalog; seeded by the service role.
create policy presets_select_all on public.presets
  for select to anon, authenticated
  using (is_active);

-- ---------------------------- generations -----------------------------
create policy generations_select_own on public.generations
  for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy generations_select_public on public.generations
  for select to anon, authenticated
  using (visibility = 'public' and status = 'succeeded' and deleted_at is null);

create policy generations_insert_own on public.generations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy generations_update_own on public.generations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy generations_delete_own on public.generations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------- assets -------------------------------
create policy assets_select_own on public.assets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy assets_select_public on public.assets
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.generations g
      where g.id = assets.generation_id
        and g.visibility = 'public'
        and g.status = 'succeeded'
        and g.deleted_at is null
    )
  );

create policy assets_delete_own on public.assets
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------- credit_ledger ---------------------------
-- Read-only to the owner. Rows are written exclusively by the
-- spend_credits / refund_credits security-definer functions.
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------- likes --------------------------------
create policy likes_select_own on public.likes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = (select auth.uid()));
