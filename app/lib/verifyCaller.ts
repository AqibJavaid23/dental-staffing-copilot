import { supabaseAdmin } from "./supabaseAdmin";

// Given the caller's access token, return their profile (with role), or null.
export async function getCallerProfile(token: string | null) {
  if (!token) return null;
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userData.user.id)
    .single();
  return profile as { id: string; email: string; full_name: string | null; role: "admin" | "manager" | "member" } | null;
}