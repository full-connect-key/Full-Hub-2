/**
 * Fonte unica de verdade sobre perfis, rotas e menus.
 * Middleware, layouts e sidebar leem tudo daqui — mudar permissao e mudar
 * apenas este arquivo.
 */

export const ROLES = ["cliente", "colaborador", "desenvolvedor", "socio"] as const;

export type Role = (typeof ROLES)[number];

/** Perfis que acessam o Painel Interno. */
export const INTERNAL_ROLES: readonly Role[] = ["colaborador", "desenvolvedor", "socio"];

/** Timeout de inatividade da sessao de cliente: 30 minutos. */
export const CLIENT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const INTERNAL_HOME = "/painel";
export const CLIENT_HOME = "/portal";
export const LOGIN_PATH = "/login";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.includes(role);
}

/** Para onde cada perfil vai logo apos o login. */
export function homeForRole(role: Role): string {
  return role === "cliente" ? CLIENT_HOME : INTERNAL_HOME;
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
 * Menu do Painel Interno.
 *
 * - colaborador: apenas o basico (tarefas, diario, mes a mes, skills, recomendacoes)
 * - desenvolvedor: tudo, menos financeiro
 * - socio: tudo, incluindo financeiro e a aprovacao de solicitacoes de RH
 */
export const INTERNAL_NAV: readonly NavItem[] = [
  { href: "/painel", label: "Início", group: "Geral", roles: INTERNAL_ROLES },

  { href: "/painel/tarefas", label: "Tarefas", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/painel/diario", label: "Diário", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/painel/mes-a-mes", label: "Mês a Mês", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/painel/skills", label: "Skills", group: "Operação", roles: INTERNAL_ROLES },
  { href: "/painel/recomendacoes", label: "Recomendações", group: "Operação", roles: INTERNAL_ROLES },

  { href: "/painel/clientes", label: "Clientes", group: "Gestão", roles: ["desenvolvedor", "socio"] },
  { href: "/painel/equipe", label: "Equipe", group: "Gestão", roles: ["desenvolvedor", "socio"] },

  { href: "/painel/rh", label: "Minhas solicitações", group: "RH", roles: INTERNAL_ROLES },
  { href: "/painel/rh/aprovacoes", label: "Aprovações de RH", group: "RH", roles: ["socio"] },

  { href: "/painel/financeiro", label: "Financeiro", group: "Financeiro", roles: ["socio"] },
];

/** Menu do Portal do Cliente. */
export const CLIENT_NAV: readonly NavItem[] = [
  { href: "/portal", label: "Início", group: "Geral", roles: ["cliente"] },
  { href: "/portal/projetos", label: "Projetos", group: "Acompanhamento", roles: ["cliente"] },
  { href: "/portal/arquivos", label: "Arquivos", group: "Acompanhamento", roles: ["cliente"] },
  { href: "/portal/solicitacoes", label: "Solicitações", group: "Acompanhamento", roles: ["cliente"] },
];

export function navForRole(role: Role): NavItem[] {
  const nav = role === "cliente" ? CLIENT_NAV : INTERNAL_NAV;
  return nav.filter((item) => item.roles.includes(role));
}

/**
 * Autorizacao de rota. Usada pelo middleware (bloqueio real) e pelos layouts
 * (defesa em profundidade) — a sidebar apenas esconde o que isto ja bloqueia.
 */
export function canAccessPath(role: Role, pathname: string): boolean {
  const area = pathname.startsWith("/painel")
    ? "interno"
    : pathname.startsWith("/portal")
      ? "cliente"
      : null;

  if (area === null) return true;
  if (area === "cliente") return role === "cliente";
  if (role === "cliente") return false;

  // Dentro do Painel Interno: casa a rota com o item de menu mais especifico.
  const match = [...INTERNAL_NAV]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // Rota interna ainda nao mapeada no menu: liberada para os perfis internos,
  // exceto sob /painel/financeiro, que e sempre restrito a socio.
  if (!match) {
    return !pathname.startsWith("/painel/financeiro") || role === "socio";
  }

  return match.roles.includes(role);
}
