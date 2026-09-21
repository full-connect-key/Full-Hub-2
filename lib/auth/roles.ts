/**
 * Fonte unica de verdade sobre perfis, rotas e menus.
 * Middleware, layouts e sidebar leem tudo daqui — mudar permissao e mudar
 * apenas este arquivo.
 */

export const ROLES = ["cliente", "colaborador", "desenvolvedor", "socio"] as const;

export type Role = (typeof ROLES)[number];

/** Perfis que acessam o Dashboard Full (ambiente interno). */
export const INTERNAL_ROLES: readonly Role[] = ["colaborador", "desenvolvedor", "socio"];

/**
 * Perfis internos que podem abrir o Portal de qualquer cliente, de forma
 * administrativa e mantendo a propria identidade.
 */
export const PORTAL_ADMIN_ROLES: readonly Role[] = ["desenvolvedor", "socio"];

/** Timeout de inatividade da sessao de cliente: 30 minutos. */
export const CLIENT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const INTERNAL_HOME = "/dashboard";
export const PORTAL_ROOT = "/portal";
export const LOGIN_PATH = "/login";

/** Escolha feita na tela de login. Define a entrada, nunca a permissao. */
export const AUDIENCES = ["colaborador", "cliente"] as const;
export type Audience = (typeof AUDIENCES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.includes(role);
}

export function canAdministerPortals(role: Role): boolean {
  return PORTAL_ADMIN_ROLES.includes(role);
}

/**
 * Para onde cada perfil vai depois do login.
 * O cliente cai direto no endereco da propria empresa; sem vinculo, cai na
 * tela que explica o que falta.
 */
export function homeForRole(role: Role, clientSlug?: string | null): string {
  if (role !== "cliente") return INTERNAL_HOME;
  return clientSlug ? `${PORTAL_ROOT}/${clientSlug}` : PORTAL_ROOT;
}

/** Extrai o slug de /portal/<slug>/... */
export function clientSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/portal\/([^/]+)/);
  return match ? match[1] : null;
}

export type NavItem = {
  href: string;
  label: string;
  /** Perfis que enxergam (e podem abrir) este item. */
  roles: readonly Role[];
  /** Agrupador exibido na sidebar. */
  group: string;
};

/**
 * Menu do Dashboard Full.
 *
 * - colaborador: apenas o basico (tarefas, diario, mes a mes, skills, recomendacoes)
 * - desenvolvedor: tudo, menos financeiro
 * - socio: tudo, incluindo financeiro e a aprovacao de solicitacoes de RH
 */
export const INTERNAL_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Início", group: "Geral", roles: INTERNAL_ROLES },

  { href: "/dashboard/tarefas", label: "Tarefas", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/dashboard/diario", label: "Diário", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/dashboard/mes-a-mes", label: "Mês a Mês", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/dashboard/skills", label: "Skills", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/dashboard/recomendacoes", label: "Recomendações", group: "Operação", roles: INTERNAL_ROLES },

  { href: "/dashboard/clientes", label: "Clientes", group: "Gestão", roles: ["desenvolvedor", "socio"] },
  { href: "/dashboard/equipe", label: "Equipe", group: "Gestão", roles: ["desenvolvedor", "socio"] },

  { href: "/dashboard/rh", label: "Minhas solicitações", group: "RH", roles: INTERNAL_ROLES },
  { href: "/dashboard/rh/aprovacoes", label: "Aprovações de RH", group: "RH", roles: ["socio"] },

  { href: "/dashboard/financeiro", label: "Financeiro", group: "Financeiro", roles: ["socio"] },
];

/** Menu do Portal do Cliente. Os href sao relativos ao slug da empresa. */
export const CLIENT_NAV: readonly { path: string; label: string; group: string }[] = [
  { path: "", label: "Início", group: "Geral" },
  { path: "/projetos", label: "Projetos", group: "Acompanhamento" },
  { path: "/arquivos", label: "Arquivos", group: "Acompanhamento" },
  { path: "/solicitacoes", label: "Solicitações", group: "Acompanhamento" },
];

/**
 * Menu ja filtrado. No Portal, precisa do slug para montar os enderecos —
 * a mesma lista serve ao cliente e ao interno que esta visitando a conta.
 */
export function navForRole(role: Role, clientSlug?: string | null): NavItem[] {
  if (clientSlug) {
    return CLIENT_NAV.map((item) => ({
      href: `${PORTAL_ROOT}/${clientSlug}${item.path}`,
      label: item.label,
      group: item.group,
      roles: ROLES,
    }));
  }

  if (role === "cliente") return [];

  return INTERNAL_NAV.filter((item) => item.roles.includes(role));
}

export type AccessContext = {
  /** Slug da empresa a qual o usuario cliente esta vinculado. */
  clientSlug?: string | null;
};

/**
 * Autorizacao de rota. Usada pelo middleware (bloqueio real) e pelos layouts
 * (defesa em profundidade). A sidebar apenas esconde o que isto ja bloqueia.
 *
 * Vale lembrar: isto protege a navegacao. Quem protege os dados e o RLS —
 * inclusive contra chamadas feitas por fora do app.
 */
export function canAccessPath(
  role: Role,
  pathname: string,
  ctx: AccessContext = {},
): boolean {
  // ---- Portal do Cliente ----------------------------------------------------
  if (pathname === PORTAL_ROOT || pathname.startsWith(`${PORTAL_ROOT}/`)) {
    const slug = clientSlugFromPath(pathname);

    // A raiz do portal so redireciona: cliente para a propria conta, interno
    // para a lista de contas.
    if (!slug) return role === "cliente" || canAdministerPortals(role);

    // Desenvolvedor e socio entram em qualquer conta, como eles mesmos.
    if (canAdministerPortals(role)) return true;

    // Cliente entra apenas na propria conta.
    if (role === "cliente") return Boolean(ctx.clientSlug) && slug === ctx.clientSlug;

    // Colaborador nao administra contas de cliente.
    return false;
  }

  // ---- Dashboard Full -------------------------------------------------------
  if (pathname === INTERNAL_HOME || pathname.startsWith(`${INTERNAL_HOME}/`)) {
    if (role === "cliente") return false;

    const match = [...INTERNAL_NAV]
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];

    // Rota interna ainda nao mapeada no menu: liberada para os perfis internos,
    // exceto sob /dashboard/financeiro, que e sempre restrito a socio.
    if (!match) {
      return !pathname.startsWith("/dashboard/financeiro") || role === "socio";
    }

    return match.roles.includes(role);
  }

  return true;
}
