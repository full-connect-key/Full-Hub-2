import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Nova senha · Full Hub" };

export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="rounded-2xl border border-fh-border bg-fh-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Criar nova senha</h1>
          <p className="mt-1.5 mb-5 text-sm text-fh-muted">
            Escolha uma senha com pelo menos 8 caracteres.
          </p>
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
