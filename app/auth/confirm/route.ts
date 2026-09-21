import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH } from "@/lib/auth/roles";

/**
 * Consome o link enviado por e-mail (recuperacao de senha, convite, confirmacao)
 * e abre a sessao antes de mandar o usuario para `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      // `next` vem da URL: aceitar apenas caminho interno, nunca host externo.
      redirectTo.pathname = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = LOGIN_PATH;
  redirectTo.search = "?erro=link-invalido";
  return NextResponse.redirect(redirectTo);
}
