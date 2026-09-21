import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InactivityGuard } from "@/components/inactivity-guard";
import { ViewingAsBanner } from "@/components/viewing-as-banner";
import { getClientBySlug, requireUser } from "@/lib/auth/session";
import { PORTAL_ROOT, canAdministerPortals, homeForRole } from "@/lib/auth/roles";

/**
 * Portal de uma empresa cliente: /portal/<slug>
 *
 * - cliente: entra apenas na propria conta
 * - desenvolvedor e socio: entram em qualquer conta, como eles mesmos
 * - colaborador: nao entra
 */
export default async function PortalClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`${PORTAL_ROOT}/${slug}`);

  // Segunda barreira, no servidor: o RLS so devolve a empresa para quem pode
  // ve-la, entao trocar o slug na URL nao abre a conta de outro cliente.
  const empresa = await getClientBySlug(slug);
  if (!empresa) {
    if (user.role === "cliente") redirect(homeForRole(user.role, user.clientSlug));
    notFound();
  }

  const visitandoComoEquipe = canAdministerPortals(user.role);

  return (
    <>
      {/* O encerramento por inatividade vale para a sessao de cliente. */}
      {user.role === "cliente" && <InactivityGuard />}

      <AppShell user={user} clientSlug={slug} contexto={empresa.nomeEmpresa}>
        {visitandoComoEquipe && (
          <ViewingAsBanner nomeEmpresa={empresa.nomeEmpresa} nomeUsuario={user.nome} />
        )}
        {children}
      </AppShell>
    </>
  );
}
