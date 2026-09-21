import { PagePlaceholder } from "@/components/page-placeholder";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Aprovações de RH · Full Hub" };

export default async function Page() {
  // Modulo restrito: revalidado no servidor, alem do bloqueio no middleware.
  await requireUser("/painel/rh/aprovacoes");
  return <PagePlaceholder titulo="Aprovações de RH" descricao="Solicitações de férias e ausências aguardando aprovação." />;
}
