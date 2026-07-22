import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { getCallerProfile } from "@/app/lib/verifyCaller";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://dental-staffing-copilot.vercel.app";

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// GET — list all users (admin + manager only)
export async function GET(req: NextRequest) {
  const caller = await getCallerProfile(bearer(req));
  if (!caller || caller.role === "member") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

// POST — invite a new user  { email, full_name, role }
export async function POST(req: NextRequest) {
  const caller = await getCallerProfile(bearer(req));
  if (!caller || caller.role === "member") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { email, full_name, role } = await req.json();
  if (!email || !role) return NextResponse.json({ error: "email and role required" }, { status: 400 });
  if (!["admin", "manager", "member"].includes(role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }
  // Only admins can create admins
  if (role === "admin" && caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can create admins" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name || "", role },
    redirectTo: `${SITE_URL}/set-password`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Ensure the profile row reflects the role (trigger may default to member)
  if (data.user) {
    await supabaseAdmin.from("profiles").update({ role, full_name: full_name || "", email }).eq("id", data.user.id);
  }
  return NextResponse.json({ ok: true });
}

// PATCH — change a user's role  { userId, role }
export async function PATCH(req: NextRequest) {
  const caller = await getCallerProfile(bearer(req));
  if (!caller || caller.role === "member") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: "userId and role required" }, { status: 400 });

  // Can't change your own role (prevents self-lockout / self-promotion games)
  if (userId === caller.id) return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });

  // Fetch target
  const { data: target } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Only admins can touch admins, or promote to admin
  if ((target.role === "admin" || role === "admin") && caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage admins" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("profiles").update({ role }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a user  { userId }
export async function DELETE(req: NextRequest) {
  const caller = await getCallerProfile(bearer(req));
  if (!caller || caller.role === "member") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Can't remove yourself
  if (userId === caller.id) return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });

  const { data: target } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Only admins can remove admins
  if (target.role === "admin" && caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can remove admins" }, { status: 403 });
  }
  // Never remove the last admin
  if (target.role === "admin") {
    const { count } = await supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "Can't remove the last admin" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // profile row auto-deletes via the cascade on auth.users
  return NextResponse.json({ ok: true });
}