import Link from "next/link";
import { notFound } from "next/navigation";
import { getClienteAdmin, listUsuariosDoCliente, requireUser } from "@/lib/auth/session";
import { DetalheCliente } from "./detalhe-cliente";

export const metadata = { title: "Cliente · Full Hub" };

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser("/dashboard/equipe");

  const cliente = await getClienteAdmin(id);
  if (!cliente) notFound();

  const usuarios = await listUsuariosDoCliente(id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/equipe"
        className="text-sm text-fh-muted transition hover:text-fh-text"
      >
        ← Equipe &amp; Skills
      </Link>

      <DetalheCliente cliente={cliente} usuarios={usuarios} />
    </div>
  );
}
