"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import type { NavItem, Role } from "@/lib/auth/roles";

const ROLE_LABEL: Record<Role, string> = {
  cliente: "Cliente",
  colaborador: "Colaborador",
  desenvolvedor: "Desenvolvedor",
  socio: "Sócio",
};

type SidebarProps = {
  items: NavItem[];
  nome: string;
  email: string;
  role: Role;
};

export function Sidebar({ items, nome, email, role }: SidebarProps) {
  const pathname = usePathname();

  // Preserva a ordem de declaracao dos grupos em lib/auth/roles.ts.
  const grupos = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-fh-border bg-fh-surface">
      <div className="px-5 py-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {Object.entries(grupos).map(([grupo, itens]) => (
          <div key={grupo}>
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fh-muted">
              {grupo}
            </p>
            <ul className="space-y-0.5">
              {itens.map((item) => {
                const ativo =
                  pathname === item.href ||
                  (item.href !== "/painel" &&
                    item.href !== "/portal" &&
                    pathname.startsWith(`${item.href}/`));

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={ativo ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        ativo
                          ? "bg-fh-brand/10 font-medium text-fh-brand"
                          : "text-fh-text hover:bg-fh-bg"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-fh-border p-3">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-fh-muted">{email}</p>
          <p className="mt-1.5 inline-block rounded-full bg-fh-bg px-2 py-0.5 text-[11px] text-fh-muted">
            {ROLE_LABEL[role]}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-fh-muted transition hover:bg-fh-bg hover:text-fh-text"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
