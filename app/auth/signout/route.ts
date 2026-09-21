import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH } from "@/lib/auth/roles";

/** Encerra a sessao. `motivo=inatividade` sinaliza o timeout do Portal. */
export async function POST(request: NextRequest) {
  const motivo = new URL(request.url).searchParams.get("motivo");

  const supabase = await createClient();
  await supabase.auth.signOut();

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = LOGIN_PATH;
  redirectTo.search = motivo === "inatividade" ? "?motivo=inatividade" : "";

  return NextResponse.redirect(redirectTo, { status: 303 });
}
