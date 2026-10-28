"use client";

import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok || !data.redirect) throw new Error(data.error ?? "Não foi possível entrar.");
      router.replace(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4.5">
      <label className="flex flex-col gap-2">
        <span className="text-[13.5px] font-medium">E-mail corporativo</span>
        <span className="flex h-11 items-center gap-2.5 rounded-lg border border-line bg-white pr-2 pl-3.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
          <Mail className="size-4 text-muted" aria-hidden />
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu.nome@nexo.com.br"
            className="h-full flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted/70"
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex justify-between text-[13.5px] font-medium">
          Senha
          <span className="text-link">Esqueci minha senha</span>
        </span>
        <span className="flex h-11 items-center gap-2.5 rounded-lg border border-line bg-white pr-2 pl-3.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
          <LockKeyhole className="size-4 text-muted" aria-hidden />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-full flex-1 bg-transparent text-[14.5px] outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="grid size-[30px] place-items-center rounded-md text-muted hover:bg-surface"
            aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>

      <label className="flex w-fit cursor-pointer items-center gap-[9px] pt-0.5 text-[13.5px] text-body">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
        <span className="grid size-[18px] place-items-center rounded-md border border-line bg-white peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-primary/20">
          {remember && <Check className="size-3 text-white" strokeWidth={3} />}
        </span>
        Manter conectado neste computador
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-[13.5px] text-danger-ink">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-2.5 flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15.5px] font-semibold text-white transition hover:bg-[#0056ad] disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
        {!loading && <ArrowRight className="size-4" />}
      </button>
      <hr className="mt-1 border-line" />
    </form>
  );
}
