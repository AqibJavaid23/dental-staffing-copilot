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

    const loadProfile = async (userId: string) => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (active) {
        setProfile(prof as Profile);
        setChecking(false);
      }
    };

    // Initial check on mount
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) {
          setProfile(null);
          setChecking(false);   // <-- always resolve, even when logged out
          router.push("/");
        }
        return;
      }
      await loadProfile(session.user.id);
    };

    check();

    // Listen for auth changes (login/logout) so components update WITHOUT a refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setChecking(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  return { profile, checking };
}

export async function signOut() {
  await supabase.auth.signOut();
}