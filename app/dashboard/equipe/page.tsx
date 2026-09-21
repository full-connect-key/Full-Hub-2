import { requireUser, listAreas, listColaboradores, listClientesAdmin } from "@/lib/auth/session";
import { EquipeTabs } from "./equipe-tabs";

export const metadata = { title: "Equipe & Skills · Full Hub" };

/**
 * Equipe & Skills — área administrativa de pessoas e contas.
 * Restrita a desenvolvedor e sócio pelo middleware, por este guard e pelo RLS.
 */
export default async function EquipePage() {
  await requireUser("/dashboard/equipe");

  const [colaboradores, clientes, areas] = await Promise.all([
    listColaboradores(),
    listClientesAdmin(),
    listAreas(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Equipe &amp; Skills</h1>
      <p className="mt-2 text-sm text-fh-muted">
        Administração dos colaboradores internos e das contas de cliente.
      </p>

      <EquipeTabs colaboradores={colaboradores} clientes={clientes} areas={areas} />
    </div>
  );
}
