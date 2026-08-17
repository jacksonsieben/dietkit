# TACO — licensing, provenance and attribution

> Resolves the P0 launch blocker (#4), and states the terms the ingest (#3)
> implements. Read this before touching `scripts/taco/`.
>
> This is an engineering summary of a published permission notice, written so
> the constraints are actionable. It is not legal advice.

## Verdict

**Redistribution is permitted, on one condition: cite the source.** NEPA/UNICAMP
says so in the publication itself, twice, in plain language. DietKit may ship the
TACO values, and must attribute them everywhere they appear.

## The terms, verbatim

From *Tabela Brasileira de Composição de Alimentos – TACO*, 4ª edição revisada e
ampliada (NEPA/UNICAMP, 2011), PDF page 4:

> Tabela Brasileira de Composição de Alimentos – TACO é uma publicação do NEPA.
> É permitida a reprodução total ou parcial do material, desde que seja citada a
> fonte.

And again on PDF page 5, under the copyright line:

> 2011. Núcleo de Estudos e Pesquisas em Alimentação – NEPA
> Universidade Estadual de Campinas – UNICAMP
> É permitida a reprodução parcial ou total desta obra, desde que citada a fonte.

In English: *reproduction of the material, in whole or in part, is permitted
provided the source is cited.*

There is no non-commercial clause, no share-alike clause, no registration step
and no permission request to file. The single obligation is attribution.

## What the notice does and does not settle

**Settled — we may:**

- Reproduce the values, in whole or in part, including inside a public product.
- Store them in our own database and serve them over our own API. A database is
  a form of reproduction; the notice does not restrict the medium.
- Do so at no cost and without asking, commercially or otherwise.

**The notice is silent on:** adaptation. Brazilian copyright law treats
reproduction (Lei 9.610/98 Art. 29 I) and adaptation into a derivative work
(Art. 29 III) as separate rights, and NEPA granted the first in as many words.
Our ingest therefore deliberately stays on the reproduction side of that line:

- **Values are copied, never recomputed.** No unit conversion, no rounding, no
  4/4/9 recalculation of energy, no filling of gaps by estimate. TACO's numbers
  are already per 100 g of edible portion — the basis DietKit uses — so there is
  nothing to convert. Both energy columns are stored as printed; the parser uses
  kJ ≈ kcal × 4,184 only to *check* itself, never to derive a missing figure.
- **`NA`, `Tr` and `*` are preserved as themselves**, not silently coerced to
  zero. "Not applicable", "trace" and "withdrawn pending re-analysis" are
  findings, and flattening them would be editing the table's content rather than
  reproducing it. A cell TACO leaves blank stays blank for the same reason.
- What we change is the *container*: column names become field names, the food
  name gets an accent-folded copy alongside it for search, and group names get a
  slug. Food ids are TACO's own numbering, not ours. None of that alters a
  reported value.

That interpretation is deliberately conservative and it is not free —
it is the reason the ingest has no "clean up the data" step. See **Open item**
below.

## Provenance of the copy we use

| | |
| --- | --- |
| Source | <https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/> |
| Publisher | NEPA — Núcleo de Estudos e Pesquisas em Alimentação, UNICAMP |
| Edition | 4ª edição revisada e ampliada, Campinas, 2011 |
| Contents | 597 foods, per 100 g of edible portion |
| File | PDF, 164 pages, 744,346 bytes |
| SHA-256 | `2002aec5615b5b1395aaa8fa675635bbb7f712c33f278af5e332f1cac8f108c8` |
| MD5 | `906f6f7943a51d5a9a32c992c58d9e21` |
| Retrieved | 2026-08-17 |
| Project contact | `taco@unicamp.br` |

The copy mirrored by the CFN (`cfn.org.br`) is **byte-identical** to the one
served by NEPA — same SHA-256 — so a reader can verify provenance from either
host. The hash is pinned in `src/lib/attribution.ts`: `taco:extract` refuses a
PDF that is not this file, `db:seed` refuses a `data/taco-4ed.json` that does not
claim it, and the row it writes to `dataset_versions` carries the hash, the byte
count, the source URL, the retrieval date and the citation — so a value in the
database can always be traced back to the document this table describes.

The 4th edition (2011) is the last one NEPA published. There is no newer TACO.

One inconsistency to expect while ingesting: the 4th *edition* describes itself
in its own introduction as "esta terceira versão" — the printed edition number
and the data version number are off by one, because the 4th edition is a revised
printing of the third data release. Both agree on 597 foods, which is the number
that matters.

## Why TACO and not TBCA

The obvious alternative is the **TBCA** (Tabela Brasileira de Composição de
Alimentos, USP/FoRC, version 7.3 as of 2025 — <https://www.tbca.net.br>). It is
larger and actively maintained, and TACO has not been revised since 2011, so on
data quality alone TBCA would win.

Its terms rule it out. TBCA is published under **CC BY-NC-ND** — non-commercial,
no derivatives — and its site states outright that reproduction of the material,
in whole or in part, is not permitted and that altering the content is
prohibited. Non-commercial use requires contacting the coordinators; commercial
use requires their agreement. For a public product that redistributes the values
in a database, ND alone is disqualifying.

So the trade is explicit and worth naming: **DietKit accepts 2011 data in
exchange for the right to ship it.** TACO's values are laboratory measurements of
Brazilian foods, not estimates, and food composition does not go stale the way
software does. If a future version needs TBCA's coverage, that is a conversation
with USP/FoRC, not a code change.

(TBCA's terms are theirs to change; the summary above is what their site stated
when this was written.)

## Required attribution

The reference below is the agreed wording. It is defined once, in
`src/lib/attribution.ts`, and everything else renders it from there — a test
fails if this document and that file disagree.

```
NÚCLEO DE ESTUDOS E PESQUISAS EM ALIMENTAÇÃO (NEPA). Tabela brasileira de
composição de alimentos — TACO. 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP,
2011. Disponível em: https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/
```

ABNT form, matching the *ficha catalográfica* printed in the publication.

**Where it appears:**

| Surface | What is shown |
| --- | --- |
| Site footer, every page | Short credit naming NEPA/UNICAMP, linking to `/fontes` |
| `/fontes` | Full reference, the permission notice verbatim, what we changed, the non-affiliation statement |
| README | Full reference, in a Data sources section |
| `LICENSE` | The MIT/data split — MIT covers the code and does not extend to TACO |
| Every food record in the API (#16) | Its source, so a value can never be shown detached from where it came from |
| `dataset_versions`, one row per ingest | The citation stored beside the hash, edition and retrieval date of the file the values came from |
| `npm run db:seed` output | The reference, printed where whoever runs the ingest sees it |

The user-facing rule, in one line: **no screen shows a TACO number without a
route to the credit.** Footer on every page satisfies that with no per-screen
discipline required.

## Rules we hold ourselves to

1. **Never imply endorsement.** NEPA and UNICAMP published a table; they did not
   review, approve or endorse this app. `/fontes` says so explicitly.
2. **Never present a computed number as TACO's.** Anything DietKit derives —
   totals, a recipe scaled to 173 g, macro targets — is DietKit's arithmetic on
   TACO's per-100 g values, and the wording distinguishes them.
3. **Never use NEPA's or UNICAMP's name or marks as branding**, in the app name,
   logo, domain or store listing. The permission covers the material, not the
   institutions' identity.
4. **Custom foods are visibly not TACO.** Once users add their own foods (#17)
   the origin of every row is shown, or the attribution becomes a lie about the
   rows it does not cover.
5. **Attribution is not a settings toggle.** It has no off switch, and it does
   not live behind a modal the user can dismiss permanently.

## Open item — not a blocker

Worth an email to `taco@unicamp.br`: confirming that a normalised database copy
of the values counts as *reprodução* under the notice, and asking whether NEPA
prefers a specific citation format for software.

It is not a launch blocker. Reproduction in whole is expressly permitted, no
reported value is altered, and the citation is present everywhere the data is —
so the conservative reading is already satisfied. A reply would let the ingest
drop its "copy values verbatim" constraint, which would be a convenience, not a
fix.

## Licence split

- **Code** — MIT, per `LICENSE`.
- **TACO data** — © 2011 NEPA/UNICAMP, reproduced under the permission quoted
  above. Not MIT, not ours to relicense. `LICENSE` states this so that nobody
  vendoring this repository assumes MIT covers the `foods` table.

## Sources

- [TACO 4ª ed. (PDF), NEPA/UNICAMP](https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/) — the permission notice, PDF pages 4–5
- [NEPA publications index](https://nepa.unicamp.br/publicacoes/)
- [TBCA, USP/FoRC](https://www.tbca.net.br/) — terms of the alternative that was rejected
