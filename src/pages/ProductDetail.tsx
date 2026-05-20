/**
 * Product detail — placeholder. Full edit UI (decorations, bands,
 * detail labels, images, carton specs) will move here in a follow-up.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { supabase } from "@/integrations/supabase/client";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (active) { setProduct(data); setLoading(false); }
    })();
    return () => { active = false; };
  }, [id]);

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header
          className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}
        >
          <div className="px-4 sm:px-6 lg:px-8 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/products")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">PRODUCT</div>
              <h1
                className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}
              >
                {loading ? "Loading…" : product?.name || product?.primary_item_number || "Not found"}
              </h1>
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !product ? (
            <p className="text-sm text-muted-foreground">Product not found.</p>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Item #</div>
              <div className="tabular text-[15px]" style={{ color: "hsl(var(--brand-navy))" }}>
                {product.primary_item_number}
              </div>
              <p className="text-sm text-muted-foreground pt-4">
                Full detail editing (decorations, pricing tiers, detail labels, images, carton specs) is coming
                here. For now the list page is the source of truth — use the Master Data pages to manage
                suppliers, categories and decoration methods.
              </p>
            </div>
          )}
        </main>
      </div>
    </DesktopAppShell>
  );
}
