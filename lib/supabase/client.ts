"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase para componentes que rodam no browser. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
