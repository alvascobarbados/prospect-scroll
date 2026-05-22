/**
 * Image operations for product_images.
 *
 * Invariant: any role with ≥1 image has exactly one is_primary=true.
 * All add/delete/promote/role-change paths must go through these helpers.
 */
import { supabase } from "@/integrations/supabase/client";

export type ImageRole = "hero" | "reference" | "additional";

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  role: ImageRole;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export async function fetchProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("id, product_id, url, role, is_primary, sort_order, created_at")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductImage[];
}

/** Re-assert the invariant: each non-empty role has exactly one primary. */
async function ensurePrimaryFor(productId: string, role: ImageRole) {
  const { data, error } = await supabase
    .from("product_images")
    .select("id, is_primary, sort_order, created_at")
    .eq("product_id", productId)
    .eq("role", role)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return;
  const primaries = rows.filter((r) => r.is_primary);
  if (primaries.length === 1) return;
  if (primaries.length === 0) {
    await supabase
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", rows[0].id);
    return;
  }
  // More than one — keep the first, demote the rest.
  const keep = primaries[0].id;
  const demote = primaries.slice(1).map((r) => r.id);
  if (demote.length) {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .in("id", demote);
  }
  // Make sure keep stays primary
  await supabase.from("product_images").update({ is_primary: true }).eq("id", keep);
}

export async function uploadImageFile(
  productId: string,
  file: File,
  role: ImageRole = "additional",
): Promise<ProductImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be smaller than 8MB");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("product-images")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);

  // Determine if this becomes primary: empty role → primary.
  const { count, error: cErr } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("role", role);
  if (cErr) throw new Error(cErr.message);
  const becomesPrimary = (count ?? 0) === 0;

  // Sort_order = max+1 for product
  const { data: maxRow } = await supabase
    .from("product_images")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      url: pub.publicUrl,
      role,
      is_primary: becomesPrimary,
      sort_order: nextOrder,
    })
    .select("id, product_id, url, role, is_primary, sort_order, created_at")
    .single();
  if (error) throw new Error(error.message);

  await ensurePrimaryFor(productId, role);
  return data as ProductImage;
}

export async function deleteImage(image: ProductImage) {
  const { error } = await supabase.from("product_images").delete().eq("id", image.id);
  if (error) throw new Error(error.message);
  await ensurePrimaryFor(image.product_id, image.role);
}

/** Promote an image to primary of its current role. */
export async function setPrimary(image: ProductImage) {
  if (image.is_primary) return;
  // Demote current primary first to satisfy unique index.
  await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", image.product_id)
    .eq("role", image.role)
    .eq("is_primary", true);
  const { error } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", image.id);
  if (error) throw new Error(error.message);
}

/**
 * Change an image's role and (optionally) set it as the new primary of that role.
 * Always preserves invariants in BOTH the source and destination role.
 */
export async function setRole(
  image: ProductImage,
  nextRole: ImageRole,
  makePrimary: boolean,
) {
  if (image.role === nextRole && !makePrimary) return;
  if (makePrimary) {
    // Clear current primary of destination role to avoid unique violation.
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", image.product_id)
      .eq("role", nextRole)
      .eq("is_primary", true);
  }
  const { error } = await supabase
    .from("product_images")
    .update({
      role: nextRole,
      is_primary: makePrimary
        ? true
        : nextRole === image.role
          ? image.is_primary
          : false,
    })
    .eq("id", image.id);
  if (error) throw new Error(error.message);

  // Source role may have lost its primary; destination may still be empty of primary.
  if (image.role !== nextRole) await ensurePrimaryFor(image.product_id, image.role);
  await ensurePrimaryFor(image.product_id, nextRole);
}
