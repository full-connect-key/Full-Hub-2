import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Portal do Cliente · Full Hub" };

export default async function PortalHome() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Olá, {user?.nome || "bem-vindo"}.
      </h1>
      <p className="mt-2 text-sm text-fh-muted">
        Este é o seu portal na agência. Em breve você acompanhará projetos, arquivos e
        solicitações por aqui.
      </p>
    </div>
  );
}
