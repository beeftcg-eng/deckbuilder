import type { ScryfallCard } from './mtg'

// Trimmed copies of real Scryfall bulk-data (oracle_cards) entries, to pin the shapes normalizeCard has to handle.
export const RAW = {
  "Llanowar Elves": {
    "id": "6a0b230b-d391-4998-a3f7-7b158a0ec2cd",
    "oracle_id": "68954295-54e3-4303-a6bc-fc4547a4e3a3",
    "layout": "normal",
    "name": "Llanowar Elves",
    "cmc": 1.0,
    "type_line": "Creature — Elf Druid",
    "mana_cost": "{G}",
    "oracle_text": "{T}: Add {G}.",
    "power": "1",
    "toughness": "1",
    "colors": [
      "G"
    ],
    "color_identity": [
      "G"
    ],
    "set": "fdn",
    "set_name": "Foundations",
    "collector_number": "227",
    "rarity": "common",
    "legalities": {
      "standard": "legal",
      "pioneer": "legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "legal",
      "commander": "legal",
      "future": "legal"
    },
    "prices": {
      "usd": "0.26",
      "usd_foil": "1.60",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/6/a/6a0b230b-d391-4998-a3f7-7b158a0ec2cd.jpg?1783909057",
      "large": "https://cards.scryfall.io/large/front/6/a/6a0b230b-d391-4998-a3f7-7b158a0ec2cd.jpg?1783909057"
    }
  },
  "Forest": {
    "id": "dce15387-4114-4b3e-91aa-5b42b45c44ac",
    "oracle_id": "b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6",
    "layout": "normal",
    "name": "Forest",
    "cmc": 0.0,
    "type_line": "Basic Land — Forest",
    "mana_cost": "",
    "oracle_text": "({T}: Add {G}.)",
    "colors": [],
    "color_identity": [
      "G"
    ],
    "set": "trk",
    "set_name": "Star Trek",
    "collector_number": "325",
    "rarity": "common",
    "legalities": {
      "standard": "legal",
      "pioneer": "legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "legal",
      "commander": "legal",
      "future": "legal"
    },
    "prices": {
      "usd": null,
      "usd_foil": null,
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/d/c/dce15387-4114-4b3e-91aa-5b42b45c44ac.jpg?1785981675",
      "large": "https://cards.scryfall.io/large/front/d/c/dce15387-4114-4b3e-91aa-5b42b45c44ac.jpg?1785981675"
    }
  },
  "Delver of Secrets // Insectile Aberration": {
    "id": "6904ea20-e504-47da-95a0-08739fdde260",
    "oracle_id": "edd531b9-f615-4399-8c8c-1c5e18c4acbf",
    "layout": "transform",
    "name": "Delver of Secrets // Insectile Aberration",
    "cmc": 1.0,
    "type_line": "Creature — Human Wizard // Creature — Human Insect",
    "color_identity": [
      "U"
    ],
    "set": "inr",
    "set_name": "Innistrad Remastered",
    "collector_number": "60",
    "rarity": "common",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "0.33",
      "usd_foil": "0.41",
      "usd_etched": null
    },
    "card_faces": [
      {
        "name": "Delver of Secrets",
        "mana_cost": "{U}",
        "type_line": "Creature — Human Wizard",
        "oracle_text": "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.",
        "colors": [
          "U"
        ],
        "power": "1",
        "toughness": "1",
        "image_uris": {
          "small": "https://cards.scryfall.io/small/front/6/9/6904ea20-e504-47da-95a0-08739fdde260.jpg?1783908173",
          "large": "https://cards.scryfall.io/large/front/6/9/6904ea20-e504-47da-95a0-08739fdde260.jpg?1783908173"
        }
      },
      {
        "name": "Insectile Aberration",
        "mana_cost": "",
        "type_line": "Creature — Human Insect",
        "oracle_text": "Flying",
        "colors": [
          "U"
        ],
        "power": "3",
        "toughness": "2",
        "image_uris": {
          "small": "https://cards.scryfall.io/small/back/6/9/6904ea20-e504-47da-95a0-08739fdde260.jpg?1783908173",
          "large": "https://cards.scryfall.io/large/back/6/9/6904ea20-e504-47da-95a0-08739fdde260.jpg?1783908173"
        }
      }
    ]
  },
  "Fire // Ice": {
    "id": "18303862-4726-4136-814f-157aa7006579",
    "oracle_id": "ae92942b-919c-4ea9-b693-85fcef765d5a",
    "layout": "split",
    "name": "Fire // Ice",
    "cmc": 4.0,
    "type_line": "Instant // Instant",
    "mana_cost": "{1}{R} // {1}{U}",
    "colors": [
      "R",
      "U"
    ],
    "color_identity": [
      "R",
      "U"
    ],
    "set": "dmr",
    "set_name": "Dominaria Remastered",
    "collector_number": "215",
    "rarity": "uncommon",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "0.16",
      "usd_foil": "0.32",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/1/8/18303862-4726-4136-814f-157aa7006579.jpg?1783918420",
      "large": "https://cards.scryfall.io/large/front/1/8/18303862-4726-4136-814f-157aa7006579.jpg?1783918420"
    },
    "card_faces": [
      {
        "name": "Fire",
        "mana_cost": "{1}{R}",
        "type_line": "Instant",
        "oracle_text": "Fire deals 2 damage divided as you choose among one or two targets."
      },
      {
        "name": "Ice",
        "mana_cost": "{1}{U}",
        "type_line": "Instant",
        "oracle_text": "Tap target permanent.\nDraw a card."
      }
    ]
  },
  "Bonecrusher Giant // Stomp": {
    "id": "b5b71cd2-de35-451f-b16e-2e3936169407",
    "oracle_id": "d6d72f5f-8f5d-4180-b514-f22ff5482902",
    "layout": "adventure",
    "name": "Bonecrusher Giant // Stomp",
    "cmc": 3.0,
    "type_line": "Creature — Giant // Instant — Adventure",
    "mana_cost": "{2}{R} // {1}{R}",
    "power": "4",
    "toughness": "3",
    "colors": [
      "R"
    ],
    "color_identity": [
      "R"
    ],
    "set": "clb",
    "set_name": "Commander Legends: Battle for Baldur's Gate",
    "collector_number": "781",
    "rarity": "rare",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "not_legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "0.38",
      "usd_foil": null,
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/b/5/b5b71cd2-de35-451f-b16e-2e3936169407.jpg?1783922435",
      "large": "https://cards.scryfall.io/large/front/b/5/b5b71cd2-de35-451f-b16e-2e3936169407.jpg?1783922435"
    },
    "card_faces": [
      {
        "name": "Bonecrusher Giant",
        "mana_cost": "{2}{R}",
        "type_line": "Creature — Giant",
        "oracle_text": "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.",
        "power": "4",
        "toughness": "3"
      },
      {
        "name": "Stomp",
        "mana_cost": "{1}{R}",
        "type_line": "Instant — Adventure",
        "oracle_text": "Damage can't be prevented this turn. Stomp deals 2 damage to any target."
      }
    ]
  },
  "Atraxa, Praetors' Voice": {
    "id": "d0d33d52-3d28-4635-b985-51e126289259",
    "oracle_id": "7e6b9b59-cd68-4e3c-827b-38833c92d6eb",
    "layout": "normal",
    "name": "Atraxa, Praetors' Voice",
    "cmc": 4.0,
    "type_line": "Legendary Creature — Phyrexian Angel Horror",
    "mana_cost": "{G}{W}{U}{B}",
    "oracle_text": "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)",
    "power": "4",
    "toughness": "4",
    "colors": [
      "B",
      "G",
      "U",
      "W"
    ],
    "color_identity": [
      "B",
      "G",
      "U",
      "W"
    ],
    "set": "2xm",
    "set_name": "Double Masters",
    "collector_number": "190",
    "rarity": "mythic",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "not_legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "not_legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "28.08",
      "usd_foil": "33.53",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136",
      "large": "https://cards.scryfall.io/large/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136"
    }
  },
  "Teferi, Temporal Archmage": {
    "id": "368c6e60-804c-447c-bc2b-ac9dc4cab5e7",
    "oracle_id": "07d0b06b-80cb-4518-92c9-84ea87a7e08a",
    "layout": "normal",
    "name": "Teferi, Temporal Archmage",
    "cmc": 6.0,
    "type_line": "Legendary Planeswalker — Teferi",
    "mana_cost": "{4}{U}{U}",
    "oracle_text": "+1: Look at the top two cards of your library. Put one of them into your hand and the other on the bottom of your library.\n−1: Untap up to four target permanents.\n−10: You get an emblem with \"You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant.\"\nTeferi, Temporal Archmage can be your commander.",
    "loyalty": "5",
    "colors": [
      "U"
    ],
    "color_identity": [
      "U"
    ],
    "set": "cmm",
    "set_name": "Commander Masters",
    "collector_number": "125",
    "rarity": "rare",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "not_legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "not_legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "1.45",
      "usd_foil": "1.61",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/3/6/368c6e60-804c-447c-bc2b-ac9dc4cab5e7.jpg?1783915687",
      "large": "https://cards.scryfall.io/large/front/3/6/368c6e60-804c-447c-bc2b-ac9dc4cab5e7.jpg?1783915687"
    }
  },
  "Steam Vents": {
    "id": "a83903c7-fd51-4526-aed2-359e946fea36",
    "oracle_id": "17039058-822d-409f-938c-b727a366ba63",
    "layout": "normal",
    "name": "Steam Vents",
    "cmc": 0.0,
    "type_line": "Land — Island Mountain",
    "mana_cost": "",
    "oracle_text": "({T}: Add {U} or {R}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.",
    "colors": [],
    "color_identity": [
      "R",
      "U"
    ],
    "set": "trk",
    "set_name": "Star Trek",
    "collector_number": "298",
    "rarity": "rare",
    "legalities": {
      "standard": "legal",
      "pioneer": "legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "not_legal",
      "commander": "legal",
      "future": "legal"
    },
    "prices": {
      "usd": null,
      "usd_foil": null,
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/a/8/a83903c7-fd51-4526-aed2-359e946fea36.jpg?1784036844",
      "large": "https://cards.scryfall.io/large/front/a/8/a83903c7-fd51-4526-aed2-359e946fea36.jpg?1784036844"
    }
  },
  "Sol Ring": {
    "id": "8ee443cc-e17a-493b-9c93-1f9e141a30e4",
    "oracle_id": "6ad8011d-3471-4369-9d68-b264cc027487",
    "layout": "normal",
    "name": "Sol Ring",
    "cmc": 1.0,
    "type_line": "Artifact",
    "mana_cost": "{1}",
    "oracle_text": "{T}: Add {C}{C}.",
    "colors": [],
    "color_identity": [],
    "set": "frc",
    "set_name": "Reality Fracture Commander",
    "collector_number": "21",
    "rarity": "uncommon",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "not_legal",
      "legacy": "banned",
      "vintage": "restricted",
      "pauper": "not_legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": null,
      "usd_foil": null,
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446",
      "large": "https://cards.scryfall.io/large/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446"
    }
  },
  "Ancestral Recall": {
    "id": "2398892d-28e9-4009-81ec-0d544af79d2b",
    "oracle_id": "550c74d4-1fcb-406a-b02a-639a760a4380",
    "layout": "normal",
    "name": "Ancestral Recall",
    "cmc": 1.0,
    "type_line": "Instant",
    "mana_cost": "{U}",
    "oracle_text": "Target player draws three cards.",
    "colors": [
      "U"
    ],
    "color_identity": [
      "U"
    ],
    "set": "vma",
    "set_name": "Vintage Masters",
    "collector_number": "1",
    "rarity": "bonus",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "not_legal",
      "legacy": "banned",
      "vintage": "restricted",
      "pauper": "not_legal",
      "commander": "banned",
      "future": "not_legal"
    },
    "prices": {
      "usd": null,
      "usd_foil": null,
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/2/3/2398892d-28e9-4009-81ec-0d544af79d2b.jpg?1783939333",
      "large": "https://cards.scryfall.io/large/front/2/3/2398892d-28e9-4009-81ec-0d544af79d2b.jpg?1783939333"
    }
  },
  "Relentless Rats": {
    "id": "75f47b6e-9557-4853-b8d6-7602a91c59a7",
    "oracle_id": "104ea189-14cd-420f-afdc-57b0f827ab8e",
    "layout": "normal",
    "name": "Relentless Rats",
    "cmc": 3.0,
    "type_line": "Creature — Rat",
    "mana_cost": "{1}{B}{B}",
    "oracle_text": "This creature gets +1/+1 for each other creature on the battlefield named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.",
    "power": "2",
    "toughness": "2",
    "colors": [
      "B"
    ],
    "color_identity": [
      "B"
    ],
    "set": "a25",
    "set_name": "Masters 25",
    "collector_number": "105",
    "rarity": "common",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "4.31",
      "usd_foil": "6.52",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/7/5/75f47b6e-9557-4853-b8d6-7602a91c59a7.jpg?1783935158",
      "large": "https://cards.scryfall.io/large/front/7/5/75f47b6e-9557-4853-b8d6-7602a91c59a7.jpg?1783935158"
    }
  },
  "Seven Dwarves": {
    "id": "464adbae-70ea-48e1-b8ae-b404766f7a5a",
    "oracle_id": "526ca4a9-3f50-4f7a-8169-2bda95792401",
    "layout": "normal",
    "name": "Seven Dwarves",
    "cmc": 2.0,
    "type_line": "Creature — Dwarf",
    "mana_cost": "{1}{R}",
    "oracle_text": "This creature gets +1/+1 for each other creature named Seven Dwarves you control.\nA deck can have up to seven cards named Seven Dwarves.",
    "power": "2",
    "toughness": "2",
    "colors": [
      "R"
    ],
    "color_identity": [
      "R"
    ],
    "set": "eld",
    "set_name": "Throne of Eldraine",
    "collector_number": "141",
    "rarity": "common",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "1.13",
      "usd_foil": "0.89",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/4/6/464adbae-70ea-48e1-b8ae-b404766f7a5a.jpg?1783932616",
      "large": "https://cards.scryfall.io/large/front/4/6/464adbae-70ea-48e1-b8ae-b404766f7a5a.jpg?1783932616"
    }
  },
  "Nazgûl": {
    "id": "833936c6-9381-4c0b-a81c-4a938be95040",
    "oracle_id": "48a62778-7c11-486f-a0e1-020c283a7ef9",
    "layout": "normal",
    "name": "Nazgûl",
    "cmc": 3.0,
    "type_line": "Creature — Wraith Knight",
    "mana_cost": "{2}{B}",
    "oracle_text": "Deathtouch\nWhen this creature enters, the Ring tempts you.\nWhenever the Ring tempts you, put a +1/+1 counter on each Wraith you control.\nA deck can have up to nine cards named Nazgûl.",
    "power": "1",
    "toughness": "2",
    "colors": [
      "B"
    ],
    "color_identity": [
      "B"
    ],
    "set": "ltr",
    "set_name": "The Lord of the Rings: Tales of Middle-earth",
    "collector_number": "100",
    "rarity": "uncommon",
    "legalities": {
      "standard": "not_legal",
      "pioneer": "not_legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "pauper": "not_legal",
      "commander": "legal",
      "future": "not_legal"
    },
    "prices": {
      "usd": "23.48",
      "usd_foil": "36.30",
      "usd_etched": null
    },
    "image_uris": {
      "small": "https://cards.scryfall.io/small/front/8/3/833936c6-9381-4c0b-a81c-4a938be95040.jpg?1783916298",
      "large": "https://cards.scryfall.io/large/front/8/3/833936c6-9381-4c0b-a81c-4a938be95040.jpg?1783916298"
    }
  }
} as unknown as Record<string, ScryfallCard>

export const RAW_TOKEN = {
  "id": "21afb029-9aef-4e6e-a646-3343605b4bb7",
  "oracle_id": "0042a526-8828-40eb-bd32-4f57b230625a",
  "layout": "token",
  "name": "Tyranid",
  "cmc": 0.0,
  "type_line": "Token Creature — Tyranid",
  "mana_cost": "",
  "oracle_text": "",
  "power": "5",
  "toughness": "5",
  "colors": [
    "G"
  ],
  "color_identity": [
    "G"
  ],
  "set": "t40k",
  "set_name": "Warhammer 40,000 Tokens",
  "collector_number": "18",
  "rarity": "common",
  "legalities": {
    "standard": "not_legal",
    "pioneer": "not_legal",
    "modern": "not_legal",
    "legacy": "not_legal",
    "vintage": "not_legal",
    "pauper": "not_legal",
    "commander": "not_legal",
    "future": "not_legal"
  },
  "prices": {
    "usd": null,
    "usd_foil": null,
    "usd_etched": null
  },
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/2/1/21afb029-9aef-4e6e-a646-3343605b4bb7.jpg?1783920658",
    "large": "https://cards.scryfall.io/large/front/2/1/21afb029-9aef-4e6e-a646-3343605b4bb7.jpg?1783920658"
  }
} as unknown as ScryfallCard

export const RAW_UNPLAYABLE = {
  "id": "bea12617-ebaa-45f6-a2e8-b71190708129",
  "oracle_id": "00268072-af77-40d2-8d2d-c02426575ee1",
  "layout": "normal",
  "name": "Phyrexian Broodstar",
  "cmc": 8.0,
  "type_line": "Creature — Phyrexian Beast",
  "mana_cost": "{6}{U}{U}",
  "oracle_text": "Affinity for Phyrexians (This spell costs {1} less to cast for each Phyrexian you control.)\nFlying\nPhyrexian Broodstar's power and toughness are each equal to the number of Phyrexians you control.",
  "power": "*",
  "toughness": "*",
  "colors": [
    "U"
  ],
  "color_identity": [
    "U"
  ],
  "set": "unk",
  "set_name": "Unknown Event",
  "collector_number": "RU08",
  "rarity": "rare",
  "legalities": {
    "standard": "not_legal",
    "pioneer": "not_legal",
    "modern": "not_legal",
    "legacy": "not_legal",
    "vintage": "not_legal",
    "pauper": "not_legal",
    "commander": "not_legal",
    "future": "not_legal"
  },
  "prices": {
    "usd": null,
    "usd_foil": null,
    "usd_etched": null
  },
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/b/e/bea12617-ebaa-45f6-a2e8-b71190708129.jpg?1783917761",
    "large": "https://cards.scryfall.io/large/front/b/e/bea12617-ebaa-45f6-a2e8-b71190708129.jpg?1783917761"
  }
} as unknown as ScryfallCard

export const RAW_STICKER = {
  "id": "c27dffce-908c-45cf-bfe5-67af12467321",
  "oracle_id": "065cdf8d-6874-4ab6-a08e-79bd88b245bd",
  "layout": "normal",
  "name": "Playable Delusionary Hydra",
  "cmc": 0.0,
  "type_line": "Stickers",
  "mana_cost": "",
  "oracle_text": "{TK}{TK} — {T}: Draw a card, then discard a card.\n{TK}{TK}{TK}{TK} — Whenever this creature attacks, you gain 3 life and draw a card.\n{TK}{TK} — 1/5\n{TK}{TK}{TK} — 4/4",
  "colors": [],
  "color_identity": [],
  "set": "sunf",
  "set_name": "Unfinity Sticker Sheets",
  "collector_number": "30",
  "rarity": "common",
  "legalities": {
    "standard": "not_legal",
    "pioneer": "not_legal",
    "modern": "not_legal",
    "legacy": "not_legal",
    "vintage": "not_legal",
    "pauper": "not_legal",
    "commander": "legal",
    "future": "not_legal"
  },
  "prices": {
    "usd": "4.93",
    "usd_foil": null,
    "usd_etched": null
  },
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/c/2/c27dffce-908c-45cf-bfe5-67af12467321.jpg?1783920636",
    "large": "https://cards.scryfall.io/large/front/c/2/c27dffce-908c-45cf-bfe5-67af12467321.jpg?1783920636"
  }
} as unknown as ScryfallCard

export const RAW_FUTURE = {
  "id": "710302ca-c4be-4069-8ce1-f531414c74e9",
  "oracle_id": "0089acfe-da66-4dd7-b1e5-4d7407f58257",
  "layout": "normal",
  "name": "Theorist's Proxy",
  "cmc": 2.0,
  "type_line": "Creature — Illusion",
  "mana_cost": "{1}{U}",
  "oracle_text": "Flash\nWhen this creature enters, empower Jace 3. (Put three loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")\n{U}, Sacrifice this creature: The next spell you cast this turn can't be countered.",
  "power": "0",
  "toughness": "3",
  "colors": [
    "U"
  ],
  "color_identity": [
    "U"
  ],
  "set": "fra",
  "set_name": "Reality Fracture",
  "collector_number": "44",
  "rarity": "rare",
  "legalities": {
    "standard": "not_legal",
    "pioneer": "not_legal",
    "modern": "not_legal",
    "legacy": "not_legal",
    "vintage": "not_legal",
    "pauper": "not_legal",
    "commander": "not_legal",
    "future": "legal"
  },
  "prices": {
    "usd": "2.63",
    "usd_foil": "2.20",
    "usd_etched": null
  },
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/7/1/710302ca-c4be-4069-8ce1-f531414c74e9.jpg?1788878151",
    "large": "https://cards.scryfall.io/large/front/7/1/710302ca-c4be-4069-8ce1-f531414c74e9.jpg?1788878151"
  }
} as unknown as ScryfallCard

