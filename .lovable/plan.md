## Products Page Rebuild — Two-Card System

This is a large multi-part build. Splitting into three phases so you can verify each before moving on.

---

### Phase 1 — Schema + Suppliers UI (foundation)

**Migration 1+2 (additive, safe):**
- `suppliers.code TEXT` with format check `^S[A-Z]{2}$` + unique constraint (nullable for now)
- `products.parent_product_id UUID` → self-FK with `ON DELETE SET NULL`
- `products.display_order INTEGER`
- `products.variant_label TEXT`
- Index `idx_products_parent`

(Note: `parent_product_id` already exists from a prior migration — I'll skip if present and only add the two new columns.)

**Suppliers UI update** (`src/components/leads/SupplierListPage.tsx` and the supplier edit cell/sheet):
- New **Code** column in the suppliers list, second position. Shows the 3-char code or `—`.
- Inline editor with locked `S` prefix display + 2-char uppercase input. Validates `^S[A-Z]{2}$`, uniqueness server-side via a pre-save query, shows inline error on conflict.
- Reuses the existing `src/lib/supplierCode.ts` helpers (already in repo) — extending them for the new `S__` format.

**Stop point:** I'll pause after Phase 1 so you can populate every supplier's code through the new UI. Then say "run backfill" and I'll execute migration 3 (prefix existing item numbers) + migration 4 (NOT NULL lockdown).

---

### Phase 2 — Products page rebuild (read-only)

New file tree under `src/components/products/`:

```
ProductsPage.tsx           page wrapper, fetch + buildList
ProductsList.tsx           maps ListItem[] → cards/groups
SupplierProductCard.tsx    Card 101 (standalone)
SupplierProductGroup.tsx   Card 102 (associated wrapper)
SupplierProductRow.tsx     shared row body (used by both)
SupplierSpine.tsx          rotated navy spine
DecorationBlock.tsx        method name + qty/unit/setup table
helpers/
  formatPrice.ts           $0 → em-dash rule
  formatLeadTime.ts        en-dash range
  formatUpdated.ts         date-fns formatDistanceToNowStrict
  buildProductsList.ts     groups children under parents, enforces consecutive
```

`src/pages/Products.tsx` becomes a thin re-export of `ProductsPage`. The huge spreadsheet implementation is removed (committed via prior prompts but superseded).

**Layout exactly as specified:**
- ~1085px card width, page wrapper `overflow-x: auto`
- 6-column grid: `110px 200px 90px 195px 195px 195px`
- Navy spine `#0E2849`, white text, `writing-mode: vertical-rl; rotate(180deg)`
- Code pill `#E5EAF1` bg / `#0E2849` text, immediately followed by `-{suffix}` (no space). Missing code → warm warning pill `?` with `#FEF3E2` / `#C2410C` + tooltip.
- Always exactly 3 decoration slots; pad with dashed `+ Add decoration` placeholders. Click is a no-op for now.
- `$0.00` → `—` everywhere via `formatPrice`
- Lead time uses en-dash for ranges
- Updated timestamp italic, top-right of identity

**Data fetch:** single Supabase query with the nested join shown in the prompt, using existing table names. (Note: prompt mentioned `product_subcategories` and `decoration_method_details` — actual tables in this DB are `product_categories` and `method_details`. I'll map to the real names.)

**Grouping logic:** `buildProductsList()` exactly as in the prompt — children rendered only inside the parent's `SupplierProductGroup`, sorted by `display_order ASC NULLS LAST` then `name`.

**Card 102 specifics:**
- Outer rounded wrapper, light gray header strip with link icon + `<strong>{parent}</strong> · {N} linked variants` + `Associated` pill
- Single shared spine spanning body only (not header)
- Thin dividers `#F1F2F4` with `margin-left: 26px`
- Per-row size chip when `variant_label` is set

**Routing:** `/products/new` and `/products/:id` (the old `ProductDetail` route) are kept as a 404 redirect to `/products` since edit UI is explicitly out of scope.

---

### Phase 3 — Seed test data

After the build works, I'll insert the 4 test products described (Golf Umbrella, Canvas Tote, Ceramic Mug, Feather Banner family of 3) via the `insert` tool — including their `product_details`, `product_decorations`, and `product_decoration_bands`. Requires that Freedom Gifts, HXIN, Caremax, and Admax suppliers already exist with codes `SFG`, `SHX`, `SCM`, `SAD` respectively.

---

### Out of scope (explicitly skipped per prompt)
Edit modals, add-product flow, add-decoration flow, filter/sort/search, image upload, mobile layout, print, inline-edit affordances on the new cards.

---

### Tailwind tokens
Adding `colors.brand.navy = '#0E2849'` (the prompt's exact hex, which differs slightly from the existing `--brand-navy` HSL `#1B2A4E`). Per prompt instructions: "Use the exact hex values specified above." So this introduces a second brand-navy specifically for the Products page card spine/text — won't touch the global `--brand-navy` token used elsewhere.

---

Ready to start with Phase 1?
