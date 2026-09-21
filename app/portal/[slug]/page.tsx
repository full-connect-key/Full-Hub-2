import { getClientBySlug, getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Portal do Cliente · Full Hub" };

export default async function PortalHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [user, empresa] = await Promise.all([getSessionUser(), getClientBySlug(slug)]);

  const saudacao =
    user?.role === "cliente"
      ? `Olá, ${user.nome || "bem-vindo"}.`
      : `Portal de ${empresa?.nomeEmpresa ?? ""}`;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{saudacao}</h1>
      <p className="mt-2 text-sm text-fh-muted">
        {user?.role === "cliente"
          ? "Este é o seu portal na agência. Em breve você acompanhará projetos, arquivos e solicitações por aqui."
          : "Os módulos desta conta serão construídos nos próximos sprints."}
      </p>
    </div>
  );
}
