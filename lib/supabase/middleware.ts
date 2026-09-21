import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  INTERNAL_HOME,
  LOGIN_PATH,
  PORTAL_ROOT,
  canAccessPath,
  canAdministerPortals,
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
 * role. Este e o ponto de bloqueio da navegacao — o dado em si e protegido pelo
 * RLS, que vale inclusive para chamadas feitas por fora do app.
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

  const { pathname } = request.nextUrl;

  // Mantem os cookies renovados ao responder com redirect.
  const redirectTo = (path: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (!user) {
    if (isPublicPath(pathname) || pathname === "/") return supabaseResponse;
    return redirectTo(LOGIN_PATH, `?next=${encodeURIComponent(pathname)}`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = isRole(profile?.role) ? profile.role : "cliente";

  // O slug so importa para o cliente: e o que amarra a pessoa a uma conta.
  let clientSlug: string | null = null;
  if (role === "cliente") {
    const { data } = await supabase.rpc("current_user_client_slug");
    clientSlug = typeof data === "string" ? data : null;
  }

  const home = homeForRole(role, clientSlug);

  // Ja logado: a raiz e a tela de login levam direto para a home do perfil.
  if (pathname === "/" || pathname === LOGIN_PATH) {
    return redirectTo(home);
  }

  // Troca de senha continua acessivel com sessao ativa (fluxo de recuperacao).
  if (pathname.startsWith("/auth") || pathname === "/redefinir-senha") {
    return supabaseResponse;
  }

  // A raiz do portal nao e uma tela: encaminha para o lugar certo.
  if (pathname === PORTAL_ROOT) {
    if (role === "cliente" && clientSlug) return redirectTo(`${PORTAL_ROOT}/${clientSlug}`);
    if (!canAdministerPortals(role) && role !== "cliente") return redirectTo(INTERNAL_HOME);
    return supabaseResponse;
  }

  // Area errada ou modulo sem permissao (financeiro, conta de outro cliente).
  const protegida =
    pathname === INTERNAL_HOME ||
    pathname.startsWith(`${INTERNAL_HOME}/`) ||
    pathname.startsWith(`${PORTAL_ROOT}/`);

  if (protegida && !canAccessPath(role, pathname, { clientSlug })) {
    return redirectTo(home, "?erro=sem-permissao");
  }

  return supabaseResponse;
}
