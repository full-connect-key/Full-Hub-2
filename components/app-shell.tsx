import { Sidebar } from "@/components/sidebar";
import { navForRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

/** Moldura comum ao Dashboard Full e ao Portal do Cliente. */
export function AppShell({
  user,
  clientSlug,
  contexto,
  children,
}: {
  user: SessionUser;
  /** Dentro do portal de uma conta, o slug monta os endereços do menu. */
  clientSlug?: string;
  /** Nome exibido no topo da sidebar quando se está num portal. */
  contexto?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={navForRole(user.role, clientSlug)}
        nome={user.nome}
        email={user.email}
        role={user.role}
        contexto={contexto}
        mostrarVoltar={Boolean(clientSlug) && user.role !== "cliente"}
      />
      <main className="flex-1 overflow-x-hidden px-8 py-8">{children}</main>
    </div>
  );
}
