import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Full Hub" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; motivo?: string }>;
}) {
  const { next, motivo } = await searchParams;

  const avisos: Record<string, string> = {
    inatividade: "Sua sessão foi encerrada por inatividade. Entre novamente para continuar.",
    desativado: "Seu acesso está desativado. Fale com a equipe da Full Connect Key.",
  };
  const aviso = motivo ? avisos[motivo] : undefined;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        {aviso && (
          <p className="mb-5 rounded-lg border border-fh-border bg-fh-surface px-4 py-3 text-sm text-fh-muted">
            {aviso}
          </p>
        )}

        <div className="rounded-2xl border border-fh-border bg-fh-surface p-6 shadow-sm">
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-fh-muted">
          Precisa de acesso?{" "}
          <Link href="/esqueci-senha" className="underline underline-offset-2">
            Fale com o administrador
          </Link>
        </p>
      </div>
    </main>
  );
}
