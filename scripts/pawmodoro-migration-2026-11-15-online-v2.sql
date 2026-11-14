-- Brewhouse 0.60: run once in the Pawmodoro Supabase project (SQL Editor), after the 2026-11-13 and
-- 2026-11-14 ones, then copy the same changes into Pawmodoro's supabase/schema.sql. Safe to run more
-- than once.
--
-- 1. deckbuilder_server_version(): which Brewhouse updates the server has, so the app can say which
--    one to run instead of failing with a database error (src/shared/serverVersion.ts). This file is 3.
-- 2. Private hands in online practice games (src/shared/practice/online.ts): each player's hand, deck
--    and face-down cards are kept apart from the shared board, and the server only ever gives a
--    player their own. A card one player puts into the other's hand (returning their unit, say)
--    travels as a "gift" that only its new owner receives.

create or replace function deckbuilder_server_version() returns integer
language sql immutable as $$ select 3 $$;
grant execute on function deckbuilder_server_version() to anon, authenticated;

alter table deckbuilder_practice_games add column if not exists host_private text;
alter table deckbuilder_practice_games add column if not exists guest_private text;
alter table deckbuilder_practice_games add column if not exists host_gifts jsonb not null default '[]';
alter table deckbuilder_practice_games add column if not exists guest_gifts jsonb not null default '[]';

-- The board, this player's private cards, and cards given to them since (then cleared).
create or replace function deckbuilder_practice_get2(p_code text, p_secret text, p_since integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g deckbuilder_practice_games;
  host boolean;
  gifts jsonb;
begin
  select * into g from deckbuilder_practice_games where code = p_code for update;
  if not found or (g.host_secret <> p_secret and coalesce(g.guest_secret, '') <> p_secret) then raise exception 'no such game'; end if;
  host := g.host_secret = p_secret;
  gifts := case when host then g.host_gifts else g.guest_gifts end;
  if jsonb_array_length(gifts) > 0 then
    if host then update deckbuilder_practice_games set host_gifts = '[]' where code = p_code;
    else update deckbuilder_practice_games set guest_gifts = '[]' where code = p_code; end if;
  end if;
  return jsonb_build_object(
    'seq', g.seq,
    'state', case when g.seq > p_since then g.state else null end,
    'private', case when host then g.host_private else g.guest_private end,
    'gifts', gifts,
    'host_name', g.host_name,
    'guest_name', g.guest_name,
    'guest_deck', g.guest_deck
  );
end;
$$;

-- A move: the shared board, this player's private cards, and any cards given to the other player.
-- Returns the new state number, or -1 when the other player moved in between.
create or replace function deckbuilder_practice_push2(p_code text, p_secret text, p_seq integer, p_state text, p_private text, p_gifts jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  g deckbuilder_practice_games;
  host boolean;
begin
  select * into g from deckbuilder_practice_games where code = p_code for update;
  if not found or (g.host_secret <> p_secret and coalesce(g.guest_secret, '') <> p_secret) then raise exception 'no such game'; end if;
  if length(p_state) > 2000000 or length(coalesce(p_private, '')) > 200000 or jsonb_array_length(coalesce(p_gifts, '[]')) > 40 then raise exception 'too large'; end if;
  if g.seq <> p_seq then return -1; end if;
  host := g.host_secret = p_secret;
  update deckbuilder_practice_games set
    seq = seq + 1,
    state = p_state,
    host_private = case when host then p_private else host_private end,
    guest_private = case when host then guest_private else p_private end,
    guest_gifts = case when host then guest_gifts || coalesce(p_gifts, '[]') else guest_gifts end,
    host_gifts = case when host then host_gifts else host_gifts || coalesce(p_gifts, '[]') end,
    updated_at = now()
  where code = p_code;
  return g.seq + 1;
end;
$$;

-- The guest's own cards, set once they've shuffled and dealt them (the host never sees them).
create or replace function deckbuilder_practice_set_private(p_code text, p_secret text, p_private text) returns void
language plpgsql security definer set search_path = public as $$
declare
  g deckbuilder_practice_games;
begin
  select * into g from deckbuilder_practice_games where code = p_code for update;
  if not found or (g.host_secret <> p_secret and coalesce(g.guest_secret, '') <> p_secret) then raise exception 'no such game'; end if;
  if length(coalesce(p_private, '')) > 200000 then raise exception 'too large'; end if;
  if g.host_secret = p_secret then update deckbuilder_practice_games set host_private = p_private, updated_at = now() where code = p_code;
  else update deckbuilder_practice_games set guest_private = p_private, updated_at = now() where code = p_code; end if;
end;
$$;

revoke all on function deckbuilder_practice_get2(text, text, integer) from public;
revoke all on function deckbuilder_practice_push2(text, text, integer, text, text, jsonb) from public;
revoke all on function deckbuilder_practice_set_private(text, text, text) from public;
grant execute on function deckbuilder_practice_get2(text, text, integer) to anon, authenticated;
grant execute on function deckbuilder_practice_push2(text, text, integer, text, text, jsonb) to anon, authenticated;
grant execute on function deckbuilder_practice_set_private(text, text, text) to anon, authenticated;
