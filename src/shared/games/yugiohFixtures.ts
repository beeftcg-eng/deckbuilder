import type { YgoCard } from './yugioh'

// Trimmed copies of real YGOPRODeck cardinfo entries (misc=yes), to pin the shapes normalizeCard has to handle.
export const RAW = {
  "normal": {
    "id": 89631139,
    "name": "Blue-Eyes White Dragon",
    "type": "Normal Monster",
    "humanReadableCardType": "Normal Monster",
    "frameType": "normal",
    "race": "Dragon",
    "atk": 3000,
    "def": 2500,
    "level": 8,
    "attribute": "LIGHT",
    "archetype": "Blue-Eyes",
    "desc": "This legendary dragon is a powerful engine of destruction. Virtually invincible, very few have faced this awesome creature and lived to tell the tale.",
    "typeline": [
      "Dragon",
      "Normal"
    ],
    "card_sets": [
      {
        "set_name": "2016 Mega-Tins",
        "set_code": "CT13-EN008",
        "set_rarity": "Ultra Rare",
        "set_rarity_code": "(UR)",
        "set_price": "74.49"
      },
      {
        "set_name": "2017 Mega-Tins",
        "set_code": "CT14-EN002",
        "set_rarity": "Secret Rare",
        "set_rarity_code": "(ScR)",
        "set_price": "27.92"
      }
    ],
    "card_images": [
      {
        "id": 89631139
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.09",
        "tcgplayer_price": "0.14",
        "ebay_price": "5.95",
        "amazon_price": "3.90",
        "coolstuffinc_price": "0.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Duel Links",
          "Edison",
          "GOAT",
          "Master Duel",
          "OCG",
          "OCG GOAT",
          "Speed Duel",
          "TCG"
        ]
      }
    ]
  },
  "spell_forbidden_tcg": {
    "id": 55144522,
    "name": "Pot of Greed",
    "type": "Spell Card",
    "humanReadableCardType": "Normal Spell",
    "frameType": "spell",
    "race": "Normal",
    "archetype": "Greed",
    "desc": "Draw 2 cards.",
    "banlist_info": {
      "ban_tcg": "Forbidden",
      "ban_ocg": "Forbidden",
      "ban_goat": "Limited"
    },
    "card_sets": [
      {
        "set_name": "2025 Mega-Pack Tin",
        "set_code": "MP25-EN050",
        "set_rarity": "Starlight Rare",
        "set_rarity_code": "(StR)",
        "set_price": "0"
      },
      {
        "set_name": "Battle Pack 2: War of the Giants",
        "set_code": "BP02-EN129",
        "set_rarity": "Mosaic Rare",
        "set_rarity_code": "(MSR)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 55144522
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.15",
        "tcgplayer_price": "4.28",
        "ebay_price": "4.95",
        "amazon_price": "6.18",
        "coolstuffinc_price": "3.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Duel Links",
          "Edison",
          "GOAT",
          "Master Duel",
          "OCG",
          "OCG GOAT",
          "TCG"
        ]
      }
    ]
  },
  "quickplay": {
    "id": 5318639,
    "name": "Mystical Space Typhoon",
    "type": "Spell Card",
    "humanReadableCardType": "Quick-Play Spell",
    "frameType": "spell",
    "race": "Quick-Play",
    "desc": "Target 1 Spell/Trap on the field; destroy that target.",
    "banlist_info": {
      "ban_goat": "Limited"
    },
    "card_sets": [
      {
        "set_name": "2-Player Starter Deck: Yuya & Declan",
        "set_code": "YS15-END13",
        "set_rarity": "Common",
        "set_rarity_code": "(C)",
        "set_price": "4.48"
      },
      {
        "set_name": "2-Player Starter Deck: Yuya & Declan",
        "set_code": "YS15-ENY13",
        "set_rarity": "Common",
        "set_rarity_code": "(C)",
        "set_price": "3.02"
      }
    ],
    "card_images": [
      {
        "id": 5318639
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.02",
        "tcgplayer_price": "0.24",
        "ebay_price": "1.99",
        "amazon_price": "1.59",
        "coolstuffinc_price": "0.39"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Duel Links",
          "Edison",
          "GOAT",
          "Master Duel",
          "OCG",
          "OCG GOAT",
          "Speed Duel",
          "TCG"
        ]
      }
    ]
  },
  "trap": {
    "id": 41420027,
    "name": "Solemn Judgment",
    "type": "Trap Card",
    "humanReadableCardType": "Counter Trap",
    "frameType": "trap",
    "race": "Counter",
    "archetype": "Solemn",
    "desc": "When a monster(s) would be Summoned, OR a Spell/Trap Card is activated: Pay half your LP; negate the Summon or activation, and if you do, destroy that card.",
    "banlist_info": {
      "ban_tcg": "Limited",
      "ban_ocg": "Limited"
    },
    "card_sets": [
      {
        "set_name": "25th Anniversary Rarity Collection II",
        "set_code": "RA02-EN075",
        "set_rarity": "Collector's Rare",
        "set_rarity_code": "(CR)",
        "set_price": "0"
      },
      {
        "set_name": "25th Anniversary Rarity Collection II",
        "set_code": "RA02-EN075",
        "set_rarity": "Platinum Secret Rare",
        "set_rarity_code": "(PS)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 41420027
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.79",
        "tcgplayer_price": "1.06",
        "ebay_price": "3.99",
        "amazon_price": "7.39",
        "coolstuffinc_price": "3.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Edison",
          "GOAT",
          "Master Duel",
          "OCG",
          "OCG GOAT",
          "TCG"
        ]
      }
    ]
  },
  "fusion": {
    "id": 23995348,
    "name": "Blue-Eyes Ultimate Dragon",
    "type": "Fusion Monster",
    "humanReadableCardType": "Fusion Monster",
    "frameType": "fusion",
    "race": "Dragon",
    "atk": 4500,
    "def": 3800,
    "level": 12,
    "attribute": "LIGHT",
    "archetype": "Blue-Eyes",
    "desc": "\"Blue-Eyes White Dragon\" + \"Blue-Eyes White Dragon\" + \"Blue-Eyes White Dragon\"",
    "typeline": [
      "Dragon",
      "Fusion"
    ],
    "card_sets": [
      {
        "set_name": "Battle Pack Tournament Prize Cards",
        "set_code": "BATT-EN001",
        "set_rarity": "Starfoil Rare",
        "set_rarity_code": "(SFR)",
        "set_price": "81.77"
      },
      {
        "set_name": "Dark Legends",
        "set_code": "DLG1-EN001",
        "set_rarity": "Super Rare",
        "set_rarity_code": "(SR)",
        "set_price": "40.07"
      }
    ],
    "card_images": [
      {
        "id": 23995348
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.15",
        "tcgplayer_price": "0.23",
        "ebay_price": "3.99",
        "amazon_price": "1.00",
        "coolstuffinc_price": "1.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Duel Links",
          "Edison",
          "Master Duel",
          "OCG",
          "OCG GOAT",
          "Speed Duel",
          "TCG"
        ]
      }
    ]
  },
  "synchro": {
    "id": 44508094,
    "name": "Stardust Dragon",
    "type": "Synchro Monster",
    "humanReadableCardType": "Synchro Effect Monster",
    "frameType": "synchro",
    "race": "Dragon",
    "atk": 2500,
    "def": 2000,
    "level": 8,
    "attribute": "WIND",
    "archetype": "Stardust",
    "desc": "1 Tuner + 1+ non-Tuner monsters\r\nWhen a card or effect is activated that would destroy a card(s) on the field (Quick Effect): You can Tribute this card; negate ",
    "typeline": [
      "Dragon",
      "Synchro",
      "Effect"
    ],
    "card_sets": [
      {
        "set_name": "Collectible Tins 2008 Wave 1",
        "set_code": "CT05-EN001",
        "set_rarity": "Secret Rare",
        "set_rarity_code": "(ScR)",
        "set_price": "22.97"
      },
      {
        "set_name": "Collectible Tins 2010 Wave 2",
        "set_code": "CT07-EN021",
        "set_rarity": "Super Rare",
        "set_rarity_code": "(SR)",
        "set_price": "5.69"
      }
    ],
    "card_images": [
      {
        "id": 44508094
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.39",
        "tcgplayer_price": "0.51",
        "ebay_price": "355.00",
        "amazon_price": "2.49",
        "coolstuffinc_price": "0.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Duel Links",
          "Edison",
          "Master Duel",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "xyz": {
    "id": 84013237,
    "name": "Number 39: Utopia",
    "type": "XYZ Monster",
    "humanReadableCardType": "Xyz Effect Monster",
    "frameType": "xyz",
    "race": "Warrior",
    "atk": 2500,
    "def": 2000,
    "level": 4,
    "attribute": "LIGHT",
    "archetype": "Utopia",
    "desc": "2 Level 4 monsters\r\nWhen a monster declares an attack: You can detach 1 material from this card; negate the attack. If this card is targeted for an attack, whil",
    "typeline": [
      "Warrior",
      "Xyz",
      "Effect"
    ],
    "card_sets": [
      {
        "set_name": "Battle Pack: Epic Dawn",
        "set_code": "BP01-EN024",
        "set_rarity": "Rare",
        "set_rarity_code": "(R)",
        "set_price": "2.41"
      },
      {
        "set_name": "Battle Pack: Epic Dawn",
        "set_code": "BP01-EN024",
        "set_rarity": "Starfoil Rare",
        "set_rarity_code": "(SFR)",
        "set_price": "2.7"
      }
    ],
    "card_images": [
      {
        "id": 84013237
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.04",
        "tcgplayer_price": "0.26",
        "ebay_price": "1.99",
        "amazon_price": "0.78",
        "coolstuffinc_price": "0.25"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Duel Links",
          "Master Duel",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "link": {
    "id": 4731783,
    "name": "A Bao A Qu, the Lightless Shadow",
    "type": "Link Monster",
    "humanReadableCardType": "Link Effect Monster",
    "frameType": "link",
    "race": "Fiend",
    "atk": 2800,
    "def": null,
    "level": null,
    "attribute": "DARK",
    "linkval": 4,
    "linkmarkers": [
      "Left",
      "Right",
      "Bottom-Left",
      "Bottom-Right"
    ],
    "desc": "2+ monsters, including a Fiend monster\r\nDuring the Main Phase (Quick Effect): You can discard 1 card, then activate 1 of these effects;\r\n● Destroy 1 card on the",
    "typeline": [
      "Fiend",
      "Link",
      "Effect"
    ],
    "card_sets": [
      {
        "set_name": "Magnificent Monsters",
        "set_code": "MAMO-EN038",
        "set_rarity": "Secret Rare",
        "set_rarity_code": "(ScR)",
        "set_price": "0"
      },
      {
        "set_name": "Magnificent Monsters",
        "set_code": "MAMO-EN038",
        "set_rarity": "Starlight Rare",
        "set_rarity_code": "(StR)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 4731783
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.02",
        "tcgplayer_price": "0.38",
        "ebay_price": "0.00",
        "amazon_price": "0.00",
        "coolstuffinc_price": "0.00"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Master Duel",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "pendulum": {
    "id": 16178683,
    "name": "Odd-Eyes Pendulum Dragon",
    "type": "Pendulum Effect Monster",
    "humanReadableCardType": "Pendulum Effect Monster",
    "frameType": "effect_pendulum",
    "race": "Dragon",
    "atk": 2500,
    "def": 2000,
    "level": 7,
    "attribute": "DARK",
    "archetype": "-Eyes Dragon",
    "scale": 4,
    "desc": "[ Pendulum Effect ] \nYou can reduce the battle damage you take from an attack involving a Pendulum Monster you control to 0. During your End Phase: You can dest",
    "typeline": [
      "Dragon",
      "Pendulum",
      "Effect"
    ],
    "card_sets": [
      {
        "set_name": "2015 Mega-Tins",
        "set_code": "CT12-EN001",
        "set_rarity": "Platinum Secret Rare",
        "set_rarity_code": "(PS)",
        "set_price": "3.53"
      },
      {
        "set_name": "25th Anniversary Tin: Dueling Heroes",
        "set_code": "TN23-EN011",
        "set_rarity": "Quarter Century Secret Rare",
        "set_rarity_code": "",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 16178683
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.15",
        "tcgplayer_price": "0.16",
        "ebay_price": "12.99",
        "amazon_price": "1.39",
        "coolstuffinc_price": "0.25"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Duel Links",
          "Master Duel",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "semi": {
    "id": 33760966,
    "name": "Dracotail Arthalion",
    "type": "Fusion Monster",
    "humanReadableCardType": "Fusion Effect Monster",
    "frameType": "fusion",
    "race": "Dragon",
    "atk": 3000,
    "def": 2500,
    "level": 8,
    "attribute": "EARTH",
    "archetype": "Dracotail",
    "desc": "1 \"Dracotail\" monster + 1+ monsters in the hand\r\nIf this card is Fusion Summoned: You can target monsters on the field and/or GYs, up to the number of monsters ",
    "typeline": [
      "Dragon",
      "Fusion",
      "Effect"
    ],
    "banlist_info": {
      "ban_tcg": "Semi-Limited"
    },
    "card_sets": [
      {
        "set_name": "Justice Hunters",
        "set_code": "JUSH-EN006",
        "set_rarity": "Collector's Rare",
        "set_rarity_code": "(CR)",
        "set_price": "0"
      },
      {
        "set_name": "Justice Hunters",
        "set_code": "JUSH-EN006",
        "set_rarity": "Starlight Rare",
        "set_rarity_code": "(StR)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 33760966
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.36",
        "tcgplayer_price": "0.27",
        "ebay_price": "0.00",
        "amazon_price": "0.00",
        "coolstuffinc_price": "0.00"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Master Duel",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "limited": {
    "id": 13332685,
    "name": "Ame no Habakiri no Mitsurugi",
    "type": "Ritual Effect Monster",
    "humanReadableCardType": "Ritual Effect Monster",
    "frameType": "ritual",
    "race": "Reptile",
    "atk": 2400,
    "def": 1800,
    "level": 8,
    "attribute": "DARK",
    "archetype": "Mitsurugi",
    "desc": "You can Ritual Summon this card with \"Mitsurugi Ritual\". Monsters your opponent controls lose 800 ATK. You can reveal this card in your hand; Special Summon 1 \"",
    "typeline": [
      "Reptile",
      "Ritual",
      "Effect"
    ],
    "banlist_info": {
      "ban_tcg": "Limited"
    },
    "card_sets": [
      {
        "set_name": "Alliance Insight",
        "set_code": "ALIN-EN092",
        "set_rarity": "Super Rare",
        "set_rarity_code": "(SR)",
        "set_price": "0"
      },
      {
        "set_name": "Legendary Modern Decks 2026",
        "set_code": "L26D-ENM10",
        "set_rarity": "Secret Rare",
        "set_rarity_code": "(ScR)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 13332685
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.17",
        "tcgplayer_price": "0.19",
        "ebay_price": "0.00",
        "amazon_price": "0.00",
        "coolstuffinc_price": "0.00"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Master Duel",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "ocg_only": {
    "id": 72978038,
    "name": "\"Raise Moon\" the City that Never Sleeps",
    "type": "Spell Card",
    "humanReadableCardType": "Continuous Spell",
    "frameType": "spell",
    "race": "Continuous",
    "archetype": "Raise Moon",
    "desc": "The first time each Level 7 \"Raise Moon\" monster you control would be destroyed by card effect each turn, it is not destroyed. Once per turn, during the End Pha",
    "card_images": [
      {
        "id": 72978038
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.00",
        "tcgplayer_price": "0.00",
        "ebay_price": "0.00",
        "amazon_price": "0.00",
        "coolstuffinc_price": "0.00"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "OCG"
        ]
      }
    ]
  },
  "goat_banned": {
    "id": 69243953,
    "name": "Butterfly Dagger - Elma",
    "type": "Spell Card",
    "humanReadableCardType": "Equip Spell",
    "frameType": "spell",
    "race": "Equip",
    "archetype": "Guardian",
    "desc": "The equipped monster gains 300 ATK. When this card is destroyed and sent to the Graveyard while equipped: You can return this card to the hand.",
    "banlist_info": {
      "ban_tcg": "Forbidden",
      "ban_ocg": "Forbidden",
      "ban_goat": "Forbidden"
    },
    "card_sets": [
      {
        "set_name": "Dark Crisis",
        "set_code": "DCR-032",
        "set_rarity": "Super Rare",
        "set_rarity_code": "(SR)",
        "set_price": "6.87"
      },
      {
        "set_name": "Dark Crisis",
        "set_code": "DCR-EN032",
        "set_rarity": "Super Rare",
        "set_rarity_code": "(SR)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 69243953
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "1.00",
        "tcgplayer_price": "0.64",
        "ebay_price": "3.29",
        "amazon_price": "15.28",
        "coolstuffinc_price": "0.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Edison",
          "GOAT",
          "Master Duel",
          "OCG",
          "OCG GOAT",
          "TCG"
        ]
      }
    ]
  },
  "token": {
    "id": 44052075,
    "name": "Ancient Gear Token",
    "type": "Token",
    "humanReadableCardType": "Token",
    "frameType": "token",
    "race": "Machine",
    "archetype": "Ancient Gear",
    "desc": "This card can be used as an \"Ancient Gear Token\".\r\n\r\n\r\n*If used for another Token, apply that Token's Type/Attribute/Level/ATK/DEF.",
    "card_sets": [
      {
        "set_name": "Machine Reactor Structure Deck",
        "set_code": "SR03-ENTKN",
        "set_rarity": "Common",
        "set_rarity_code": "(C)",
        "set_price": "3.25"
      }
    ],
    "card_images": [
      {
        "id": 44052075
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.88",
        "tcgplayer_price": "0.99",
        "ebay_price": "6.82",
        "amazon_price": "2.81",
        "coolstuffinc_price": "2.99"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "OCG",
          "TCG"
        ]
      }
    ]
  },
  "skill": {
    "id": 300302022,
    "name": "Ancient Fusion",
    "type": "Skill Card",
    "humanReadableCardType": "Skill - Dr. Vellian C",
    "frameType": "skill",
    "race": "Dr. Vellian C",
    "archetype": "Fusion",
    "desc": "Once per Duel, you can discard 1 card to Fusion Summon 1 \"Ancient Gear\" Fusion Monster from your Extra Deck, using monsters from your field as Fusion Material. ",
    "card_sets": [
      {
        "set_name": "Speed Duel GX: Duel Academy Box",
        "set_code": "SGX1-ENS04",
        "set_rarity": "Common",
        "set_rarity_code": "(C)",
        "set_price": "0"
      }
    ],
    "card_images": [
      {
        "id": 300302022
      }
    ],
    "card_prices": [
      {
        "cardmarket_price": "0.00",
        "tcgplayer_price": "0.15",
        "ebay_price": "4.74",
        "amazon_price": "49.99",
        "coolstuffinc_price": "0.79"
      }
    ],
    "misc_info": [
      {
        "formats": [
          "Common Charity",
          "Speed Duel"
        ]
      }
    ]
  }
} as unknown as Record<string, YgoCard>
