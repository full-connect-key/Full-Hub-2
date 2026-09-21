import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  INTERNAL_HOME,
  PORTAL_ROOT,
  canAdministerPortals,
  homeForRole,
} from "@/lib/auth/roles";
import { getSessionUser, listClientAccounts } from "@/lib/auth/session";

export const metadata = { title: "Contas de cliente · Full Hub" };

/**
 * A raiz do portal nao e uma tela de conteudo:
 * - cliente cai aqui apenas quando ainda nao tem empresa vinculada;
 * - desenvolvedor e socio veem a lista de contas para escolher qual abrir.
 */
export default async function PortalRoot() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.role === "cliente") {
    if (user.clientSlug) redirect(`${PORTAL_ROOT}/${user.clientSlug}`);

    return (
      <main className="grid min-h-dvh place-items-center px-4 py-12">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">Acesso ainda não liberado</h1>
          <p className="mt-2 text-sm text-fh-muted">
            Sua conta ainda não está vinculada a nenhuma empresa. Fale com a equipe da Full
            Connect Key para concluir a liberação.
          </p>
          <form action="/auth/signout" method="post" className="mt-6">
            <button
              type="submit"
              className="rounded-lg border border-fh-border px-4 py-2 text-sm text-fh-muted transition hover:text-fh-text"
            >
              Sair
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!canAdministerPortals(user.role)) redirect(INTERNAL_HOME);

  const contas = await listClientAccounts();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Contas de cliente</h1>
        <p className="mt-2 text-sm text-fh-muted">
          Abra o portal de uma conta para acompanhar o que o cliente enxerga. Você entra como
          você mesmo, não como o cliente.
        </p>

        {contas.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-fh-border bg-fh-surface px-6 py-16 text-center">
            <p className="text-sm text-fh-muted">Nenhuma empresa cadastrada ainda.</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {contas.map((conta) => (
              <li key={conta.id}>
                <Link
                  href={`${PORTAL_ROOT}/${conta.slug}`}
                  className="block rounded-xl border border-fh-border bg-fh-surface px-4 py-3.5 transition hover:border-fh-brand hover:bg-fh-brand/5"
                >
                  <span className="block text-sm font-medium">{conta.nomeEmpresa}</span>
                  <span className="mt-0.5 block font-mono text-xs text-fh-muted">
                    /portal/{conta.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
