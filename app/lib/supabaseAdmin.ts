import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY client using the service_role key.
// Never import this into a client component / page.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});