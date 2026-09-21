import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { InactivityGuard } from "@/components/inactivity-guard";
import { requireUser } from "@/lib/auth/session";
import { CLIENT_HOME } from "@/lib/auth/roles";

/**
 * Portal do Cliente.
 * Sessao com encerramento automatico apos 30 minutos de inatividade.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? CLIENT_HOME;
  const user = await requireUser(pathname);

  return (
    <>
      <InactivityGuard />
      <AppShell user={user}>{children}</AppShell>
    </>
  );
}
