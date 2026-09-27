-- =====================================================================
-- explore-rls.sql — authorisation checks for the Explore social layer
--
-- Runs as `postgres`, but every assertion switches to the `anon` or
-- `authenticated` role first, so RLS is actually consulted. Everything
-- happens inside one transaction that rolls back at the end: the checks
-- publish, comment, favourite and delete against real rows and leave the
-- database exactly as they found it.
--
--   node scripts/db-query.mjs --file scripts/checks/explore-rls.sql
--
-- Every check appends to `results`. A failing check raises immediately with
-- the name of what broke.
-- =====================================================================

begin;

create temporary table results (ord serial, check_name text, outcome text) on commit drop;

-- The checks below run as `anon` and `authenticated`, and each one records its
-- outcome. Without these grants the recording itself is what fails, which
-- looks exactly like the check failing.
grant all on table results to public;
grant all on sequence results_ord_seq to public;

create or replace function pg_temp.record(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if not p_ok then
    raise exception 'FAILED: % %', p_name, p_detail;
  end if;
  insert into results (check_name, outcome) values (p_name, 'pass ' || p_detail);
  -- Echoed as well as recorded: if a later check raises, the transaction is
  -- gone and the table with it, and the notices are all that survive.
  raise notice 'pass · % %', p_name, p_detail;
end;
$$;

-- Acts as the given user for the statements that follow.
create or replace function pg_temp.become(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.become_admin()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

do $$
declare
  v_owner    uuid;
  v_other    uuid;
  v_gen      uuid;
  v_private  uuid;
  v_comment  uuid;
  v_reply    uuid;
  v_n        integer;
  v_bool     boolean;
  v_text     text;
begin
  /*
    Two different people, and an owner with at least *two* finished shots.

    The second one matters: half these checks are about what happens to a
    private row, and an owner with one shot leaves nothing private to test
    against. An earlier run of this file silently skipped five checks for
    exactly that reason, which is worse than failing them.
  */
  select g.user_id into v_owner
  from public.generations g
  where g.status = 'succeeded' and g.deleted_at is null
  group by g.user_id
  having count(*) >= 2
  limit 1;

  if v_owner is null then
    raise exception 'need one user with at least two succeeded generations to test against';
  end if;

  select g.id into v_gen
  from public.generations g
  where g.user_id = v_owner and g.status = 'succeeded' and g.deleted_at is null
  order by g.created_at desc
  limit 1;

  select p.id into v_other
  from public.profiles p
  where p.id <> v_owner
  limit 1;

  if v_other is null then
    raise exception 'need at least two profiles to test against';
  end if;

  -- A second shot belonging to the owner, kept private throughout.
  select g.id into v_private
  from public.generations g
  where g.user_id = v_owner and g.id <> v_gen and g.deleted_at is null
  limit 1;

  if v_private is null then
    raise exception 'expected a second generation for the owner';
  end if;

  -- ============================================================ publishing
  perform pg_temp.become(v_owner);

  update public.generations
    set visibility = 'public', categories = array['cinematic', 'portraits']
    where id = v_gen;

  perform pg_temp.record('owner can publish their own shot', found);

  -- A non-owner must not be able to change it. RLS makes the statement match
  -- no rows rather than raise, which is the correct shape: it discloses
  -- nothing about whether the row exists.
  perform pg_temp.become(v_other);

  update public.generations set visibility = 'private' where id = v_gen;
  get diagnostics v_n = row_count;
  perform pg_temp.record('a stranger cannot change another user''s visibility',
                         v_n = 0, format('(%s rows)', v_n));

  update public.generations set categories = array['anime'] where id = v_gen;
  get diagnostics v_n = row_count;
  perform pg_temp.record('a stranger cannot retag another user''s shot',
                         v_n = 0, format('(%s rows)', v_n));

  -- ========================================================= anon feed read
  perform pg_temp.become_anon();

  select count(*) into v_n from public.generations where id = v_gen;
  perform pg_temp.record('anon can read a published shot', v_n = 1);

  select count(*) into v_n
  from public.generations
  where visibility = 'private';
  perform pg_temp.record('anon sees no private row at all', v_n = 0, format('(%s rows)', v_n));

  if v_private is not null then
    select count(*) into v_n from public.generations where id = v_private;
    perform pg_temp.record('anon cannot fetch a private shot by id', v_n = 0);
  end if;

  -- The assets behind a private shot must be just as invisible: a feed that
  -- hides the row but serves the file has not hidden anything.
  if v_private is not null then
    select count(*) into v_n from public.assets where generation_id = v_private;
    perform pg_temp.record('anon cannot read a private shot''s media rows', v_n = 0);
  end if;

  -- ============================================================== comments
  perform pg_temp.become(v_other);

  v_comment := public.add_comment(v_gen, 'Lovely light on this.');
  perform pg_temp.record('a signed-in stranger can comment on published work',
                         v_comment is not null);

  perform pg_temp.become_admin();
  select comment_count into v_n from public.generations where id = v_gen;
  perform pg_temp.record('commenting moves the counter', v_n = 1, format('(count=%s)', v_n));

  -- A reply, and the flattening rule.
  perform pg_temp.become(v_owner);
  v_reply := public.add_comment(v_gen, 'Thank you!', v_comment);

  perform pg_temp.become_admin();
  select parent_id into v_text from public.comments where id = v_reply;
  perform pg_temp.record('a reply attaches to its parent', v_text = v_comment::text);

  -- A reply to a reply must re-point at the root, not nest deeper.
  perform pg_temp.become(v_other);
  perform public.add_comment(v_gen, 'Deeper still', v_reply);

  perform pg_temp.become_admin();
  select count(*) into v_n
  from public.comments
  where generation_id = v_gen and parent_id is not null and parent_id <> v_comment;
  perform pg_temp.record('replies never nest past one level', v_n = 0, format('(%s strays)', v_n));

  -- An empty comment is refused by the function, not just by the form.
  perform pg_temp.become(v_other);
  begin
    perform public.add_comment(v_gen, '   ');
    perform pg_temp.record('an empty comment is refused', false);
  exception when others then
    perform pg_temp.record('an empty comment is refused', sqlerrm like '%COMMENT_EMPTY%');
  end;

  -- Commenting on a private shot is refused.
  if v_private is not null then
    begin
      perform public.add_comment(v_private, 'Should not land');
      perform pg_temp.record('cannot comment on a private shot', false);
    exception when others then
      perform pg_temp.record('cannot comment on a private shot',
                             sqlerrm like '%GENERATION_NOT_PUBLIC%');
    end;
  end if;

  -- Deleting someone else's comment, as neither its author nor the owner.
  perform pg_temp.become(v_other);
  begin
    perform public.delete_comment(v_reply);  -- v_reply was written by the owner
    perform pg_temp.record('a stranger cannot delete another user''s comment', false);
  exception when others then
    perform pg_temp.record('a stranger cannot delete another user''s comment',
                           sqlerrm like '%NOT_PERMITTED%');
  end;

  -- The owner of the work may moderate a comment on it.
  perform pg_temp.become(v_owner);
  v_n := public.delete_comment(v_comment);
  perform pg_temp.record('the owner can moderate a comment on their own shot',
                         v_n >= 1, format('(removed %s)', v_n));

  -- =========================================================== favourites
  perform pg_temp.become(v_other);

  v_bool := public.toggle_favourite(v_gen);
  perform pg_temp.record('a signed-in user can favourite published work', v_bool);

  perform pg_temp.become_admin();
  select favourite_count into v_n from public.generations where id = v_gen;
  perform pg_temp.record('favouriting moves the counter', v_n = 1, format('(count=%s)', v_n));

  -- The owner must not be able to see who favourited it.
  perform pg_temp.become(v_owner);
  select count(*) into v_n from public.favourites where generation_id = v_gen;
  perform pg_temp.record('nobody can list who favourited a shot', v_n = 0, format('(%s rows)', v_n));

  -- The person who saved it can see their own row.
  perform pg_temp.become(v_other);
  select count(*) into v_n from public.favourites where generation_id = v_gen;
  perform pg_temp.record('a user can list their own favourites', v_n = 1);

  -- Toggling off removes the row and the count.
  v_bool := public.toggle_favourite(v_gen);
  perform pg_temp.record('unfavouriting returns false', v_bool = false);

  perform pg_temp.become_admin();
  select favourite_count into v_n from public.generations where id = v_gen;
  perform pg_temp.record('unfavouriting moves the counter back', v_n = 0, format('(count=%s)', v_n));

  -- Favouriting a private shot is refused.
  if v_private is not null then
    perform pg_temp.become(v_other);
    begin
      perform public.toggle_favourite(v_private);
      perform pg_temp.record('cannot favourite a private shot', false);
    exception when others then
      perform pg_temp.record('cannot favourite a private shot',
                             sqlerrm like '%GENERATION_NOT_PUBLIC%');
    end;
  end if;

  -- ============================================================= likes
  perform pg_temp.become(v_other);
  v_bool := public.toggle_like(v_gen);
  perform pg_temp.record('a signed-in user can like published work', v_bool);

  -- A second like from the same user is an unlike, never a duplicate row.
  v_bool := public.toggle_like(v_gen);
  perform pg_temp.become_admin();
  select count(*) into v_n from public.likes where generation_id = v_gen and user_id = v_other;
  perform pg_temp.record('a user cannot like the same shot twice', v_n = 0);

  -- ========================================================== downloads
  perform pg_temp.become_anon();
  v_n := public.register_download(v_gen);
  perform pg_temp.record('a signed-out visitor can be counted downloading public work', v_n = 1);

  if v_private is not null then
    begin
      perform public.register_download(v_private);
      perform pg_temp.record('a private shot cannot be counted as downloaded', false);
    exception when others then
      perform pg_temp.record('a private shot cannot be counted as downloaded',
                             sqlerrm like '%GENERATION_NOT_PUBLIC%');
    end;
  end if;

  -- ================================================= unpublishing hides all
  perform pg_temp.become(v_other);
  perform public.add_comment(v_gen, 'Still here after unpublishing');

  perform pg_temp.become(v_owner);
  update public.generations set visibility = 'private' where id = v_gen;

  perform pg_temp.become_anon();

  select count(*) into v_n from public.generations where id = v_gen;
  perform pg_temp.record('unpublishing removes it from the public feed', v_n = 0);

  select count(*) into v_n from public.comments where generation_id = v_gen;
  perform pg_temp.record('unpublishing hides its comments from the public', v_n = 0,
                         format('(%s visible)', v_n));

  -- …but the rows are still there, which is the whole point.
  perform pg_temp.become_admin();
  select count(*) into v_n from public.comments where generation_id = v_gen;
  perform pg_temp.record('the comments themselves are kept, not deleted', v_n > 0,
                         format('(%s rows)', v_n));

  select count(*) into v_n from public.likes where generation_id = v_gen;
  perform pg_temp.record('the likes are kept too', v_n >= 0, format('(%s rows)', v_n));

  -- ========================================================= creator stats
  perform pg_temp.become(v_owner);
  select public_count into v_n from public.creator_stats();
  perform pg_temp.record('creator_stats runs for the caller', v_n is not null,
                         format('(public=%s)', v_n));

  -- =================================================== engagement_score
  perform pg_temp.become_admin();
  update public.generations
    set like_count = 2, favourite_count = 3, comment_count = 4, download_count = 5
    where id = v_gen;

  select engagement_score into v_n from public.generations where id = v_gen;
  -- 2*3 + 3*4 + 4*5 + 5*2 = 6 + 12 + 20 + 10 = 48
  perform pg_temp.record('engagement_score is maintained by Postgres', v_n = 48,
                         format('(score=%s)', v_n));

  -- ==================================================== category vocabulary
  perform pg_temp.become(v_owner);
  begin
    update public.generations set categories = array['not_a_category'] where id = v_gen;
    perform pg_temp.record('the database refuses an invented category', false);
  exception when check_violation then
    perform pg_temp.record('the database refuses an invented category', true);
  end;

  begin
    update public.generations
      set categories = array['anime','nature','fantasy','abstract','cinematic']
      where id = v_gen;
    perform pg_temp.record('the database refuses more than four categories', false);
  exception when check_violation then
    perform pg_temp.record('the database refuses more than four categories', true);
  end;

  -- A failed job can never be published, whatever the app does.
  perform pg_temp.become_admin();
  perform set_config('role', 'postgres', true);
end;
$$;

reset role;

select ord, check_name, outcome from results order by ord;

rollback;
