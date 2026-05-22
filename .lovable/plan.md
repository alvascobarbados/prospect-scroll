
# Calculations — Cost Engine + Card

## What's already in the DB (so we don't rebuild it)

Confirmed via schema inspection:

- `shipping_methods` already has **`fuel_surcharge_pct`** and **`buffer_pct`** (DHL = 36/0, Ocean = 0/0). I'll use the existing column name `fuel_surcharge_pct` — **not** `fuel_pct` from the spec.
- `shipping_method_routes` exists with `fixed_cost` (the base fee) but **does not** have `lac_fixed_bbd` / `lac_per_cbm_bbd` — these are the only new columns I need to add.
- Route tiers table is **`shipping_method_tiers`** (columns: `route_id`, `band_from`, `band_to`, `rate`).
- `product_categories.duty_rate_pct` already exists — but it appears to be stored as **percent points** (e.g. `20`), not a decimal (`0.20`). The engine will divide by 100.
- `products.origin_id` is a FK to `origins`, with codes `CHINA / USA_MIAMI / USA_NON_MIAMI / BARBADOS / INDIA / VIETNAM`. Destinations: `BB / CBN`. Codes already match — no normalization step needed.
- `app_settings` already has `fx_rate_usd_bbd = 2.02768` and `fx_fee_pct = 2.0` (stored as **percent points**, not a decimal). I'll add the missing keys and keep the percent-points convention consistent.

## Part 1 — Schema migration

Single migration:

```sql
ALTER TABLE shipping_method_routes
  ADD COLUMN IF NOT EXISTS lac_fixed_bbd   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lac_per_cbm_bbd NUMERIC NOT NULL DEFAULT 0;
```

No new tables. No `fuel_pct` / `buffer_pct` columns — those already exist under their current names.

## Part 2 — Settings seed (via insert tool)

Add missing keys to `app_settings`:

| key | value | section |
|---|---|---|
| `customs_multiplier` | `2.0` | Customs & Duty |
| `conversions_kg_to_lbs` | `2.20462` | Conversions |
| `conversions_cbm_divisor` | `1000000` | Conversions |
| `conversions_volumetric_divisor` | `200` | Conversions |

Existing `fx_rate_usd_bbd` and `fx_fee_pct` are reused as-is. `effective_fx = base × (1 + fee_pct/100) = 2.02768 × 1.02 = 2.0682336`.

Seed LAC rows: `DHL-CHINA-BB / DHL-USAMIA-BB / DHL-USANON-BB → lac_fixed_bbd=80`; `OCEAN-CHINA-BB → lac_fixed_bbd=150, lac_per_cbm_bbd=90`. Everything else stays 0.

## Part 3 — Pure engine

`src/lib/calcEngine.ts` — one pure function `computeProductCalc(product, routes, settings) → CalcResult`. Types as in the spec, with `Money = { amount, currency }`. No literal numbers; everything injected.

Critical implementation rules baked in:

- `productTotalUsd = qty × unitUsd + setupUsd` (= FOB total — FC/ITC/ED hooks left as `extras: 0` config-driven, not hardcoded).
- `cartons` is **fractional** (no ceiling).
- Tier lookup is **simple**: `applied × tier.rate` (no progressive bracket summing).
- Fuel + buffer multiplications run **unconditionally** for every route (no `if > 0` branches); 0 just yields ×1.
- Cash path (`CIF→LDF`) uses `effectiveFx`. Customs path (`Duty`) uses **only** `customsMultiplier`. The two paths share zero code so they can't get mixed.
- Route active iff `route.origin === product.origin`; otherwise `null` bubbles.
- LAC/LDF/Duty/LDP computed only for `destination === 'BB'` routes.
- Per-unit = total / qty.
- Output kept at full float precision; rounding to 2dp lives in `formatMoney`.

## Part 4 — Formatter

`src/lib/formatMoney.ts` exporting `formatMoney(m: Money | null): string`. `null` or `amount === 0` → `—`. Otherwise `USD$1,234.56` / `BBD$2,634.75`. Prefix is always shown.

## Part 7 (done early) — Unit tests

`src/lib/calcEngine.test.ts` — vitest. Reproduces the SFG-AGU table from the spec (DHL + Ocean, 4 tiers each, FOB, transport, CIF, LAC, LDF, duty, LDP) at ±0.01. This is the gate before any UI work.

## Part 6 — Master Data: Shipping Methods UI

Edits to the existing Shipping Methods page:
- Surface `fuel_surcharge_pct` and `buffer_pct` editable fields on every method row (visible even when 0).
- Surface `lac_fixed_bbd` and `lac_per_cbm_bbd` editable fields on every route row (visible even when 0).
- Non-negative numeric validation; inline save like the existing editable cells.

## Part 5 — Calculations card UI

New route `/calculations` (already wired) — replace current content with the wide horizontal card per product.

Structure per product card (one flex row, `width: max-content`, in an `overflow-x: auto` wrapper):

1. **Spine** — reuse `SupplierSpine`.
2. **Image** — reuse existing cell.
3. **Identity** — reuse compact identity block.
4. **Specs** — pcs/ctn, dims, kg/ctn, lead time.
5. **Product Costs (white, USD, "Built")** — pricing tier table: Qty / Unit / Setup / **Total**.
6. **FOB (amber, USD)** — one bubble column "All routes", per row Total + /u.
7. **Transport (white, USD, "New")** — one bubble column **per route**, in fixed `sortOrder` (Courier methods, then Ocean, then by code). Active bubble shows two lines: working `33.07 lb · 0–61 @ USD$4.17` then result `(USD$36.35 + USD$137.92) × 1.36 = USD$236.98`. Inactive bubble: `—` + italic `origin mismatch`.
8. **CIF (amber, USD)** — bubble per route, Total + /u.
9. **LAC (white, BBD, "→ BB")** — BB routes only, working `BBD$150 + 0.04158 × BBD$90` then total.
10. **LDF (amber, BBD, "→ BB")** — BB routes only.
11. **Duty (white, BBD, "→ BB")** — BB routes only, working line uses USD inputs (`USD$391.98 × 2 × 0.20`), result line BBD.
12. **LDP (amber, BBD, "→ BB")** — BB routes only, bottom-line landed cost.

Route column order is computed once globally and identical on every card and every block — adding a new route in Master Data automatically adds the column everywhere.

**Selected route (the one that will eventually feed Pricelist):** per-row default = cheapest active BB route by LDP. Highlighting tokens as specified. Flagged below for Av's preference.

Styling tokens exactly per spec (`#FFFAF0` amber bg, `#F2D9B2` border, `#6B4F2A` text, `#0E2849` selected border on USD, etc.). `formatMoney` used for every monetary cell. `white-space: nowrap` on bubble headers and specs.

## Integration checklist I'll cover

- `formatMoney` retrofitted onto the existing Product Cost Total cell so prefixes match.
- Pricing tier `Total` column added to the decoration table if not already there (verify).
- Stable `sortOrder` derivation on routes.
- Engine output shape is JSON-serializable (snapshotting hook for later).
- `extras: { fc, itc, ed }` config-driven hooks in the engine, defaulted to 0.

## Open decisions — flagged, going with these defaults unless you say otherwise

1. **Selected route mechanism** — default = **cheapest active BB route per row** (most flexible; matches what Pricelist will want). Alternatives: global toggle, per-row dropdown. Picking cheapest-per-row now; trivially swappable later.
2. **Ocean fuel/buffer** — keeping 0/0 as already in the DB. Av confirms or overrides in Master Data.
3. **Money storage shape** — `{ amount, currency }` everywhere, never pre-formatted strings.
4. **Snapshotting** — engine output is designed serializable; not persisted in this phase.

## Execution order

1. Migration (Part 1) — **requires your approval before running**.
2. Settings seed via insert tool.
3. Engine + formatter + unit tests — green before any UI.
4. Master Data UI for LAC + surcharges.
5. Calculations card UI.

## Files / tables that will change

**DB**
- `shipping_method_routes` — +2 columns
- `app_settings` — +4 rows
- `shipping_method_routes` rows — LAC seed values

**New code**
- `src/lib/calcEngine.ts`
- `src/lib/formatMoney.ts`
- `src/lib/calcEngine.test.ts`
- `src/hooks/useCalcData.ts` (joins products + routes + settings for the page)
- `src/components/calculations/CalculationsCard.tsx` (the wide card)
- `src/components/calculations/blocks/*` (Specs, ProductCosts, FOB, Transport, CIF, LAC, LDF, Duty, LDP bubble components)

**Edited code**
- `src/components/calculations/CalculationsPage.tsx` — replace table with per-product cards
- `src/pages/ShippingMethods.tsx` (or its child) — expose fuel/buffer/LAC editable fields
- `src/components/products/SupplierProductRow.tsx` — retrofit `formatMoney` on the Total cell for prefix consistency
- `src/pages/Settings.tsx` — surface the 4 new conversion/customs keys (auto-rendered since it iterates `app_settings`)

Confirm and I'll start with the migration.
