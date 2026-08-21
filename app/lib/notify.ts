import { supabase } from "@/app/lib/supabase";

/**
 * Create an in-app notification for a user.
 * @param userId   who receives it
 * @param message  human-readable text
 * @param link     where clicking takes them (optional)
 * @param type     category tag (optional)
 * @param actorName who triggered it (optional)
 */
export async function notify(
  userId: string,
  message: string,
  link?: string,
  type?: string,
  actorName?: string
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      message,
      link: link || null,
      type: type || null,
      actor_name: actorName || null,
    });
  } catch (e) {
    // Notifications are non-critical — never break the main action if this fails
    console.error("notify failed:", e);
  }
}