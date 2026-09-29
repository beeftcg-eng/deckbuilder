import type { GameId } from './types'

/**
 * One example deck per game, shown to someone who has no decks for that game yet ("Open an example
 * deck" in the sidebar and My Decks): a real list to try Practice, Proxies, Compare and the buy list on
 * before building anything. Each is legal in its format with the card data as of September 2026
 * (checked against the full catalogs with the app's own importer and legality check), and is
 * decklist text so it goes through the normal importer: a card that later drops out of the data is
 * just left out. One Piece is Starter Deck 14 (3D2Y); Yu-Gi-Oh! is the Blue-Eyes White Destiny
 * structure deck with the usual extra copies.
 */
export interface SampleDeck {
  name: string
  formatId: string
  text: string
}

export const SAMPLE_DECKS: Record<GameId, SampleDeck> = {
  riftbound: {
    name: 'Jinx (Origins)',
    formatId: 'constructed',
    text: `Legend:
1 Jinx - Loose Cannon

MainDeck:
1 Jinx - Rebel
3 Acceptable Losses
3 Cleave
3 Chemtech Enforcer
3 Falling Star
3 Fight or Flight
3 Cemetery Attendant
3 Dangerous Duo
3 Flame Chompers
3 Blind Fury
3 Captain Farron
3 Blazing Scorcher
3 Maddened Marauder
3 Brazen Buccaneer

Battlefields:
1 Zaun Warrens
1 Windswept Hillock
1 Void Gate

Runes:
6 Fury Rune
6 Chaos Rune`,
  },
  onepiece: {
    name: 'Starter Deck 14: 3D2Y',
    formatId: 'standard',
    text: `Leader:
1 ST14-001 Monkey.D.Luffy (001)

Main:
4 ST14-002 Usopp
2 ST14-003 Sanji
4 ST14-004 Jinbe
2 ST14-005 Tony Tony.Chopper
4 ST14-006 Nami
2 ST14-007 Nico Robin
4 ST14-008 Haredas
2 ST14-009 Franky
2 ST14-010 Brook
4 ST14-011 Heracles
2 ST14-012 Monkey.D.Luffy (012)
2 ST14-013 Roronoa Zoro
4 ST14-014 Gum-Gum Giant Rifl
4 ST14-015 Gum-Gum Diable Three-Swords Style Mouten Jet Six Hundred Pound Phoenix Cannon
4 ST14-016 I Have My Crew!!
4 ST14-017 Thousand Sunny`,
  },
  pokemon: {
    name: 'Charizard ex',
    formatId: 'standard',
    text: `Pokémon:
4 Charmander PAF 7
1 Charmeleon PAF 8
3 Charizard ex PAF 54
2 Pidgey MEW 16
2 Pidgeot ex OBF 164
2 Duskull PRE 35
1 Dusclops PRE 36
1 Dusknoir PRE 37
1 Fezandipiti ex ASC 142

Trainer:
4 Arven PAF 235
4 Iono PAF 80
2 Boss's Orders ASC 183
2 Dawn PFL 87
2 Lillie's Determination ASC 192
1 Professor's Research JTG 155
4 Rare Candy MEG 125
4 Ultra Ball ASC 213
4 Buddy-Buddy Poffin ASC 184
2 Nest Ball PAF 84
2 Earthen Vessel PRE 106
2 Night Stretcher ASC 196
1 Super Rod PAL 188
1 Counter Catcher PAR 160
1 Energy Search SVI 172

Energy:
7 Basic Fire Energy SVE 2`,
  },
  mtg: {
    name: 'Pauper Red Burn',
    formatId: 'pauper',
    text: `Deck
4 Kessig Flamebreather
4 Clockwork Percussionist
4 Voldaren Epicure
4 Lightning Bolt
4 Chain Lightning
4 Rift Bolt
4 Fireblast
4 Lava Dart
4 Skewer the Critics
2 Searing Blaze
2 Firebolt
20 Mountain`,
  },
  yugioh: {
    name: 'Blue-Eyes White Destiny',
    formatId: 'tcg',
    text: `3 Ash Blossom & Joyous Spring
1 Azure-Eyes Silver Dragon
1 Blue-Eyes Abyss Dragon
2 Blue-Eyes Alternative White Dragon
1 Blue-Eyes Chaos Dragon
1 Blue-Eyes Chaos MAX Dragon
1 Blue-Eyes Jet Dragon
1 Blue-Eyes Spirit Dragon
1 Blue-Eyes Twin Burst Dragon
1 Blue-Eyes Tyrant Dragon
3 Blue-Eyes Ultimate Spirit Dragon
3 Blue-Eyes White Dragon
1 Burst Stream of Destruction
1 Called by the Grave
1 Chaos Form
1 Destined Rivals
3 Dictator of D.
1 Dragon Spirit of White
1 Effect Veiler
1 Hieratic Seal of the Heavenly Spheres
1 Indigo-Eyes Silver Dragon
1 Infinite Impermanence
3 Maiden of White
1 Majesty of the White Dragons
1 Master with Eyes of Blue
1 Mausoleum of White
1 Neo Blue-Eyes Ultimate Dragon
1 Neo Kaiser Sea Horse
1 Nibiru, the Primal Being
1 Roar of the Blue-Eyed Dragons
3 Sage with Eyes of Blue
1 Spirit with Eyes of Blue
1 The Melody of Awakening Dragon
1 The Ultimate Creature of Destruction
1 The White Stone of Ancients
1 The White Stone of Legend
3 Trade-In
1 True Light
1 Ultimate Fusion
3 Wishes for Eyes of Blue`,
  },
}
