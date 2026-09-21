import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/lib/auth/session";
import { LOGIN_PATH, homeForRole } from "@/lib/auth/roles";
import { TrocarSenhaForm } from "./trocar-senha-form";

export const metadata = { title: "Criar nova senha · Full Hub" };

/**
 * Troca obrigatória de senha.
 *
 * Quem entrou com senha provisória para aqui: o middleware manda toda rota
 * protegida para cá enquanto deve_trocar_senha continuar verdadeiro.
 */
export default async function TrocarSenhaPage() {
  const user = await getSessionUser();

  if (!user) redirect(LOGIN_PATH);
  if (!user.ativo) redirect(`${LOGIN_PATH}?motivo=desativado`);
  if (!user.deveTrocarSenha) redirect(homeForRole(user.role, user.clientSlug));

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="rounded-2xl border border-fh-border bg-fh-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Crie sua senha</h1>
          <p className="mt-1.5 mb-5 text-sm text-fh-muted">
            Você entrou com uma senha provisória. Defina uma senha própria para continuar.
          </p>
          <TrocarSenhaForm />
        </div>

        <p className="mt-6 text-center text-xs text-fh-muted">Entrou como {user.email}</p>
      </div>
    </main>
  );
}
