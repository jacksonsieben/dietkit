# Spike — nutrition facts from a barcode

> Resolves the P3 spike (#49). Research only: nothing here was implemented, no
> dependency was added, and no account was created for any of the services
> below. Every measurement was taken on **20 August 2026** with `curl` against
> public endpoints; the commands are quoted where the number matters.

**Verdict: build the lookup, don't build the scanner.**

Three separate decisions come out of this, and they are worth stating apart
because they fail for different reasons:

1. **Source: Open Food Facts, imported.** It is the only candidate whose licence
   permits us to hold a copy, and the only one with real Brazilian coverage that
   does not require signing a contract to see. Every commercial API either
   forbids storing what it returns or cannot be evaluated without registering.
2. **Shape: a table in Neon behind our own route,** exactly like TACO — not a
   proxy, and not a call from the browser to anybody. A barcode lookup is a
   request that says *this person is about to eat this*, and the only version of
   that request which keeps § D1's promise is the one that never leaves our own
   infrastructure.
3. **Camera: `BarcodeDetector` where it exists, nothing where it does not.** The
   WASM fallback costs 441 KB brotli — 1.6× the entire app's JavaScript — to
   serve a case the keyboard already serves correctly. Typing 13 digits is
   *verifiable*; the EAN-13 check digit catches 100% of single-digit typos.

**The failure mode this accepts is "not in the database."** A gate at import
time throws away every record that cannot be trusted, which makes the miss rate
worse and the wrong-answer rate better. See
[§ Which failure mode](#which-failure-mode) for why that trade is the only
honest one available, and for the residual risk it does *not* remove.

---

## The candidates

### Open Food Facts

The licence, verbatim from [the data page](https://world.openfoodfacts.org/data):

> The Open Food Facts database is available under the Open Database License.
> The individual contents of the database are available under the Database
> Contents License. Products images are available under the Creative Commons
> Attribution ShareAlike licence.

And from [the API conditions](https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api):
"two conditions are attribution and share-alike."

ODbL is the one licence in this comparison that lets us hold a copy. It also
obliges us to publish the derived database under ODbL and to credit the source —
neither of which is a problem: the repository is public by § D3, and § D12
already treats attribution as a licence condition rather than a courtesy, with a
single definition in `src/lib/attribution.ts` rendered by the footer.

**Brazilian coverage.** 35,535 products:

```
curl "…/api/v2/search?countries_tags_en=brazil&page_size=1&fields=code"  → count 35535
```

**Nutrient completeness**, by Open Food Facts' own state tag:

| | products | share |
|---|---:|---:|
| `en:nutrition-facts-completed` | 27,986 | 78.8% |
| `en:nutrition-facts-to-be-completed` | 7,549 | 21.2% |

The two sum to 35,535 exactly, so the split covers the whole corpus.

Completeness is not evenly spread, and the way it is uneven happens to favour
us. Of the **100 most popular** Brazilian products, 95 carry all four of energy,
protein, carbohydrate and fat per 100 g; 100 are named and 99 are branded; the
median record was last modified 87 days ago and none is older than two years. Of
the **100 most recently created** — all added within the previous 4.6 days, so
roughly 22 new Brazilian products a day — only 82 carry all four, 16 carry no
macros at all, and 8 have no name.

Coverage is good at the head and thin in the tail, which is the right shape for
a feature people use on things they actually buy. It is worth keeping the tail
in proportion, though: GS1 Brasil reports more than 13.5 million items in the
national registry. Open Food Facts holds tens of thousands. Most barcodes in
Brazil are not in it and will not be.

**API limits**, from [the developer docs](https://openfoodfacts.github.io/openfoodfacts-server/api/):
15 req/min/IP for product reads, 10 req/min/IP for search; a custom User-Agent
is mandatory; reads need no key. And, unprompted:

> If you need to fetch more than a few hundred products, we ask you to download
> the data as a CSV or JSONL file directly.

**Availability.** Worth recording because it argues against depending on them at
request time: during this spike two search calls returned an HTML *"Page
temporarily unavailable"* page instead of JSON, and an earlier fetch returned
HTTP 503. This is a volunteer-run service doing us a favour, not an SLA.

**Dumps.** Nightly, in MongoDB, JSONL (gzip), Parquet (via Hugging Face), CSV
(gzip, ~0.9 GB compressed / ~9 GB uncompressed) and RDF.

### Edamam

$14 / $69 / $299 per month; 700,000+ UPC/ITN/EAN codes; no statement anywhere
about country coverage. It is ruled out by its terms, not its price:

> API customers can cache only the four basic macro nutrient datapoints -
> protein, total fat, net carbs and calories as well as the foodId, food label
> and food image.

> The data returned in the response can be only used for presentation to the
> human end user who initiated the request and can not be stored unless
> explicitely permetted by Edamam.

> All plans allow only human, end user driven requests.

An offline-first PWA stores what it shows. A diet built in March has to open in
June on a train with no signal. "Present it, don't keep it" and "works offline"
are not two requirements that can both be met.

### FatSecret Platform

Brazil is listed — "BR | Brazil | Portuguese" — and the barcode database is the
strongest claim in the field ("A barcode success rate exceeding 90%"). Two
problems. First: "**Localization** is a premium feature only made available to
select accounts for specific languages and regions", so the Brazilian data set
is behind a sales conversation, and Premier pricing is not published. Second:
their public documentation says nothing about caching or retention, which means
the question that killed Edamam cannot even be asked without signing up —
explicitly out of scope for this issue.

### Nutritionix

Cannot be evaluated at all right now. As of 20 August 2026 `nutritionix.com`
serves a holding page — *"Our full website is temporarily offline while we roll
out major upgrades"* — `docs.nutritionix.com` does not resolve, `/business/api`
returns 303, and `trackapi.nutritionix.com/v2/search/item?upc=…` returns 401.
The API terms are not publicly readable. Reading them requires becoming a
registered partner, which this issue rules out. Its centre of gravity is US
restaurant menus regardless.

### Spoonacular

Free tier is 50 points/day; paid $29 / $79 / $149 / $300+ per month with overage
at $0.002–0.005 per point. The pricing page does not mention UPC lookup at all.
It is a recipe API with a US grocery database attached. No Brazilian claim.

### GS1 Brasil — Cadastro Nacional de Produtos

The one authoritative Brazilian source, and it does not have what we need. The
API returns brand, product description, GPC classification, destination market,
CEST, NCM, gross weight, photo URL, lower-level GTIN and quantity contained —
**no nutrient fields**. Access requires being a GS1 Brasil *associado* with CNP
credentials, i.e. a paid membership and a signup. Both halves fail: wrong data,
and a door we are not allowed to knock on in this issue.

### ANVISA / dados abertos

ANVISA publishes open data on regularised products, irregular products, food
supplements and the labelling system. Nothing found is a product-level nutrient
table keyed by GTIN. RDC 429/2020 and IN 75/2020 impose a *format* on labels;
they do not create a database of what those labels say. There is no Brazilian
government equivalent of USDA FoodData Central for packaged goods.

---

## The comparison

| | Brazilian coverage | Licence | Cost | Data retention | Offline | Nutrients per 100 g |
|---|---|---|---|---|---|---|
| **Open Food Facts** | 35,535 products; 78.8% with complete nutrition facts | ODbL + DbCL (+ CC-BY-SA images) — attribution **and** share-alike | free | ours to keep; obligation runs the other way (must publish derivative as open data) | full — nightly dumps, ours to import | yes, and per-serving alongside |
| **Edamam** | not stated | proprietary | $14–$299/mo | **four macros only, "can not be stored"** | impossible under the terms | yes |
| **FatSecret** | BR/pt listed, behind "premium … select accounts" | proprietary | Premier, price on request | not published | unknown | yes |
| **Nutritionix** | not stated; US menu-first | proprietary | not published | terms unreadable (site offline) | unknown | yes |
| **Spoonacular** | none claimed | proprietary | $0–$300+/mo | not examined | no | recipe-oriented |
| **GS1 Brasil CNP** | authoritative, 13.5M+ items | membership contract | paid membership | n/a | n/a | **none** |
| **ANVISA** | n/a | open | free | n/a | n/a | **no such dataset** |

---

## Three different privacy stories

The issue is right that this is the part that decides it. The same feature has
three implementations that differ in nothing the user sees and everything that
matters:

**A. Browser calls the vendor directly.** Technically the easiest — Open Food
Facts sends `access-control-allow-origin: *` and sets no cookie, so it works
from a page today. It is also the only option that breaks a sentence already
published in our privacy notice: *"não há venda nem compartilhamento de dados
com terceiros."* The user's IP, their User-Agent and the GTIN of the thing in
their hand reach a third party we do not control, under a retention policy we
have not audited, once per scan. Ruled out.

**B. Our server proxies the vendor.** Keeps the user's IP off the vendor, moves
it onto ours — and moves the whole app's traffic onto **one** IP, against a
documented limit of 15 requests per minute. Fifteen users scanning at once is
enough. It also makes the feature's availability equal to theirs, which the two
"temporarily unavailable" responses above suggest is not a good trade.

**C. We import the data and serve it ourselves.** The request goes to `/api/…`
and stops there — the same path `/api/foods` already takes for TACO, whose route
comment already says what has to be said about it: the term "appears in the logs"
of the host and the privacy notice says so rather than claiming a silence we do
not control. A GTIN in that URL is a stronger signal than the word *arroz*, so
the notice would need its own bullet under "O que o servidor recebe" — but it is
still one line about our own infrastructure, not a new third party.

**C is the only one compatible with § D1.**

The import is not large. Measured on a 200-product sample, a minimal record
(code, name, brand, and the four numbers) costs 105 bytes raw / 38 bytes gzipped;
across 35,535 products that is **≈3.7 MB raw, ≈1.3 MB gzipped** — an ordinary
Postgres table, roughly 60× the row count of TACO's 597 foods.

### What this does to the architecture

Not nothing, and worth pricing before anyone starts:

- **`src/lib/db/boundary.test.ts` holds an exact allowlist of ten tables.** A new
  one has to be added there deliberately. That is the check working, not a
  problem — but it means the table name and its columns must pass the
  personal-segment denylist too.
- **§ D12 says food data is TACO, cited on every screen.** A second source means
  the footer's single citation is no longer sufficient: an Open Food Facts row
  must be visibly *not* a TACO row, wherever it appears, and ODbL attribution has
  to sit somewhere permanent (`/fontes`).
- **ODbL share-alike applies to the derived table.** Publicly using a derivative
  database obliges us to offer it under ODbL. Our repository is public anyway, so
  this costs a documented dump, not a change of plan.
- **§ D14's ingest model does not transfer.** TACO is a 2011 edition extracted
  once and checked in. Open Food Facts gains ~22 Brazilian products a day and
  edits existing ones continuously; a checked-in snapshot is stale from the
  moment it lands. This is a recurring refresh job, which is a different
  operational commitment from anything the project has today.
- **Offline behaviour is unchanged, and already accepted.** A barcode lookup
  would be exactly as offline-capable as food search is now: not at all, because
  both read a server-side reference table. The PWA does not break — the offline
  route handles it — it simply cannot answer. Nothing personal is involved either
  way.

---

## How good is the data, really

Good enough to be dangerous, which is the finding that shaped the
recommendation.

Of the 100 most popular Brazilian products, three carry values that are wrong
rather than missing:

| Product | GTIN | Stated per 100 g | Problem |
|---|---|---|---|
| Qualy Cremosa com sal | 7893000394209 | 7,220 kcal | Physically impossible — pure fat is ~900 |
| Salgadinho de batata creme e cebola | 7896004006239 | 528 kcal, macros implying 258 | Energy and macros disagree by 2× |
| **achocolatado em pó, NESCAU** | 7891000412855 | 86 kcal, 3.5 P, 13 C, 2.1 F | The 20 g *serving* values filed as per-100 g |

The first two are catchable by arithmetic: energy above 900 kcal per 100 g,
macros summing over 100 g, or energy more than 60% away from 4P + 4C + 9F. Open
Food Facts catches them itself — 2 of the top 20 products carry
`data_quality_errors_tags`, and they are the same two.

The third is the one that matters. It is the **single most popular Brazilian
product in the database**, its numbers are internally consistent
(4·3.5 + 4·13 + 9·2.1 = 84.9 ≈ 86), the record even declares
`nutrition_data_per: "100g"` — and it is wrong by a factor of 4.4. Another
Nescau entry in the same top twenty (7891000426210) says 380 kcal, which is
right. No sanity check reaches this. Only a human comparing the screen to the
packet does.

So a quality gate at import — require all four values per 100 g, reject
`data_quality_errors_tags`, reject impossible energy, reject Atwater
disagreement — would admit roughly 93 of the top 100 and about three-quarters of
the corpus, and would still ship the Nescau row.

---

## Scanning in the browser

### `BarcodeDetector`

Per MDN's compatibility data: Chrome, Edge and Chrome Android 83+, Samsung
Internet 13, Android WebView 83. **Firefox: no. Safari: no. Safari iOS: no.**

It is not even universal within Chrome, because it is a wrapper over a platform
library. Chrome's own documentation:

> Barcode detection is available on macOS, ChromeOS, and Android. Google Play
> Services are required on Android.

Desktop Windows and Linux Chrome therefore do not have it either.

For a pt-BR-only app that mostly runs on phones, this lands better than it
sounds. Brazil's mobile OS split in July 2026 was **Android 77.59% / iOS 22.41%**
(StatCounter). Roughly four in five Brazilian phones get a native scanner for
free; the rest — plus every desktop — get nothing.

### The price of covering the rest

`zxing-wasm` 3.1.3 (MIT), measured over the wire from jsDelivr:

| | raw | brotli |
|---|---:|---:|
| `zxing_reader.wasm` | 1,093,289 B | **440,870 B** |
| ES module | 42,730 B | 13,015 B |
| **the whole app's client JS today** (22 files, `next build`) | 942,661 B | **275,420 B** |

The fallback scanner is **1.6× the entire application**, downloaded to give
iPhone users a camera button. Even precached by the service worker — where it
sits in the cache budget forever — that is the most expensive thing in the
project by a wide margin, and it buys a convenience, not a capability.

### Camera permission

`getUserMedia` needs HTTPS (we have it) and a user gesture (fine), but the
denial is the design problem: a refused camera permission is remembered per
origin and cannot be re-requested from JavaScript. The user has to find it in
browser settings. Any scanner has to treat "denied" as a permanent state with a
working alternative behind it — which is the typed field, again.

### Is scanning worth it at all, versus typing 13 digits?

Typing has a property scanning does not: **the input validates itself.** EAN-13's
check digit is a mod-10 with 1/3 weights. Simulated over 20,000 random codes:

- single-digit substitution: **20,000 / 20,000 caught (100%)**
- adjacent transposition: **16,044 / 18,017 caught (89.0%)** — the misses are
  exactly the pairs differing by 5, which the weighting cannot distinguish

All 194 thirteen-digit codes collected from Open Food Facts during this spike
validate against it (6 of the 200 were EAN-8, which the same algorithm handles at
a different length). So a typed field can reject a mistyped barcode *before* any
lookup happens, with certainty for the commonest error class. A mistyped code
that slips through fails as "not found", not as the wrong food.

That is the argument for shipping the keyboard first and the camera second: the
keyboard is the correct path with a fallback, and the camera is an accelerator
for it.

---

## Which failure mode

The issue asks which of the two we accept. **A product that is not in the
database**, deliberately and by a wide margin.

Wrong data in a diet app is not a wrong number on a screen. It propagates: the
macro solver (#19) redistributes every other food's quantity to compensate for
whatever this one claims, so one bad row silently rewrites the whole meal. A
missing product produces a dead end the user can see and route around — the
custom-foods screen already exists for exactly this, and someone holding the
packet can read the label better than any database can.

Concretely that means:

- import only records passing the gate above, accepting that this discards
  roughly a quarter of the Brazilian corpus;
- show source and values **before** anything is added to a diet, never silently;
- mark Open Food Facts rows visibly as crowd-sourced, distinct from TACO's
  laboratory measurements, wherever a food appears;
- keep "não encontrado → cadastrar como alimento personalizado" as the designed
  outcome rather than the error state.

And the residual risk, stated plainly because the gate does not remove it: a
plausible, internally consistent, completely wrong record can pass every check we
know how to write. The Nescau row is the proof. Treating this feature as a
*shortcut for typing in a label the user is holding* — rather than as an
authority on what is in the tin — is the only mitigation that survives contact
with the data.

---

## What this does and does not settle

**Settled.** Which source (Open Food Facts). Which licence obligations follow
(attribution, share-alike, published derivative). Which topology (import, not
proxy, not direct). Which failure mode (missing, not wrong). Whether to buy a
commercial API (no — one forbids storage outright, two cannot be read without
signing up, one has no Brazilian claim). Whether GS1 or ANVISA can help (no).
Whether to ship a WASM scanner (no).

**Not settled, and out of scope here.** The refresh cadence and its plumbing.
The exact gate thresholds — the Atwater tolerance above is a first cut measured
on 100 products, not a tuned number. How an Open Food Facts food is represented
next to a TACO food in the schema, given § D13 stores published values as
`numeric` quotations. Whether the imported table also feeds ordinary name search
or stays barcode-only. What the pt-BR wording is for "this came from a
crowd-sourced database". And the size of the win: nobody has measured how often a
Brazilian user's actual shopping basket is in those 35,535 products, and the
tail statistics above suggest that number could disappoint.

**Explicitly not done, per the issue.** No scanner was written, no dependency was
added, and no account was created anywhere.

---

## Sources

- Open Food Facts — data & licences: <https://world.openfoodfacts.org/data>
- Open Food Facts — API reference and rate limits: <https://openfoodfacts.github.io/openfoodfacts-server/api/>
- Open Food Facts — API conditions: <https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api>
- Edamam Food Database API: <https://developer.edamam.com/food-database-api>
- FatSecret Platform API and localization guide: <https://platform.fatsecret.com/platform-api>
- Nutritionix (holding page, 20 Aug 2026): <https://www.nutritionix.com/apiterms>
- Spoonacular pricing: <https://spoonacular.com/food-api/pricing>
- GS1 Brasil — CNP API portal: <https://portalapi.gs1br.org/> · <https://www.gs1br.org/cadastro-nacional-de-produtos>
- GS1 — Brazil national product registration: <https://www.gs1.org/resources/articles/brazil-uses-gpc-their-national-product-registration>
- ANVISA — dados abertos: <https://www.gov.br/anvisa/pt-br/acessoainformacao/dadosabertos>
- MDN — `BarcodeDetector`: <https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector>
- Chrome for Developers — Shape Detection API: <https://developer.chrome.com/docs/capabilities/shape-detection>
- `zxing-wasm` on npm: <https://www.npmjs.com/package/zxing-wasm>
- StatCounter — mobile OS market share, Brazil, July 2026: <https://gs.statcounter.com/os-market-share/mobile/brazil>
