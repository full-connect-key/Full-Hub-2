import { PagePlaceholder } from "@/components/page-placeholder";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Financeiro · Full Hub" };

export default async function Page() {
  // Modulo restrito: revalidado no servidor, alem do bloqueio no middleware.
  await requireUser("/dashboard/financeiro");
  return <PagePlaceholder titulo="Financeiro" descricao="Módulo financeiro da agência." />;
}
