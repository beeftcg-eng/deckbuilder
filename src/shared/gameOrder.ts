/**
 * `games` in the order you arranged them in the sidebar. Games missing from the saved order (a game added by an
 * update) follow in their default order, and saved ids that no longer exist are ignored, so a stale setting can
 * never hide or duplicate a game.
 */
export function orderGames<T extends { id: string }>(games: readonly T[], saved: readonly string[] | undefined): T[] {
  const byId = new Map(games.map((g) => [g.id, g]))
  const ordered: T[] = []
  for (const id of new Set(saved ?? [])) {
    const game = byId.get(id)
    if (game) ordered.push(game)
  }
  return [...ordered, ...games.filter((g) => !ordered.includes(g))]
}
