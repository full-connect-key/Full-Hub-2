import { Sidebar } from "@/components/sidebar";
import { navForRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

/** Moldura comum ao Painel Interno e ao Portal do Cliente. */
export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={navForRole(user.role)}
        nome={user.nome}
        email={user.email}
        role={user.role}
      />
      <main className="flex-1 overflow-x-hidden px-8 py-8">{children}</main>
    </div>
  );
}
