import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { INTERNAL_HOME } from "@/lib/auth/roles";

/**
 * Dashboard Full — ambiente interno: colaborador, desenvolvedor e socio.
 * O middleware ja barra o acesso indevido; aqui vai a segunda checagem, feita
 * no servidor, para que nenhuma pagina renderize fora do perfil autorizado.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? INTERNAL_HOME;
  const user = await requireUser(pathname);

  return <AppShell user={user}>{children}</AppShell>;
}
