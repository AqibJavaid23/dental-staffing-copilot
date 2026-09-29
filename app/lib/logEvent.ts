import { supabase } from "@/app/lib/supabase";

/**
 * Append a row to the append-only activity_events stream.
 * Single choke point for work events — call from every create / assign / status change.
 * Insert only; never update or delete activity_events rows.
 */
export async function logEvent(opts: {
  verb: string;
  entityType: string;
  entityId: string;
  orgId?: string | null;
  actorId?: string | null;
  actorType?: "user" | "system" | "agent";
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const { verb, entityType, entityId, orgId = null, actorId = null, actorType = "user", metadata = null } = opts;
  const { error } = await supabase.from("activity_events").insert({
    verb, entity_type: entityType, entity_id: entityId, org_id: orgId, actor_id: actorId, actor_type: actorType, metadata,
  });
  if (error) console.error("logEvent failed:", error.message, { verb, entityId });
}