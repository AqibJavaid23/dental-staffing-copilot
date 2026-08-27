"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SmsCampaignPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/prospecting/sequences");
  }, [router]);
  return null;
}