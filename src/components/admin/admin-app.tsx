"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Panel } from "@/components/admin/panel";
import { createLocalRepo, createSupabaseRepo, getSupabase, type AdminRepo } from "@/lib/admin-repo";
import { supabaseConfig } from "@/lib/catalog";
import type { Role } from "@/types/product";

/* ---------- Acesso ---------- */

type Access =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "recovery" }
  | { state: "forbidden"; email: string }
  | { state: "ready"; repo: AdminRepo; email: string | null }
  | { state: "error"; detail: string };

export function AdminApp() {
  const [access, setAccess] = useState<Access>({ state: "loading" });

  useEffect(() => {
    if (!supabaseConfig) {
      // Sem Supabase: modo demonstração, dados guardados só neste navegador.
      const timer = setTimeout(() => setAccess({ state: "ready", repo: createLocalRepo(), email: null }), 0);
      return () => clearTimeout(timer);
    }
    let cancelled = false;
    let unsubscribe = () => {};
    getSupabase().then(client => {
      const resolve = async (user: { id: string; email?: string } | undefined) => {
        if (cancelled) return;
        if (!user) { setAccess({ state: "signed-out" }); return; }
        // Quem foi convidado entra na equipe no primeiro acesso com o e-mail confirmado.
        await client.rpc("claim_invite");
        const { data, error } = await client.rpc("my_role");
        if (cancelled) return;
        const email = user.email ?? "";
        if (error) setAccess({ state: "error", detail: "O banco de dados não está preparado ou está desatualizado. Execute supabase/schema.sql no projeto Supabase." });
        else if (data === "admin" || data === "estoque") setAccess({ state: "ready", repo: createSupabaseRepo(client, { id: user.id, role: data as Role }), email });
        else setAccess({ state: "forbidden", email });
      };
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // Renovação de token não muda quem está logado; evita recarregar o painel à toa.
        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
        if (event === "PASSWORD_RECOVERY") { setAccess({ state: "recovery" }); return; }
        setTimeout(() => void resolve(session?.user), 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { if (!cancelled) setAccess({ state: "error", detail: "Não foi possível conectar ao Supabase. Confira as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY." }); });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const signOut = useCallback(() => { void getSupabase().then(client => client.auth.signOut()); }, []);

  if (access.state === "ready") return <Panel repo={access.repo} email={access.email} onSignOut={signOut} />;
  return <main className="adm-gate">
    <img src="/images/brand/logo.webp" width="168" height="56" alt="Polpas Becal" />
    {access.state === "loading" && <p role="status">Abrindo o painel…</p>}
    {access.state === "signed-out" && <SignIn />}
    {access.state === "recovery" && <NewPassword onDone={() => window.location.replace("/admin/")} />}
    {access.state === "forbidden" && <div className="adm-gate-card">
      <h1>Conta sem acesso</h1>
      <p>A conta <strong>{access.email}</strong> existe, mas ainda não faz parte da equipe. Se você acabou de se cadastrar, confirme o e-mail pelo link que enviamos e entre de novo. Caso contrário, peça um convite a um administrador.</p>
      <button className="adm-btn" onClick={signOut}>Entrar com outra conta</button>
    </div>}
    {access.state === "error" && <div className="adm-gate-card"><h1>Painel indisponível</h1><p role="alert">{access.detail}</p></div>}
    <Link href="/" className="adm-gate-back">Voltar para a loja</Link>
  </main>;
}

type Mode = "signin" | "signup" | "forgot";
const modes: Record<Mode, { title: string; intro: string; action: string; busy: string }> = {
  signin: { title: "Painel de estoque", intro: "Entre com a sua conta da equipe.", action: "Entrar", busy: "Entrando…" },
  signup: { title: "Criar conta", intro: "Use o e-mail que recebeu o convite de um administrador e escolha a sua senha.", action: "Criar conta", busy: "Criando…" },
  forgot: { title: "Recuperar senha", intro: "Enviaremos um link para você definir uma nova senha.", action: "Enviar link", busy: "Enviando…" },
};

function SignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (next: Mode) => { setMode(next); setFailure(""); setSent(""); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password") ?? "");
    if (mode === "signup" && password.length < 8) { setFailure("Use uma senha com ao menos 8 caracteres."); return; }
    setBusy(true); setFailure(""); setSent("");
    try {
      const client = await getSupabase();
      const redirect = `${window.location.origin}/admin/`;
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) setFailure(/confirm/i.test(error.message) ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : error.status === 400 ? "E-mail ou senha incorretos." : "Não foi possível entrar. Tente novamente em instantes.");
        else return; // A troca de sessão abre o painel.
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) setFailure(/registered|exists/i.test(error.message) ? "Já existe uma conta com esse e-mail. Use Entrar ou Esqueci a senha." : "Não foi possível criar a conta. Confira o e-mail e tente de novo.");
        else if (data.session) return;
        else setSent("Conta criada. Abra o link de confirmação que enviamos para o seu e-mail e depois volte aqui para entrar.");
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) setFailure("Não foi possível enviar o link. Tente novamente em instantes.");
        else setSent("Se houver uma conta com esse e-mail, o link chega em alguns minutos.");
      }
    } catch { setFailure("Não foi possível conectar. Verifique sua internet."); }
    setBusy(false);
  }

  const copy = modes[mode];
  return <form className="adm-gate-card" onSubmit={submit}>
    <h1>{copy.title}</h1>
    <p>{copy.intro}</p>
    <div className="adm-field"><label htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" autoComplete="username" required /></div>
    {mode !== "forgot" && <div className="adm-field">
      <label htmlFor="login-password">Senha {mode === "signup" && <small>mínimo de 8 caracteres</small>}</label>
      <input id="login-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required />
    </div>}
    {failure && <p role="alert" className="adm-error">{failure}</p>}
    {sent && <p role="status" className="adm-success">{sent}</p>}
    <button className="adm-btn adm-btn-primary" type="submit" disabled={busy}>{busy ? copy.busy : copy.action}</button>
    <div className="adm-gate-links">
      {mode !== "signin" && <button type="button" className="adm-link" onClick={() => change("signin")}>Já tenho conta</button>}
      {mode !== "signup" && <button type="button" className="adm-link" onClick={() => change("signup")}>Recebi um convite</button>}
      {mode !== "forgot" && <button type="button" className="adm-link" onClick={() => change("forgot")}>Esqueci a senha</button>}
    </div>
  </form>;
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    if (password.length < 8) { setFailure("Use uma senha com ao menos 8 caracteres."); return; }
    setBusy(true); setFailure("");
    try {
      const { error } = await (await getSupabase()).auth.updateUser({ password });
      if (error) { setFailure("Não foi possível salvar a nova senha. Peça um novo link e tente de novo."); setBusy(false); }
      else onDone();
    } catch { setFailure("Não foi possível conectar. Verifique sua internet."); setBusy(false); }
  }
  return <form className="adm-gate-card" onSubmit={submit}>
    <h1>Nova senha</h1>
    <p>Escolha a senha que você vai usar a partir de agora.</p>
    <div className="adm-field"><label htmlFor="new-password">Nova senha <small>mínimo de 8 caracteres</small></label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
    {failure && <p role="alert" className="adm-error">{failure}</p>}
    <button className="adm-btn adm-btn-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar e entrar"}</button>
  </form>;
}
