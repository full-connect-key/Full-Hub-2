import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Client Supabase para Server Components, Route Handlers e Server Actions. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Chamado a partir de um Server Component: o refresh de sessao ja e
            // feito pelo middleware, entao aqui e seguro ignorar.
          }
        },
      },
    },
  );
}
