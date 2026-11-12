"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Modal } from "@/components/admin/dialogs";
import { inviteSchema, type AdminRepo } from "@/lib/admin-repo";
import type { Role, Team, TeamMember } from "@/types/product";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const roles: Record<Role, { label: string; detail: string }> = {
  estoque: { label: "Estoque", detail: "Consulta o painel e lança entradas, saídas e vendas." },
  admin: { label: "Administrador", detail: "Tudo do Estoque, mais produtos, preços e equipe." },
};

export function TeamView({ repo, onNotice }: { repo: AdminRepo; onNotice: (text: string) => void }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [failure, setFailure] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const local = repo.mode === "local";

  const reload = useCallback(async () => {
    try { setTeam(await repo.team()); setFailure(""); }
    catch (error) { setFailure(message(error)); }
  }, [repo]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer); }, [reload]);

  const run = async (action: () => Promise<void>, text: string) => {
    try { await action(); onNotice(text); await reload(); }
    catch (error) { setFailure(message(error)); }
  };

  return <section className="adm-team" aria-label="Equipe">
    <div className="adm-tools">
      <p className="adm-hint">Cada pessoa entra com a própria conta. Você convida pelo e-mail; ela escolhe a senha em <strong>/admin/</strong>, na opção “Recebi um convite”.</p>
      <button className="adm-btn adm-btn-primary adm-export" onClick={() => setInviting(true)}><UserPlus size={16} /> Convidar pessoa</button>
    </div>
    {local && <p className="adm-banner">No modo demonstração os convites são apenas simulados: nenhum e-mail é enviado e nenhuma conta é criada.</p>}
    {failure && <p className="adm-banner adm-banner-error" role="alert">{failure}</p>}

    {!team ? <p className="adm-empty" role="status">Carregando equipe…</p> : <>
      <ul className="adm-list">
        <li className="adm-member adm-row-head" aria-hidden="true"><span>Pessoa</span><span>Função</span><span /></li>
        {team.members.map(member => <li key={member.id} className="adm-member">
          <div><strong>{member.name || member.email}{member.self && <em>você</em>}</strong><span>{member.email}</span></div>
          {member.self || local
            ? <span className="adm-role">{roles[member.role].label}</span>
            : <select aria-label={`Função de ${member.name || member.email}`} value={member.role} onChange={event => void run(() => repo.setRole(member.id, event.target.value as Role), "Função atualizada.")}>
                {(Object.keys(roles) as Role[]).map(role => <option key={role} value={role}>{roles[role].label}</option>)}
              </select>}
          {member.self || local ? <span /> : <button className="adm-icon adm-icon-danger" onClick={() => setRemoving(member)} aria-label={`Remover ${member.name || member.email} da equipe`} title="Remover da equipe"><Trash2 size={16} /></button>}
        </li>)}
      </ul>

      <h2 className="adm-subtitle">Convites pendentes</h2>
      {team.invites.length ? <ul className="adm-list">
        {team.invites.map(invite => <li key={invite.email} className="adm-member">
          <div><strong>{invite.name}</strong><span>{invite.email}</span></div>
          <span className="adm-role">{roles[invite.role].label}</span>
          <button className="adm-btn adm-btn-quiet" onClick={() => void run(() => repo.revokeInvite(invite.email), "Convite cancelado.")}>Cancelar convite</button>
        </li>)}
      </ul> : <p className="adm-quiet">Nenhum convite aguardando. Quem aceita o convite passa para a lista acima.</p>}
    </>}

    {inviting && <InviteDialog repo={repo} taken={team?.members.map(m => m.email) ?? []} onClose={() => setInviting(false)} onSaved={name => { setInviting(false); onNotice(`Convite criado para ${name}.`); void reload(); }} />}
    {removing && <Modal title={`Remover ${removing.name || removing.email}?`} onClose={() => setRemoving(null)}>
      <div className="adm-form-body"><p>A pessoa perde o acesso ao painel imediatamente. As movimentações que ela registrou continuam no histórico. Para devolver o acesso, envie um novo convite.</p></div>
      <footer className="adm-modal-foot">
        <button type="button" className="adm-btn adm-btn-quiet" onClick={() => setRemoving(null)}>Cancelar</button>
        <button type="button" className="adm-btn adm-btn-danger" onClick={() => { const member = removing; setRemoving(null); void run(() => repo.removeMember(member.id), "Acesso removido."); }}>Remover acesso</button>
      </footer>
    </Modal>}
  </section>;
}

function InviteDialog({ repo, taken, onClose, onSaved }: { repo: AdminRepo; taken: string[]; onClose: () => void; onSaved: (name: string) => void }) {
  const [role, setRole] = useState<Role>("estoque");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = inviteSchema.safeParse({ name: String(form.get("name")), email: String(form.get("email")), role });
    if (!checked.success) {
      const next: Record<string, string> = {};
      for (const issue of checked.error.issues) next[String(issue.path[0])] ||= issue.message;
      setErrors(next);
      return;
    }
    if (taken.includes(checked.data.email)) { setErrors({ email: "Essa pessoa já faz parte da equipe." }); return; }
    setErrors({}); setFailure(""); setBusy(true);
    try { await repo.invite(checked.data); onSaved(checked.data.name); }
    catch (error) { setFailure(message(error)); setBusy(false); }
  }

  return <Modal title="Convidar pessoa" onClose={onClose} busy={busy}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body">
        <div className="adm-fields">
          <div className="adm-field span-2">
            <label htmlFor="inv-name">Nome</label>
            <input id="inv-name" name="name" maxLength={60} autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "inv-name-error" : undefined} />
            {errors.name && <span id="inv-name-error" className="adm-error">{errors.name}</span>}
          </div>
          <div className="adm-field span-2">
            <label htmlFor="inv-email">E-mail <small>o mesmo que a pessoa vai usar para criar a conta</small></label>
            <input id="inv-email" name="email" type="email" maxLength={120} autoComplete="off" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "inv-email-error" : undefined} />
            {errors.email && <span id="inv-email-error" className="adm-error">{errors.email}</span>}
          </div>
          <fieldset className="adm-field span-2 adm-roles">
            <legend>Função</legend>
            {(Object.keys(roles) as Role[]).map(key => <label key={key}>
              <input type="radio" name="inv-role" checked={role === key} onChange={() => setRole(key)} />
              <strong>{roles[key].label}</strong><small>{roles[key].detail}</small>
            </label>)}
          </fieldset>
        </div>
        <p className="adm-hint">O painel não envia e-mail. Avise a pessoa para abrir <strong>/admin/</strong>, escolher “Recebi um convite” e cadastrar a senha dela com este e-mail.</p>
      </div>
      <footer className="adm-modal-foot">
        {failure && <p role="alert" className="adm-error">{failure}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? "Convidando…" : "Criar convite"}</button>
      </footer>
    </form>
  </Modal>;
}

export function AccountDialog({ email, changePassword, onClose, onSaved }: { email: string; changePassword: (password: string) => Promise<void>; onClose: () => void; onSaved: () => void }) {
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 8) { setFailure("Use uma senha com ao menos 8 caracteres."); return; }
    if (password !== String(form.get("confirm"))) { setFailure("As duas senhas não são iguais."); return; }
    setBusy(true); setFailure("");
    try { await changePassword(password); onSaved(); }
    catch (error) { setFailure(message(error)); setBusy(false); }
  }
  return <Modal title="Minha conta" onClose={onClose} busy={busy}>
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="adm-form-body">
        <p>Você está usando a conta <strong>{email}</strong>.</p>
        <div className="adm-fields">
          <div className="adm-field span-2"><label htmlFor="acc-password">Nova senha <small>mínimo de 8 caracteres</small></label><input id="acc-password" name="password" type="password" autoComplete="new-password" minLength={8} /></div>
          <div className="adm-field span-2"><label htmlFor="acc-confirm">Repita a nova senha</label><input id="acc-confirm" name="confirm" type="password" autoComplete="new-password" /></div>
        </div>
      </div>
      <footer className="adm-modal-foot">
        {failure && <p role="alert" className="adm-error">{failure}</p>}
        <button type="button" className="adm-btn adm-btn-quiet" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? "Salvando…" : "Trocar senha"}</button>
      </footer>
    </form>
  </Modal>;
}
