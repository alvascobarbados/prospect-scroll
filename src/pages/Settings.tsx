/**
 * Settings — sectioned page for app_settings (key/value rows grouped by
 * section) plus the Rounding Rules table rendered inline as an editable
 * tabular section.
 *
 * Sections render in display_order: Currency & FX, Customs & Duty, Freight,
 * then Rounding Rules.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { EditableCell } from "@/components/leads/SimpleMasterPage";
import { supabase } from "@/integrations/supabase/client";

interface AppSetting {
  id: string; section: string; key: string;
  value: string | null; value_type: string;
  display_label: string | null; display_order: number;
  description: string | null;
}
interface RoundingRule {
  id: string;
  band_min: number; band_max: number | null;
  round_up_to: number; description: string | null;
  display_order: number;
}

const SECTION_ORDER = ["Currency & FX", "Customs & Duty", "Freight"];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [rules, setRules] = useState<RoundingRule[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [s, r] = await Promise.all([
        supabase.from("app_settings").select("*").order("section").order("display_order"),
        supabase.from("rounding_rules").select("*").order("display_order"),
      ]);
      if (!mounted) return;
      if (s.data) setSettings(s.data as AppSetting[]);
      if (r.data) setRules(r.data as RoundingRule[]);
    };
    load();
    const ch = supabase.channel("settings-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounding_rules" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const sections = useMemo(() => {
    const known = SECTION_ORDER.filter((s) => settings.some((x) => x.section === s));
    const others = Array.from(new Set(settings.map((s) => s.section))).filter((s) => !SECTION_ORDER.includes(s));
    return [...known, ...others];
  }, [settings]);

  const updateSetting = async (id: string, raw: string) => {
    const value = raw.trim() || null;
    const { error } = await supabase.from("app_settings").update({ value }).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const updateRule = async (id: string, key: keyof RoundingRule, raw: string) => {
    let value: any;
    if (key === "description") value = raw.trim() || null;
    else if (key === "band_max") {
      const t = raw.trim();
      if (!t) value = null;
      else { const n = Number(t); if (!Number.isFinite(n)) { toast.error("Must be a number or blank"); return false; } value = n; }
    } else if (key === "band_min" || key === "round_up_to" || key === "display_order") {
      const n = Number(raw.trim());
      if (!Number.isFinite(n)) { toast.error("Must be a number"); return false; }
      value = n;
    } else value = raw.trim() || null;
    const { error } = await supabase.from("rounding_rules").update({ [key]: value }).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); return false; }
    return true;
  };

  const addRule = async () => {
    const nextOrder = (rules.reduce((m, r) => Math.max(m, r.display_order), 0)) + 1;
    const { error } = await supabase.from("rounding_rules").insert({
      band_min: 0, band_max: null, round_up_to: 1, description: "New band", display_order: nextOrder,
    });
    if (error) toast.error(`Add failed: ${error.message}`);
  };
  const deleteRule = async (id: string) => {
    const { error } = await supabase.from("rounding_rules").delete().eq("id", id);
    if (error) toast.error(`Delete failed: ${error.message}`);
  };

  return (
    <DesktopAppShell>
      <div className="min-h-dvh" style={{ backgroundColor: "hsl(var(--background))" }}>
        <header className="sticky top-0 z-20 backdrop-blur-md border-b"
          style={{ backgroundColor: "hsl(var(--background) / 0.92)", borderColor: "hsl(var(--brand-navy) / 0.12)" }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-muted/50">
              <ArrowLeft className="h-5 w-5" style={{ color: "hsl(var(--brand-navy))" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Application</div>
              <h1 className="text-[22px] leading-tight font-light tracking-tight truncate"
                style={{ color: "hsl(var(--brand-navy))", fontWeight: 300 }}>
                Settings
              </h1>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          {sections.map((section) => (
            <Section key={section} title={section}>
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                      <Th className="w-1/2">Setting</Th>
                      <Th>Value</Th>
                      <Th className="w-24">Type</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.filter((s) => s.section === section).map((s) => (
                      <tr key={s.id} className="hover:bg-muted/20" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium" style={{ color: "hsl(var(--brand-navy))" }}>
                            {s.display_label || s.key}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">{s.key}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <EditableCell value={s.value ?? ""} onSave={(v) => updateSetting(s.id, v)} />
                        </td>
                        <td className="px-3 py-2 align-top text-[11px] uppercase tracking-wider text-muted-foreground">
                          {s.value_type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ))}

          {/* Rounding Rules — inline editable table */}
          <Section
            title="Rounding Rules"
            actions={
              <button onClick={addRule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                style={{ background: "hsl(var(--brand-orange))", color: "white" }}>
                <Plus className="h-3.5 w-3.5" /> Add band
              </button>
            }
          >
            <p className="text-xs text-muted-foreground mb-2">
              All rounding is <strong>up</strong> (conservative principle). Leave Band Max blank for the unbounded top band.
            </p>
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.1)", background: "hsl(var(--brand-navy) / 0.03)" }}>
                    <Th>Order</Th>
                    <Th>Band Min</Th>
                    <Th>Band Max</Th>
                    <Th>Round Up To</Th>
                    <Th>Description</Th>
                    <Th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20" style={{ borderBottom: "1px solid hsl(var(--brand-navy) / 0.07)" }}>
                      <td className="px-3 py-2 align-top w-16">
                        <EditableCell value={String(r.display_order)} onSave={(v) => updateRule(r.id, "display_order", v)} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <EditableCell value={String(r.band_min)} onSave={(v) => updateRule(r.id, "band_min", v)} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <EditableCell value={r.band_max == null ? "" : String(r.band_max)}
                          onSave={(v) => updateRule(r.id, "band_max", v)} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <EditableCell value={String(r.round_up_to)} onSave={(v) => updateRule(r.id, "round_up_to", v)} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <EditableCell value={r.description ?? ""} onSave={(v) => updateRule(r.id, "description", v)} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <button onClick={() => deleteRule(r.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete band">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </main>
      </div>
    </DesktopAppShell>
  );
}

const Section = ({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) => (
  <section>
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[16px] tracking-tight" style={{ color: "hsl(var(--brand-navy))", fontWeight: 500 }}>{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn("text-left text-[10px] uppercase tracking-[0.18em] font-semibold px-3 py-2.5", className)}
    style={{ color: "hsl(var(--brand-navy) / 0.65)" }}>{children}</th>
);
