import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  CLIENT_HOME,
  INTERNAL_HOME,
  LOGIN_PATH,
  canAccessPath,
  homeForRole,
  isRole,
} from "@/lib/auth/roles";

/** Rotas acessiveis sem sessao. */
const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessao do Supabase a cada request e aplica o controle de acesso por
 * role. Este e o ponto de bloqueio real — a sidebar so esconde o que aqui ja
 * esta proibido.
 */
export async function updateSession(request: NextRequest) {
  // Expoe o pathname aos Server Components (layouts leem via headers()).
  // Recalculado a cada uso porque supabase reescreve os cookies do request.
  const requestInit = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", request.nextUrl.pathname);
    return { headers };
  };

  let supabaseResponse = NextResponse.next({ request: requestInit() });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: requestInit() });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: nao inserir logica entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;

  // Mantem os cookies renovados ao responder com redirect.
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (!user) {
    if (isPublicPath(pathname) || pathname === "/") return supabaseResponse;

    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(pathname)}`;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = isRole(profile?.role) ? profile.role : "cliente";
  const home = homeForRole(role);

  // Ja logado: a raiz e a tela de login levam direto para a home do perfil.
  if (pathname === "/" || pathname === LOGIN_PATH) {
    return redirectTo(home);
  }

  // Troca de senha continua acessivel com sessao ativa (fluxo de recuperacao).
  if (pathname.startsWith("/auth") || pathname === "/redefinir-senha") {
    return supabaseResponse;
  }

  // Area errada ou modulo sem permissao (ex.: financeiro para colaborador).
  if (
    (pathname.startsWith(INTERNAL_HOME) || pathname.startsWith(CLIENT_HOME)) &&
    !canAccessPath(role, pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = searchParams.has("next") ? "" : "?erro=sem-permissao";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  return supabaseResponse;
}
