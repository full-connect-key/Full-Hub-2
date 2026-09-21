import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  LOGIN_PATH,
  canAccessPath,
  homeForRole,
  isRole,
  type Role,
} from "@/lib/auth/roles";

export type SessionUser = {
  id: string;
  email: string;
  nome: string;
  role: Role;
  avatarUrl: string | null;
  /** Slug da empresa vinculada. Sempre null para os perfis internos. */
  clientSlug: string | null;
};

/**
 * Usuario autenticado + perfil vindo de public.users.
 * Retorna null quando nao ha sessao valida.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  // getUser() revalida o token no servidor Supabase — nao confiar em getSession().
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("nome, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const role = isRole(profile?.role) ? profile.role : "cliente";

  let clientSlug: string | null = null;
  if (role === "cliente") {
    const { data } = await supabase.rpc("current_user_client_slug");
    clientSlug = typeof data === "string" ? data : null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    nome: profile?.nome || user.email?.split("@")[0] || "",
    role,
    avatarUrl: profile?.avatar_url ?? null,
    clientSlug,
  };
}

/** Exige sessao valida e autorizacao para a rota; redireciona se faltar. */
export async function requireUser(pathname: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }

  if (!canAccessPath(user.role, pathname, { clientSlug: user.clientSlug })) {
    redirect(homeForRole(user.role, user.clientSlug));
  }

  return user;
}

export type ClientAccount = {
  id: string;
  nomeEmpresa: string;
  slug: string;
};

/**
 * Carrega a empresa pelo slug.
 *
 * A consulta passa pelo RLS: um cliente so recebe resposta para a propria
 * empresa, entao mexer no slug da URL nao abre a conta de ninguem.
 */
export async function getClientBySlug(slug: string): Promise<ClientAccount | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, nome_empresa, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;

  return { id: data.id, nomeEmpresa: data.nome_empresa, slug: data.slug };
}

/** Empresas visiveis para o usuario atual (equipe interna enxerga todas). */
export async function listClientAccounts(): Promise<ClientAccount[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, nome_empresa, slug")
    .order("nome_empresa");

  return (data ?? []).map((c) => ({
    id: c.id,
    nomeEmpresa: c.nome_empresa,
    slug: c.slug,
  }));
}
