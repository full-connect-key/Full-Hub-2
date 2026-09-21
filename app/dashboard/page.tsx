import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Dashboard · Full Hub" };

export default async function DashboardHome() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Olá, {user?.nome || "equipe"}.
      </h1>
      <p className="mt-2 text-sm text-fh-muted">
        Este é o Dashboard Full. Use o menu ao lado para navegar — os módulos serão
        entregues nos próximos sprints.
      </p>
    </div>
  );
}
