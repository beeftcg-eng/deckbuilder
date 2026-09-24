#!/usr/bin/env python3
"""Builds src/shared/games/yugiohArtMap.ts: which official artwork(s) each Yu-Gi-Oh printing uses.

YGOPRODeck lists every artwork of a card but not which printing uses which (its per-printing lookup,
cardsetsinfo, returns the same art for nearly every printing). Yugipedia's card galleries have a photo
of every printing, labelled with its code and rarity, so this compares each photo's artwork box with
YGOPRODeck's artworks (a perceptual hash) and records the closest match.

Only cards with more than one artwork are looked at. A printing is only recorded when every photo of
it matched confidently; anything uncertain (a missing photo, a weak or ambiguous match - shiny
Platinum/Starlight scans, unusual frames) is left out, and the app then shows all of that card's
artworks for it, exactly as before. So a wrong guess can't hide the right art.

    pip install pillow
    python3 scripts/build-ygo-art-map.py            # resumes from .ygo-art-cache.json if interrupted

Polite to both sites: one request at a time with pauses, and a descriptive User-Agent. Takes a while
(roughly 30-60 minutes). The output holds only printing -> artwork-id facts, no images.
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'shared', 'games', 'yugiohArtMap.ts')
CACHE = os.path.join(ROOT, '.ygo-art-cache.json')
UA = {'User-Agent': "BeefsBrewhouse-art-map/1.0 (Yu-Gi-Oh printing->artwork map; github.com/beeftcg-eng/deckbuilder)"}
# A photo counts as matched when its artwork box is close to one artwork and clearly further from every
# other: (hash distance to the best, how much worse the runner-up is), out of 256 bits. Most real matches
# score ~26 with a ~96 lead; the second rule takes weaker but still clear-cut ones (foil scans, special
# frames like 26LP's "Emblazoned" printings).
RULES = [(55, 40), (85, 60)]

def confident(d, gap):
    return any(d <= max_d and gap >= min_gap for max_d, min_gap in RULES)

# Yugipedia's rarity abbreviations -> YGOPRODeck's rarity names (what the app's printings carry).
RARITY = {
    'C': 'Common', 'R': 'Rare', 'SR': 'Super Rare', 'UR': 'Ultra Rare', 'ScR': 'Secret Rare', 'UtR': 'Ultimate Rare',
    'GR': 'Ghost Rare', 'GUR': 'Gold Rare', 'GScR': 'Gold Secret Rare', 'PGR': 'Premium Gold Rare', 'GGR': 'Ghost/Gold Rare',
    'PScR': 'Prismatic Secret Rare', 'EScR': 'Extra Secret Rare', 'UScR': 'Ultra Secret Rare', 'QCScR': 'Quarter Century Secret Rare',
    'PlScR': 'Platinum Secret Rare', 'PlR': 'Platinum Rare', 'StR': 'Starlight Rare', 'CR': "Collector's Rare",
    'SFR': 'Starfoil Rare', 'SHR': 'Shatterfoil Rare', 'MSR': 'Mosaic Rare', 'UPR': 'Ultra Parallel Rare',
    'NPR': 'Normal Parallel Rare', 'SPR': 'Super Parallel Rare', 'SP': 'Short Print', 'SSP': 'Super Short Print',
    'DNPR': 'Duel Terminal Normal Parallel Rare', 'DRPR': 'Duel Terminal Rare Parallel Rare',
    'DSPR': 'Duel Terminal Super Parallel Rare', 'DUPR': 'Duel Terminal Ultra Parallel Rare',
    '10000ScR': '10000 Secret Rare', 'GMR': 'Grand Master Rare', 'PIR': "Ultra Rare (Pharaoh's Rare)",
}

def get(url, tries=4):
    for n in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        except Exception:
            if n == tries - 1: raise
            time.sleep(3 * (n + 1))

def art_hash(img, size=16):
    w, h = img.size
    art = img.convert('L').crop((int(w * .13), int(h * .19), int(w * .87), int(h * .72))).resize((size + 1, size), Image.LANCZOS)
    px = list(art.getdata())
    return [px[r * (size + 1) + c] > px[r * (size + 1) + c + 1] for r in range(size) for c in range(size)]

def dist(a, b): return sum(x != y for x, y in zip(a, b))

def file_stem(name):  # Yugipedia's gallery file names drop spaces and punctuation from the card name
    return re.sub(r'[^0-9A-Za-z]', '', name.replace('é', 'e').replace('ū', 'u').replace('ō', 'o'))

def gallery(name):
    q = urllib.parse.urlencode({'action': 'parse', 'page': f'Card Gallery:{name}', 'prop': 'wikitext', 'format': 'json', 'redirects': 1})
    d = json.loads(get('https://yugipedia.com/api.php?' + q))
    if 'parse' not in d: return []
    text, region, out = d['parse']['wikitext']['*'], None, []
    for line in text.splitlines():
        m = re.match(r'\{\{Card gallery\|region=(\w+)', line)
        if m: region = m.group(1); continue
        if region != 'EN': continue
        m = re.match(r'^([A-Z0-9]+-[A-Z]*\d+[A-Z]?\d*);\s*([^;]*);\s*([^;]*);\s*([^;/]*)(?:;\s*([^/]*))?(.*)$', line.strip())
        if not m: continue
        code, _set, rar, ed, extra, opts = m.groups()
        rar, ed, extra = rar.strip(), ed.strip(), (extra or '').strip()
        f = re.search(r'//file::(\S+)', opts or '')
        ext = re.search(r'//extension::(\w+)', opts or '')
        fname = f.group(1) if f else f"{file_stem(name)}-{code.split('-')[0]}-EN-{rar}-{ed}" + (f"-{extra}" if extra else '') + f".{ext.group(1) if ext else 'png'}"
        out.append({'code': code, 'rarity': rar, 'file': fname})
    return out

def resolve(files):
    urls = {}
    for i in range(0, len(files), 40):
        batch = files[i:i + 40]
        q = urllib.parse.urlencode({'action': 'query', 'titles': '|'.join('File:' + f for f in batch), 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': 240, 'format': 'json'})
        d = json.loads(get('https://yugipedia.com/api.php?' + q))
        norm = {n['to']: n['from'] for n in d['query'].get('normalized', [])}
        for p in d['query']['pages'].values():
            title = norm.get(p['title'], p['title'])
            if 'imageinfo' in p: urls[title[5:]] = p['imageinfo'][0].get('thumburl') or p['imageinfo'][0]['url']
        time.sleep(1)
    return urls

def write_ts(printings):
    lines = [
        '// Generated by scripts/build-ygo-art-map.py - do not edit by hand; re-run the script instead.',
        '// Which official artwork(s) each Yu-Gi-Oh printing uses, keyed "set code|rarity", from Yugipedia',
        '// card galleries matched against YGOPRODeck artworks. Printings missing here show every artwork.',
        f"export const YGO_ART_MAP_DATE = '{datetime.now(timezone.utc).strftime('%Y-%m-%d')}'",
        'export const YGO_ART_MAP: Record<string, number[]> = {',
        *[f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v)},' for k, v in printings.items()],
        '}',
        '',
    ]
    open(OUT, 'w').write('\n'.join(lines))

def rematch(cache):
    """Fills in the best artwork for photos an older run rejected without recording it."""
    todo = {k: v for k, v in cache.items() if any(m.get('d') is not None and 'best' not in m and m.get('art') is None for m in v.get('matches', []))}
    print(f'rematching photos for {len(todo)} cards', flush=True)
    for n, (key, entry) in enumerate(todo.items(), 1):
        arts = {i: art_hash(Image.open(io.BytesIO(get(f"https://images.ygoprodeck.com/images/cards_small/{i}.jpg")))) for i in entry['arts']}
        missing = [m for m in entry['matches'] if m.get('d') is not None and 'best' not in m and m.get('art') is None]
        urls = resolve([m['file'] for m in missing])
        for m in missing:
            u = urls.get(m['file'])
            if not u: continue
            ranked = sorted((dist(art_hash(Image.open(io.BytesIO(get(u)))), a), i) for i, a in arts.items())
            m['best'], m['d'], m['gap'] = ranked[0][1], ranked[0][0], ranked[1][0] - ranked[0][0]
            time.sleep(0.4)
        json.dump(cache, open(CACHE, 'w'))
        print(f'[{n}/{len(todo)}] {entry["name"]}', flush=True)

def main():
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    if '--rematch' in sys.argv:
        rematch(cache)
    # --from-cache: just rebuild the output from what's already been matched (no network).
    data = [] if '--from-cache' in sys.argv else json.loads(get('https://db.ygoprodeck.com/api/v7/cardinfo.php'))['data']
    multi = [c for c in data if len(c.get('card_images', [])) > 1]
    if multi: print(f'{len(multi)} cards with more than one artwork', flush=True)
    for n, card in enumerate(multi, 1):
        key = str(card['id'])
        if key in cache: continue
        try:
            arts = {}
            for im in card['card_images']:
                arts[im['id']] = art_hash(Image.open(io.BytesIO(get(f"https://images.ygoprodeck.com/images/cards_small/{im['id']}.jpg"))))
                time.sleep(0.15)
            photos = gallery(card['name'])
            urls = resolve([p['file'] for p in photos]) if photos else {}
            matches = []
            for p in photos:
                u = urls.get(p['file'])
                if not u: matches.append({**p, 'art': None}); continue
                h = art_hash(Image.open(io.BytesIO(get(u))))
                ranked = sorted((dist(h, a), i) for i, a in arts.items())
                (d1, best), (d2, _) = ranked[0], ranked[1]
                matches.append({**p, 'best': best, 'd': d1, 'gap': d2 - d1})
                time.sleep(0.4)
            cache[key] = {'name': card['name'], 'arts': [im['id'] for im in card['card_images']], 'sets': card.get('card_sets', []), 'matches': matches}
        except Exception as e:
            print(f'  ! {card["name"]}: {e}', flush=True)
            cache[key] = {'name': card['name'], 'error': str(e)}
        json.dump(cache, open(CACHE, 'w'))
        ok = sum(1 for m in cache[key].get('matches', []) if m.get('best') and confident(m['d'], m['gap']))
        print(f'[{n}/{len(multi)}] {card["name"]}: {ok}/{len(cache[key].get("matches", []))} photos matched', flush=True)
        time.sleep(1)

    printings = {}
    stats = {'restricted': 0, 'uncertain': 0}
    for pid, entry in cache.items():
        by_printing = {}
        for m in entry.get('matches', []):
            rarity = RARITY.get(m['rarity'])
            if not rarity: continue
            best = m.get('best', m.get('art'))  # 'art' is how runs before --rematch stored an accepted match
            ok = best is not None and m.get('d') is not None and confident(m['d'], m['gap'])
            by_printing.setdefault((m['code'], rarity), []).append(best if ok else None)
        for (code, rarity), found in by_printing.items():
            if None in found: stats['uncertain'] += 1; continue  # any unmatched photo: don't restrict this printing
            # Keyed by printed code + rarity, not the passcode: YGOPRODeck's bulk download (what the app
            # syncs) can list a card under a different main id than its single-card lookup (Dark Magician
            # is 46986420 in one and 46986414 in the other), while "GFTP-EN128|Ghost Rare" is one printing.
            printings[f'{code}|{rarity}'] = sorted(set(found), key=entry['arts'].index)
            stats['restricted'] += 1
    write_ts(dict(sorted(printings.items())))
    print(f"wrote {OUT}: {stats['restricted']} printings mapped, {stats['uncertain']} left open (uncertain)")

if __name__ == '__main__':
    main()
