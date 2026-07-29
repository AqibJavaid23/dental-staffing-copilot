import { supabase } from "./supabase";

export type NewRow = { license_number: string; row_data: Record<string, string> };

export type SaveResult =
  | { status: "created"; pipelineId: string }
  | { status: "merged"; pipelineId: string; added: number; skipped: number }
  | { status: "name_exists"; existingId: string };

// Check if the current user already has a pipeline with this name
export async function findMyPipelineByName(ownerId: string, name: string): Promise<string | null> {
  const { data } = await supabase
    .from("pipelines")
    .select("id")
    .eq("owner_id", ownerId)
    .ilike("name", name.trim())
    .maybeSingle();
  return data?.id || null;
}

// Create a brand-new pipeline with rows
export async function createPipeline(
  ownerId: string,
  name: string,
  sourceTab: string,
  rows: NewRow[]
): Promise<SaveResult> {
  const { data: pipeline, error: pErr } = await supabase
    .from("pipelines")
    .insert({ name: name.trim(), source_tab: sourceTab, project: "DSCP", owner_id: ownerId })
    .select()
    .single();
  if (pErr) throw pErr;

  const toInsert = rows.map((r) => ({ pipeline_id: pipeline.id, license_number: r.license_number, row_data: r.row_data }));
  const { error: rErr } = await supabase.from("pipeline_rows").insert(toInsert);
  if (rErr) throw rErr;

  return { status: "created", pipelineId: pipeline.id };
}

// Merge rows into an existing pipeline, skipping license numbers already present
export async function mergeIntoPipeline(pipelineId: string, rows: NewRow[]): Promise<SaveResult> {
  // Get license numbers already in the pipeline
  const { data: existing } = await supabase
    .from("pipeline_rows")
    .select("license_number")
    .eq("pipeline_id", pipelineId);
  const existingKeys = new Set((existing ?? []).map((r) => (r.license_number || "").trim()));

  const fresh = rows.filter((r) => !existingKeys.has((r.license_number || "").trim()));
  const skipped = rows.length - fresh.length;

  if (fresh.length > 0) {
    const toInsert = fresh.map((r) => ({ pipeline_id: pipelineId, license_number: r.license_number, row_data: r.row_data }));
    const { error } = await supabase.from("pipeline_rows").insert(toInsert);
    if (error) throw error;
  }

  return { status: "merged", pipelineId, added: fresh.length, skipped };
}