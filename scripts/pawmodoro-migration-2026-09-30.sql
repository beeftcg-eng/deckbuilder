-- Brewhouse 0.40: run once in the Pawmodoro Supabase project (SQL Editor), then copy the same
-- changes into Pawmodoro's supabase/schema.sql. Safe to run more than once.
--
-- 1. Copy details (finish and condition of owned copies, src/shared/copyDetails.ts) sync as
--    deckbuilder_user_items rows of kind 'copy_detail', keyed by card id. Until this runs the server
--    refuses them; each device keeps its own meanwhile, and a card's details go up the next time they change.
alter table deckbuilder_user_items drop constraint if exists deckbuilder_user_items_kind_check;
alter table deckbuilder_user_items
  add constraint deckbuilder_user_items_kind_check check (kind in ('pack_opening', 'price_alert', 'value_point', 'copy_detail'));

-- 2. A deck's earlier lists (Deck.versions, src/shared/deckHistory.ts) are the owner's own, like its
--    notes: a share link leaves them out. (The app already ignores them when opening a link.)
create or replace function deckbuilder_shared_deck(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'game_id', d.game_id,
    'data', d.data - 'shareToken' - 'locked' - 'notes' - 'folder' - 'versions',
    'updated_at', d.updated_at,
    'owner_name', nullif(trim(coalesce(pr.display_name, '')), '')
  ) into result
  from deckbuilder_deck_shares sh
  join deckbuilder_decks d on d.user_id = sh.user_id and d.id = sh.deck_id
  left join deckbuilder_profiles pr on pr.user_id = sh.user_id
  where sh.token = p_token;
  return result;
end;
$$;

grant execute on function deckbuilder_shared_deck(text) to anon, authenticated;
