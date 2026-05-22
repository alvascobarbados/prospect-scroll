import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DetailLabel {
  id: string;
  label: string;
}

let cache: DetailLabel[] | null = null;
const subs: Array<(labels: DetailLabel[]) => void> = [];
let inflight: Promise<DetailLabel[]> | null = null;

async function fetchLabels(): Promise<DetailLabel[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase
      .from("detail_labels")
      .select("id, label")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    const labels = (data ?? []) as DetailLabel[];
    cache = labels;
    subs.forEach((fn) => fn(labels));
    inflight = null;
    return labels;
  })();
  return inflight;
}

export function refreshDetailLabels() {
  cache = null;
  void fetchLabels();
}

export function useDetailLabels() {
  const [labels, setLabels] = useState<DetailLabel[]>(cache ?? []);
  useEffect(() => {
    if (!cache) void fetchLabels();
    const fn = (next: DetailLabel[]) => setLabels(next);
    subs.push(fn);
    return () => {
      const i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }, []);
  return labels;
}

/** Find or create a label by name (case-insensitive). */
export async function ensureDetailLabel(name: string): Promise<DetailLabel> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("detail_labels")
    .select("id, label")
    .ilike("label", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as DetailLabel;
  const { data, error } = await supabase
    .from("detail_labels")
    .insert({ label: trimmed, sort_order: 999 })
    .select("id, label")
    .single();
  if (error) throw new Error(error.message);
  refreshDetailLabels();
  return data as DetailLabel;
}
