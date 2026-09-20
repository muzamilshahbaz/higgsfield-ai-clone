-- =====================================================================
-- 0006_hardening.sql — close the gaps found in the Phase 6 review
--
-- Safe to re-run: every statement is CREATE OR REPLACE or guarded.
-- =====================================================================

-- ---------------------------------------------------------------------
-- toggle_like — only published work can be liked
--
-- The original accepted any generation id. `likes` is protected by RLS, but
-- the function is SECURITY DEFINER and updates `generations.like_count`
-- directly, so a caller holding a private row's uuid could move a counter on
-- a row they are not allowed to read. Nothing is disclosed by it and no money
-- moves, but a counter someone else can change is not a counter.
--
-- The lock matters as much as the check: without `for update` two concurrent
-- likes can both read the pre-existing count and both write count + 1, losing
-- one. Taking the row lock before touching `likes` serialises the pair.
-- ---------------------------------------------------------------------
create or replace function public.toggle_like(p_generation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_liked boolean;
  v_ok    boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0003';
  end if;

  -- Row-locked for the rest of the transaction, so the counter update below
  -- cannot interleave with another liker's.
  select (visibility = 'public' and status = 'succeeded' and deleted_at is null)
    into v_ok
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'GENERATION_NOT_FOUND' using errcode = 'P0004';
  end if;

  if not v_ok then
    raise exception 'GENERATION_NOT_PUBLIC' using errcode = 'P0004';
  end if;

  if exists (select 1 from public.likes where user_id = v_user and generation_id = p_generation_id) then
    delete from public.likes where user_id = v_user and generation_id = p_generation_id;
    update public.generations
      set like_count = greatest(like_count - 1, 0)
      where id = p_generation_id;
    v_liked := false;
  else
    insert into public.likes (user_id, generation_id) values (v_user, p_generation_id);
    update public.generations
      set like_count = like_count + 1
      where id = p_generation_id;
    v_liked := true;
  end if;

  return v_liked;
end;
$$;

grant execute on function public.toggle_like(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- A like on work that is later unpublished or deleted
--
-- `likes` already cascades when a generation is hard-deleted, but a soft
-- delete leaves the row and its count behind. Nothing reads a private row's
-- like_count, so this is tidiness rather than a leak — the index below is
-- what makes the Explore "top" sort cheap once there is real traffic.
-- ---------------------------------------------------------------------
create index if not exists generations_explore_top_recent_idx
  on public.generations (like_count desc, created_at desc)
  where visibility = 'public' and status = 'succeeded' and deleted_at is null;
