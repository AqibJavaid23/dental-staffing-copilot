"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
};

export function useAuth() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) router.push("/");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (active) {
        setProfile(prof as Profile);
        setChecking(false);
      }
    };

    check();
    return () => { active = false; };
  }, [router]);

  return { profile, checking };
}

export async function signOut() {
  await supabase.auth.signOut();
}