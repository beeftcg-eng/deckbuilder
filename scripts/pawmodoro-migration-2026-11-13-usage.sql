-- Brewhouse 0.56: run once in the Pawmodoro Supabase project (SQL Editor), then copy the same
-- changes into Pawmodoro's supabase/schema.sql. Safe to run more than once.
--
-- Anonymous usage counts (src/shared/usage.ts), sent only by people who ticked "Share anonymous
-- usage counts". One row per day, feature, platform and app version, with how many times it was used
-- that day, added up across everyone: no account, device id, deck, card or anything typed. Until this
-- runs the server refuses them, and the apps keep their counts (up to 30 days) and try again.
--
-- To read them (only from the dashboard; the anon key can't):
--   select feature, sum(uses) from deckbuilder_usage where day > current_date - 30 group by 1 order by 2 desc;

create table if not exists deckbuilder_usage (
  day date not null,
  feature text not null check (feature ~ '^[a-z][a-z0-9:.-]{0,63}$'),
  platform text not null check (platform in ('desktop', 'web')),
  version text not null check (version ~ '^[0-9a-z.+-]{1,32}$'),
  uses integer not null default 0 check (uses >= 0),
  primary key (day, feature, platform, version)
);

alter table deckbuilder_usage enable row level security;
-- No policies: nobody reads or writes the table directly with the anon key; only the function below adds to it.

create or replace function deckbuilder_record_usage(p_day date, p_platform text, p_version text, p_counts jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  -- A day within the last month (the apps keep at most 30 days), at most 200 features a send,
  -- each counted at most 5000 times a day: one device can't swamp the numbers.
  if p_day < current_date - 31 or p_day > current_date + 1 then return; end if;
  if jsonb_typeof(p_counts) <> 'object' then return; end if;
  if (select count(*) from jsonb_object_keys(p_counts)) > 200 then return; end if;
  for k, v in select * from jsonb_each(p_counts) loop
    if jsonb_typeof(v) <> 'number' or k !~ '^[a-z][a-z0-9:.-]{0,63}$' then continue; end if;
    insert into deckbuilder_usage (day, feature, platform, version, uses)
    values (p_day, k, p_platform, p_version, least(greatest((v #>> '{}')::numeric, 0), 5000)::integer)
    on conflict (day, feature, platform, version) do update set uses = deckbuilder_usage.uses + excluded.uses;
  end loop;
end;
$$;

revoke all on function deckbuilder_record_usage(date, text, text, jsonb) from public;
grant execute on function deckbuilder_record_usage(date, text, text, jsonb) to anon, authenticated;
