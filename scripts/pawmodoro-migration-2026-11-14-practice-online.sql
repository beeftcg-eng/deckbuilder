-- Brewhouse 0.59: run once in the Pawmodoro Supabase project (SQL Editor), then copy the same
-- changes into Pawmodoro's supabase/schema.sql. Safe to run more than once.
--
-- Online practice games with a friend (src/shared/practice/online.ts). One player starts a game and
-- gets a 6-character code; the other joins with it. No account needed: each player holds a random
-- secret for the game, and every call has to bring it. The game is a packed state (cards by id; both
-- players have the card data) with a sequence number, so two moves at once can't overwrite each
-- other: a move only goes in on top of the state its player last saw. Games are deleted after 3 days.

create table if not exists deckbuilder_practice_games (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  game text not null default 'riftbound',
  host_secret text not null,
  guest_secret text,
  host_name text not null default '',
  guest_name text,
  host_deck jsonb not null,
  guest_deck jsonb,
  seq integer not null default 0,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table deckbuilder_practice_games enable row level security;
-- No policies: only the functions below read or write it.

create or replace function deckbuilder_practice_create(p_code text, p_secret text, p_name text, p_deck jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from deckbuilder_practice_games where updated_at < now() - interval '3 days';
  if length(p_secret) < 20 or pg_column_size(p_deck) > 200000 then raise exception 'invalid'; end if;
  insert into deckbuilder_practice_games (code, host_secret, host_name, host_deck) values (p_code, p_secret, left(coalesce(p_name, ''), 40), p_deck);
end;
$$;

create or replace function deckbuilder_practice_join(p_code text, p_secret text, p_name text, p_deck jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g deckbuilder_practice_games;
begin
  select * into g from deckbuilder_practice_games where code = p_code for update;
  if not found then raise exception 'no such game'; end if;
  if g.guest_secret is not null and g.guest_secret <> p_secret then raise exception 'game full'; end if;
  if length(p_secret) < 20 or pg_column_size(p_deck) > 200000 then raise exception 'invalid'; end if;
  update deckbuilder_practice_games set guest_secret = p_secret, guest_name = left(coalesce(p_name, ''), 40), guest_deck = p_deck, updated_at = now() where code = p_code;
  return jsonb_build_object('host_name', g.host_name, 'host_deck', g.host_deck);
end;
$$;

-- The game as of now for one of its players: everything when it changed after p_since, else just the number.
create or replace function deckbuilder_practice_get(p_code text, p_secret text, p_since integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g deckbuilder_practice_games;
begin
  select * into g from deckbuilder_practice_games where code = p_code;
  if not found or (g.host_secret <> p_secret and coalesce(g.guest_secret, '') <> p_secret) then raise exception 'no such game'; end if;
  return jsonb_build_object(
    'seq', g.seq,
    'state', case when g.seq > p_since then g.state else null end,
    'host_name', g.host_name,
    'guest_name', g.guest_name,
    'guest_deck', g.guest_deck
  );
end;
$$;

-- A move: the new state, on top of state number p_seq. Returns the new number, or -1 when someone
-- moved in between (the player reloads and tries again).
create or replace function deckbuilder_practice_push(p_code text, p_secret text, p_seq integer, p_state text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  g deckbuilder_practice_games;
begin
  select * into g from deckbuilder_practice_games where code = p_code for update;
  if not found or (g.host_secret <> p_secret and coalesce(g.guest_secret, '') <> p_secret) then raise exception 'no such game'; end if;
  if length(p_state) > 2000000 then raise exception 'too large'; end if;
  if g.seq <> p_seq then return -1; end if;
  update deckbuilder_practice_games set seq = seq + 1, state = p_state, updated_at = now() where code = p_code;
  return g.seq + 1;
end;
$$;

revoke all on function deckbuilder_practice_create(text, text, text, jsonb) from public;
revoke all on function deckbuilder_practice_join(text, text, text, jsonb) from public;
revoke all on function deckbuilder_practice_get(text, text, integer) from public;
revoke all on function deckbuilder_practice_push(text, text, integer, text) from public;
grant execute on function deckbuilder_practice_create(text, text, text, jsonb) to anon, authenticated;
grant execute on function deckbuilder_practice_join(text, text, text, jsonb) to anon, authenticated;
grant execute on function deckbuilder_practice_get(text, text, integer) to anon, authenticated;
grant execute on function deckbuilder_practice_push(text, text, integer, text) to anon, authenticated;
