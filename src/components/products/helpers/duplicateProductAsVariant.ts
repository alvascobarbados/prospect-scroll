/**
 * Duplicate a product as a sibling.
 *
 * Grouping is now pure name-based — two products with the same name + supplier
 * automatically render together. So a "variant" is just a fully independent
 * product that happens to share the source's name and supplier. This helper:
 *
 * - Keeps the source's name + supplier + subcategory + origin (so name-based
 *   grouping picks it up).
 * - Mints a brand-new primary_item_number and a unique supplier_item_number
 *   suffix (-V2, -V3, …).
 * - Copies carton specs, lead times, decorations + tiers, and product_details
 *   verbatim. They become INDEPENDENT copies — editing one does not affect the
 *   other.
 * - Leaves variant_label/variant_name blank so the user can distinguish it.
 *
 * `parent_product_id` is no longer used for grouping. It is left null on the
 * new row.
 */
import { supabase } from "@/integrations/supabase/client";
import { composePrimaryItemNumber, nextSequenceFor } from "@/lib/productItemNumber";
import { originLetterFromCode } from "@/lib/originLetter";

export async function duplicateProductAsVariant(sourceProductId: string): Promise<string> {
  // 1. Load source product (full row)
  const { data: src, error: srcErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", sourceProductId)
    .single();
  if (srcErr || !src) throw new Error(srcErr?.message ?? "Source product not found");

  // 2. Need origin code → letter
  const { data: origin, error: oErr } = await supabase
    .from("origins")
    .select("code")
    .eq("id", src.origin_id)
    .single();
  if (oErr || !origin) throw new Error("Could not resolve source origin");
  const originLetter = originLetterFromCode(origin.code);
  if (!originLetter) throw new Error(`Origin ${origin.code} has no letter mapping`);

  // 3. Need subcategory code
  const { data: subcat, error: subErr } = await supabase
    .from("product_categories")
    .select("code")
    .eq("id", src.subcategory_id)
    .single();
  if (subErr || !subcat?.code) throw new Error("Source subcategory missing code");

  // 4. New primary_item_number — next sequence in subcategory
  const { data: existing } = await supabase.from("products").select("primary_item_number");
  const nums = (existing ?? []).map((r) => r.primary_item_number).filter(Boolean) as string[];
  const seq = nextSequenceFor(subcat.code, nums);
  const newPrimary = composePrimaryItemNumber(subcat.code, seq, originLetter);

  // 5. New supplier_item_number — append -V{n} suffix, find next free
  const baseItem = (src.supplier_item_number ?? newPrimary).replace(/-V\d+$/i, "");
  const { data: itemsRows } = await supabase
    .from("products")
    .select("supplier_item_number")
    .like("supplier_item_number", `${baseItem}%`);
  const taken = new Set(
    (itemsRows ?? []).map((r) => (r.supplier_item_number ?? "").toUpperCase()),
  );
  let n = 2;
  let newItemNum = `${baseItem}-V${n}`;
  while (taken.has(newItemNum.toUpperCase())) {
    n += 1;
    newItemNum = `${baseItem}-V${n}`;
  }

  // 6. Insert new product — name-based grouping means we just keep the name.
  //    parent_product_id is no longer used for grouping.
  const insert = {
    name: src.name,
    supplier_id: src.supplier_id,
    origin_id: src.origin_id,
    subcategory_id: src.subcategory_id,
    primary_item_number: newPrimary,
    supplier_item_number: newItemNum,
    parent_product_id: null,
    parent_name: null,
    variant_name: null,
    variant_label: null,
    image_url: src.image_url ?? null,
    carton_pack: src.carton_pack ?? null,
    carton_length: src.carton_length ?? null,
    carton_width: src.carton_width ?? null,
    carton_height: src.carton_height ?? null,
    carton_weight: src.carton_weight ?? null,
    production_days_min: src.production_days_min,
    production_days_max: src.production_days_max ?? null,
    moq: src.moq ?? null,
    notes: src.notes ?? null,
    supplier_description: src.supplier_description ?? null,
    supplier_item_name: src.supplier_item_name ?? null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await supabase
    .from("products")
    .insert(insert as any)
    .select("id")
    .single();
  if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create variant");
  const newId = inserted.id;

  // 8. Copy decorations + bands
  const { data: srcDecos } = await supabase
    .from("product_decorations")
    .select("id, method_detail_id, notes, sort_order, ref_image_url")
    .eq("product_id", sourceProductId);
  for (const d of srcDecos ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newDeco, error: dErr } = await supabase
      .from("product_decorations")
      .insert({
        product_id: newId,
        method_detail_id: d.method_detail_id,
        notes: d.notes,
        sort_order: d.sort_order,
        ref_image_url: d.ref_image_url,
      } as any)
      .select("id")
      .single();
    if (dErr || !newDeco) continue;

    const { data: bands } = await supabase
      .from("product_decoration_bands")
      .select("qty, unit_cost, setup_cost, inland_freight_usd")
      .eq("product_decoration_id", d.id);
    if (bands && bands.length > 0) {
      const rows = bands.map((b) => ({
        product_decoration_id: newDeco.id,
        qty: b.qty,
        unit_cost: b.unit_cost,
        setup_cost: b.setup_cost,
        inland_freight_usd: b.inland_freight_usd,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from("product_decoration_bands").insert(rows as any);
    }
  }

  // 9. Copy product_details
  const { data: details } = await supabase
    .from("product_details")
    .select("detail_label_id, value, sort_order")
    .eq("product_id", sourceProductId);
  if (details && details.length > 0) {
    const rows = details.map((dt) => ({
      product_id: newId,
      detail_label_id: dt.detail_label_id,
      value: dt.value,
      sort_order: dt.sort_order,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("product_details").insert(rows as any);
  }

  return newId;
}
