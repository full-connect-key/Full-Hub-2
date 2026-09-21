import Link from "next/link";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Recuperar senha · Full Hub" };

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="rounded-2xl border border-fh-border bg-fh-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Recuperar senha</h1>
          <p className="mt-1.5 mb-5 text-sm text-fh-muted">
            Informe seu e-mail e enviaremos um link para você criar uma nova senha.
          </p>
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-fh-brand underline underline-offset-2">
            Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}
