import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  LOGIN_PATH,
  TROCAR_SENHA_PATH,
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
  /** Acesso desativado pela administração. */
  ativo: boolean;
  /** Entrou com senha provisória e precisa trocar antes de usar o sistema. */
  deveTrocarSenha: boolean;
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
    .from("profiles")
    .select("nome, role, avatar_url, ativo, deve_trocar_senha")
    .eq("id", user.id)
    .maybeSingle();

  const role = isRole(profile?.role) ? profile.role : "cliente";

  // O slug considera usuário e empresa ativos: desativar qualquer um dos dois
  // já derruba o destino do portal.
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
    ativo: profile?.ativo ?? false,
    deveTrocarSenha: profile?.deve_trocar_senha ?? false,
  };
}

/** Exige sessao valida e autorizacao para a rota; redireciona se faltar. */
export async function requireUser(pathname: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }

  if (!user.ativo) redirect(`${LOGIN_PATH}?motivo=desativado`);
  if (user.deveTrocarSenha) redirect(TROCAR_SENHA_PATH);

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

export type Colaborador = {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  areaId: string | null;
  areaNome: string | null;
  role: Role;
  dataAdmissao: string | null;
  dataAniversario: string | null;
  avatarUrl: string | null;
  ativo: boolean;
};

/** Equipe interna. O RLS só devolve a lista para desenvolvedor e sócio. */
export async function listColaboradores(): Promise<Colaborador[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, nome, email, cargo, area_id, role, data_admissao, data_aniversario, avatar_url, ativo, areas_equipe(nome)",
    )
    .neq("role", "cliente")
    .order("nome");

  return (data ?? []).map((linha) => {
    const area = linha.areas_equipe as { nome: string } | { nome: string }[] | null;
    return {
      id: linha.id,
      nome: linha.nome,
      email: linha.email,
      cargo: linha.cargo,
      areaId: linha.area_id,
      areaNome: Array.isArray(area) ? (area[0]?.nome ?? null) : (area?.nome ?? null),
      role: isRole(linha.role) ? linha.role : "colaborador",
      dataAdmissao: linha.data_admissao,
      dataAniversario: linha.data_aniversario,
      avatarUrl: linha.avatar_url,
      ativo: linha.ativo,
    };
  });
}

export type AreaEquipe = { id: string; nome: string };

export async function listAreas(): Promise<AreaEquipe[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("areas_equipe")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  return data ?? [];
}

export type ClienteAdmin = ClientAccount & {
  ativo: boolean;
  logoUrl: string | null;
  criadoEm: string;
  totalUsuarios: number;
};

/** Clientes com a contagem de usuários, para a aba administrativa. */
export async function listClientesAdmin(): Promise<ClienteAdmin[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, nome_empresa, slug, ativo, logo_url, created_at, client_users(count)")
    .order("nome_empresa");

  return (data ?? []).map((linha) => {
    const contagem = linha.client_users as { count: number }[] | null;
    return {
      id: linha.id,
      nomeEmpresa: linha.nome_empresa,
      slug: linha.slug,
      ativo: linha.ativo,
      logoUrl: linha.logo_url,
      criadoEm: linha.created_at,
      totalUsuarios: contagem?.[0]?.count ?? 0,
    };
  });
}

export type UsuarioCliente = {
  id: string;
  nome: string;
  email: string;
  avatarUrl: string | null;
  ativo: boolean;
};

export async function listUsuariosDoCliente(clientId: string): Promise<UsuarioCliente[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("client_users")
    .select("profiles(id, nome, email, avatar_url, ativo)")
    .eq("client_id", clientId);

  return (data ?? [])
    .map((linha) => {
      // O join vem como objeto ou array, dependendo de como o PostgREST resolve.
      type LinhaPerfil = {
        id: string;
        nome: string;
        email: string;
        avatar_url: string | null;
        ativo: boolean;
      };
      const bruto = linha.profiles as unknown as LinhaPerfil | LinhaPerfil[] | null;
      const p = Array.isArray(bruto) ? (bruto[0] ?? null) : bruto;
      return p
        ? { id: p.id, nome: p.nome, email: p.email, avatarUrl: p.avatar_url, ativo: p.ativo }
        : null;
    })
    .filter((u): u is UsuarioCliente => u !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Cliente pelo id, para as telas administrativas. */
export async function getClienteAdmin(clientId: string): Promise<ClienteAdmin | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, nome_empresa, slug, ativo, logo_url, created_at")
    .eq("id", clientId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    nomeEmpresa: data.nome_empresa,
    slug: data.slug,
    ativo: data.ativo,
    logoUrl: data.logo_url,
    criadoEm: data.created_at,
    totalUsuarios: 0,
  };
}
