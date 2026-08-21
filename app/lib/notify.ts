import { supabase } from "@/app/lib/supabase";

export async function notify(
  userId: string,
  message: string,
  link?: string,
  type?: string,
  actorName?: string
): Promise<void> {
  if (!userId) {
    console.warn("notify: no userId provided, skipping");
    return;
  }
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    message,
    link: link || null,
    type: type || null,
    actor_name: actorName || null,
  });
  if (error) {
    console.error("notify insert error:", error.message, error.details, error.hint);
  } else {
    console.log("notify: created for", userId, "-", message);
  }
}