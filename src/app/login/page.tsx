import { LoginForm } from "@/components/login-form";
import { ShieldCheck, Wallet } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-7xl items-center gap-6 px-4 py-10 md:grid-cols-2 md:px-8">
      <section className="premium-panel rounded-3xl p-6 md:p-8">
        <div className="space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          Secure Access
        </p>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">Authenticate with your Stellar wallet.</h1>
        <p className="max-w-lg text-[hsl(var(--muted-foreground))]">
          Fortexa binds session identity to wallet context. No server-side private-key custody. Signed transaction flow remains wallet-native.
        </p>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4 text-sm text-[hsl(var(--muted-foreground))]">
          <p className="mb-2 inline-flex items-center gap-2 text-cyan-200"><Wallet className="h-4 w-4" /> Wallet-bound trust model</p>
          <p>Operators can evaluate and execute flows; viewers remain read-only on sensitive controls.</p>
        </div>
        <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Fortexa never performs server-side signing. Transaction authorization remains in your wallet boundary.
        </div>
        </div>
      </section>
      <section>
        <LoginForm />
      </section>
    </main>
  );
}
