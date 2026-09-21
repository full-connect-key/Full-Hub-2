import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH, canAccessPath, homeForRole, isRole, type Role } from "@/lib/auth/roles";

export type SessionUser = {
  id: string;
  email: string;
  nome: string;
  role: Role;
  avatarUrl: string | null;
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

  return {
    id: user.id,
    email: user.email ?? "",
    nome: profile?.nome || user.email?.split("@")[0] || "",
    role,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

/** Exige sessao valida e autorizacao para a rota; redireciona se faltar. */
export async function requireUser(pathname: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }

  if (!canAccessPath(user.role, pathname)) {
    redirect(homeForRole(user.role));
  }

  return user;
}
