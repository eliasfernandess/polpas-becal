"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Download, ExternalLink, Eye, EyeOff, KeyRound, LogOut, Pencil, Plus, Search, ShoppingBasket, Star, Trash2 } from "lucide-react";
import { DeleteDialog, ProductDialog, StockDialog } from "@/components/admin/dialogs";
import { SaleDialog } from "@/components/admin/sale-dialog";
import { AccountDialog, TeamView } from "@/components/admin/team";
import type { AdminRepo } from "@/lib/admin-repo";
import { levelOf, restockList, summarize, toCsv } from "@/lib/admin-stats";
import { setCatalog, toData } from "@/lib/catalog";
import { money } from "@/lib/money";
import type { Product, StockMovement } from "@/types/product";

const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const units = (n: number) => n.toLocaleString("pt-BR");
const when = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const stamp = () => new Date().toISOString().slice(0, 10);

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const productFilters = [
  { id: "all", label: "Todos", test: () => true },
  { id: "low", label: "Estoque baixo", test: (p: Product) => levelOf(p) === "low" },
  { id: "out", label: "Esgotados", test: (p: Product) => levelOf(p) === "out" },
  { id: "hidden", label: "Ocultos", test: (p: Product) => !p.active },
] as const;
type ProductFilter = (typeof productFilters)[number]["id"];
const movementFilters = [
  { id: "all", label: "Todas", test: () => true },
  { id: "in", label: "Entradas", test: (m: StockMovement) => m.delta > 0 },
  { id: "out", label: "Saídas", test: (m: StockMovement) => m.delta < 0 },
  { id: "sale", label: "Vendas", test: (m: StockMovement) => m.reason === "Venda" },
] as const;
type MovementFilter = (typeof movementFilters)[number]["id"];

type View = "overview" | "products" | "movements" | "team";
type Dialog =
  | { type: "product"; product: Product | null } | { type: "stock"; product: Product } | { type: "delete"; product: Product }
  | { type: "sale" } | { type: "account" } | null;

export function Panel({ repo, email, onSignOut }: { repo: AdminRepo; email: string | null; onSignOut: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [moveQuery, setMoveQuery] = useState("");
  const [moveFilter, setMoveFilter] = useState<MovementFilter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const manager = repo.role === "admin";

  const reload = useCallback(async () => {
    try {
      const [list, history] = await Promise.all([repo.list(), repo.movements()]);
      setProducts(list); setMovements(history); setFailure("");
      setCatalog(list);
    } catch (error) { setFailure(message(error)); }
  }, [repo]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer); }, [reload]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);

  const done = (text: string) => { setDialog(null); setNotice(text); void reload(); };
  async function toggle(product: Product, key: "active" | "featured") {
    try {
      await repo.update(product.id, { ...toData(product), [key]: !product[key] });
      setNotice(key === "active" ? (product.active ? `${product.name} oculto da loja.` : `${product.name} visível na loja.`) : (product.featured ? `${product.name} saiu dos destaques.` : `${product.name} em destaque.`));
      void reload();
    } catch (error) { setFailure(message(error)); }
  }

  const all = useMemo(() => products ?? [], [products]);
  const totals = useMemo(() => ({
    units: all.reduce((sum, p) => sum + p.stock, 0),
    value: all.reduce((sum, p) => sum + p.stock * p.priceInCents, 0),
    low: all.filter(p => levelOf(p) === "low").length,
    out: all.filter(p => levelOf(p) === "out").length,
  }), [all]);
  const categories = useMemo(() => [...new Set(all.map(p => p.category))], [all]);
  const restock = useMemo(() => restockList(all), [all]);
  const period = useMemo(() => summarize(movements, all), [movements, all]);
  const shown = all.filter(p => productFilters.find(f => f.id === filter)!.test(p) && normalize(p.name).includes(normalize(query)));
  const shownMoves = movements.filter(m => movementFilters.find(f => f.id === moveFilter)!.test(m) && normalize(`${m.productName} ${m.note}`).includes(normalize(moveQuery)));
  const openFilter = (id: ProductFilter) => { setView("products"); setFilter(id); setQuery(""); };

  const exportStock = () => download(`estoque-${stamp()}.csv`, toCsv([
    ["Produto", "Categoria", "Unidade", "Preço (R$)", "Estoque (un.)", "Mínimo (un.)", "Situação", "Na loja"],
    ...all.map(p => [p.name, p.category, p.unitLabel, (p.priceInCents / 100).toFixed(2).replace(".", ","), p.stock, p.lowStock, { ok: "Normal", low: "Baixo", out: "Esgotado" }[levelOf(p)], p.active ? "Sim" : "Não"]),
  ]));
  const exportMoves = () => download(`movimentacoes-${stamp()}.csv`, toCsv([
    ["Data", "Produto", "Motivo", "Observação", "Quantidade", "Saldo", "Por"],
    ...shownMoves.map(m => [when.format(new Date(m.createdAt)), m.productName, m.reason, m.note, m.delta, m.stockAfter, m.actor ?? ""]),
  ]));

  const tabs: { id: View; label: string }[] = [
    { id: "overview", label: "Visão geral" }, { id: "products", label: "Produtos" }, { id: "movements", label: "Movimentações" },
    ...(manager ? [{ id: "team" as const, label: "Equipe" }] : []),
  ];
  const stockRow = (p: Product) => {
    const level = levelOf(p);
    const fill = p.stock === 0 ? 0 : p.lowStock === 0 ? 100 : Math.min(100, (p.stock / (p.lowStock * 4)) * 100);
    return <div className="adm-stock" data-level={level}>
      <div><strong>{units(p.stock)}</strong><span>{level === "out" ? "Esgotado" : level === "low" ? `Baixo · mín. ${p.lowStock}` : "un."}</span></div>
      <div className="adm-meter" aria-hidden="true"><i style={{ width: `${fill}%` }} /></div>
    </div>;
  };
  const productCell = (p: Product) => <div className="adm-product">
    <span className={`adm-thumb tone-${p.tone}`}>{p.image && <img src={p.image} alt="" width="44" height="44" />}</span>
    <div>
      <strong>{p.name}{p.featured && <Star size={13} aria-label="Em destaque" />}</strong>
      <span>{p.category} · {p.unitLabel}{!p.active && " · oculto"}</span>
    </div>
  </div>;

  return <div className="adm">
    <header className="adm-top">
      <div className="adm-top-inner">
        <Link href="/" aria-label="Polpas Becal — ir para a loja"><img src="/images/brand/logo.webp" width="120" height="40" alt="Polpas Becal" /></Link>
        <h1 className="adm-top-title">Estoque</h1>
        <span className="adm-mode" data-mode={repo.mode}>{repo.mode === "supabase" ? (manager ? "Administrador" : "Estoque") : "Demonstração"}</span>
        <div className="adm-top-actions">
          <Link className="adm-btn adm-btn-quiet" href="/produtos/" target="_blank"><ExternalLink size={16} /><span>Ver loja</span></Link>
          {repo.changePassword && <button className="adm-btn adm-btn-quiet" onClick={() => setDialog({ type: "account" })} title={email ?? undefined}><KeyRound size={16} /><span>Minha conta</span></button>}
          {email && <button className="adm-btn adm-btn-quiet" onClick={onSignOut}><LogOut size={16} /><span>Sair</span></button>}
        </div>
      </div>
    </header>

    <main className="adm-main">
      {repo.mode === "local" && <p className="adm-banner">
        <strong>Modo demonstração.</strong> O Supabase ainda não foi configurado: o que você alterar aqui fica salvo só neste navegador e não aparece para outros visitantes. O passo a passo está no README.
      </p>}
      {failure && <p className="adm-banner adm-banner-error" role="alert">{failure} <button className="adm-link" onClick={() => void reload()}>Tentar de novo</button></p>}

      <section className="adm-summary" aria-label="Resumo do estoque">
        <div className="adm-summary-hero">
          <span>Em estoque agora</span>
          <strong>{products ? units(totals.units) : "—"}</strong>
          <span>unidades em {all.length} {all.length === 1 ? "sabor" : "sabores"} · {money(totals.value)} a preço de venda</span>
        </div>
        <button className="adm-alert" data-level="low" data-zero={totals.low === 0} onClick={() => openFilter("low")}><strong>{totals.low}</strong><span>com estoque baixo</span></button>
        <button className="adm-alert" data-level="out" data-zero={totals.out === 0} onClick={() => openFilter("out")}><strong>{totals.out}</strong><span>{totals.out === 1 ? "esgotado" : "esgotados"}</span></button>
      </section>

      <div className="adm-bar">
        <div className="adm-tabs" role="tablist" aria-label="Seções do painel">
          {tabs.map(tab => <button key={tab.id} role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)}>{tab.label}</button>)}
        </div>
        <div className="adm-bar-actions">
          {manager && <button className="adm-btn" onClick={() => setDialog({ type: "product", product: null })}><Plus size={16} /> Novo produto</button>}
          <button className="adm-btn adm-btn-primary" onClick={() => setDialog({ type: "sale" })} disabled={!all.some(p => p.stock > 0)}><ShoppingBasket size={16} /> Registrar venda</button>
        </div>
      </div>

      {view === "overview" && <section className="adm-overview" aria-label="Visão geral">
        <div className="adm-card">
          <header><h2>Repor primeiro</h2><span>{restock.length ? `${restock.length} ${restock.length === 1 ? "sabor precisa" : "sabores precisam"} de atenção` : "Nada pendente"}</span></header>
          {!products ? <p className="adm-quiet" role="status">Carregando…</p>
            : !restock.length ? <p className="adm-quiet">Todos os sabores visíveis na loja estão acima do mínimo.</p>
            : <ul className="adm-restock">{restock.slice(0, 6).map(p => <li key={p.id}>
                {productCell(p)}
                {stockRow(p)}
                <button className="adm-btn" onClick={() => setDialog({ type: "stock", product: p })} aria-label={`Repor ${p.name}`}>Repor</button>
              </li>)}</ul>}
          {restock.length > 6 && <button className="adm-link" onClick={() => openFilter("low")}>Ver todos</button>}
        </div>

        <div className="adm-card">
          <header><h2>Últimos 30 dias</h2><span>pelas movimentações registradas</span></header>
          <dl className="adm-period">
            <div><dt>Vendas</dt><dd>{units(period.unitsSold)} <small>un.</small></dd><dd className="adm-period-note">≈ {money(period.revenueCents)} a preço atual</dd></div>
            <div><dt>Entradas</dt><dd data-sign="in">+{units(period.unitsIn)}</dd></div>
            <div><dt>Saídas</dt><dd data-sign="out">−{units(period.unitsOut)}</dd></div>
          </dl>
          <h3>Mais vendidos</h3>
          {period.top.length ? <ol className="adm-top-sold">{period.top.map(item => <li key={item.productId}>
            <span>{item.name}</span><strong>{units(item.units)}</strong>
            <i aria-hidden="true" style={{ width: `${(item.units / period.top[0].units) * 100}%` }} />
          </li>)}</ol> : <p className="adm-quiet">Nenhuma venda registrada no período. Use <em>Registrar venda</em> ao fechar um pedido.</p>}
        </div>

        <div className="adm-card adm-card-wide">
          <header><h2>Atividade recente</h2>{movements.length > 0 && <button className="adm-link" onClick={() => setView("movements")}>Ver tudo</button>}</header>
          {movements.length ? <MovementList items={movements.slice(0, 5)} /> : <p className="adm-quiet">Entradas, saídas e vendas aparecem aqui.</p>}
        </div>
      </section>}

      {view === "products" && <section aria-label="Produtos">
        <div className="adm-tools">
          <div className="adm-search"><Search size={16} /><label className="sr-only" htmlFor="adm-search">Buscar produto</label><input id="adm-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produto" /></div>
          <div className="adm-chips" role="group" aria-label="Filtrar produtos">
            {productFilters.map(f => <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}<span>{all.filter(f.test).length}</span></button>)}
          </div>
          <button className="adm-btn adm-btn-quiet adm-export" onClick={exportStock} disabled={!all.length}><Download size={16} /> Exportar CSV</button>
        </div>
        {!products ? <p className="adm-empty" role="status">{failure ? "Não foi possível carregar os produtos." : "Carregando produtos…"}</p>
          : !shown.length ? <div className="adm-empty">
              {all.length === 0 ? <><strong>Nenhum produto cadastrado.</strong><p>Crie o primeiro sabor para ele aparecer na loja.</p>{manager && <button className="adm-btn adm-btn-primary" onClick={() => setDialog({ type: "product", product: null })}><Plus size={16} /> Novo produto</button>}</>
                : <><strong>Nada por aqui.</strong><p>Nenhum produto corresponde à busca ou ao filtro.</p><button className="adm-btn" onClick={() => { setQuery(""); setFilter("all"); }}>Limpar filtros</button></>}
            </div>
          : <ul className="adm-list">
              <li className="adm-row adm-row-head" aria-hidden="true"><span>Produto</span><span>Preço</span><span>Estoque</span><span /></li>
              {shown.map(p => <li key={p.id} className="adm-row" data-hidden={!p.active}>
                {productCell(p)}
                <span className="adm-price">{money(p.priceInCents)}</span>
                {stockRow(p)}
                <div className="adm-actions">
                  <button className="adm-btn" onClick={() => setDialog({ type: "stock", product: p })} aria-label={`Movimentar estoque de ${p.name}`}><ArrowLeftRight size={15} /><span>Movimentar</span></button>
                  {manager && <>
                    <button className="adm-icon" onClick={() => void toggle(p, "active")} aria-label={p.active ? `Ocultar ${p.name} da loja` : `Mostrar ${p.name} na loja`} title={p.active ? "Ocultar da loja" : "Mostrar na loja"}>{p.active ? <Eye size={17} /> : <EyeOff size={17} />}</button>
                    <button className="adm-icon" onClick={() => setDialog({ type: "product", product: p })} aria-label={`Editar ${p.name}`} title="Editar"><Pencil size={16} /></button>
                    <button className="adm-icon adm-icon-danger" onClick={() => setDialog({ type: "delete", product: p })} aria-label={`Excluir ${p.name}`} title="Excluir"><Trash2 size={16} /></button>
                  </>}
                </div>
              </li>)}
            </ul>}
      </section>}

      {view === "movements" && <section aria-label="Movimentações">
        <div className="adm-tools">
          <div className="adm-search"><Search size={16} /><label className="sr-only" htmlFor="adm-move-search">Buscar nas movimentações</label><input id="adm-move-search" type="search" value={moveQuery} onChange={event => setMoveQuery(event.target.value)} placeholder="Produto ou observação" /></div>
          <div className="adm-chips" role="group" aria-label="Filtrar movimentações">
            {movementFilters.map(f => <button key={f.id} aria-pressed={moveFilter === f.id} onClick={() => setMoveFilter(f.id)}>{f.label}</button>)}
          </div>
          <button className="adm-btn adm-btn-quiet adm-export" onClick={exportMoves} disabled={!shownMoves.length}><Download size={16} /> Exportar CSV</button>
        </div>
        {!movements.length ? <div className="adm-empty"><strong>Nenhuma movimentação ainda.</strong><p>Entradas, saídas e contagens aparecem aqui, da mais recente para a mais antiga.</p></div>
          : !shownMoves.length ? <div className="adm-empty"><strong>Nada por aqui.</strong><p>Nenhuma movimentação corresponde à busca ou ao filtro.</p><button className="adm-btn" onClick={() => { setMoveQuery(""); setMoveFilter("all"); }}>Limpar filtros</button></div>
          : <MovementList items={shownMoves} head />}
      </section>}

      {view === "team" && manager && <TeamView repo={repo} onNotice={setNotice} />}
    </main>

    <div className={`adm-toast ${notice ? "visible" : ""}`} role="status" aria-live="polite">{notice}</div>

    {dialog?.type === "product" && <ProductDialog repo={repo} product={dialog.product} categories={categories} nextSort={all.reduce((max, p) => Math.max(max, p.sort + 1), 0)} onClose={() => setDialog(null)} onSaved={name => done(dialog.product ? `${name} atualizado.` : `${name} criado.`)} />}
    {dialog?.type === "stock" && <StockDialog repo={repo} product={dialog.product} onClose={() => setDialog(null)} onSaved={stock => done(`${dialog.product.name}: saldo de ${units(stock)} un.`)} />}
    {dialog?.type === "delete" && <DeleteDialog repo={repo} product={dialog.product} onClose={() => setDialog(null)} onDeleted={() => done(`${dialog.product.name} excluído.`)} />}
    {dialog?.type === "sale" && <SaleDialog repo={repo} products={all} onClose={() => setDialog(null)} onSaved={count => done(`Venda registrada: ${units(count)} un.`)} />}
    {dialog?.type === "account" && repo.changePassword && <AccountDialog email={email ?? ""} changePassword={repo.changePassword} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice("Senha alterada."); }} />}
  </div>;
}

function MovementList({ items, head = false }: { items: StockMovement[]; head?: boolean }) {
  return <ul className="adm-list">
    {head && <li className="adm-move adm-row-head" aria-hidden="true"><span>Quando</span><span>Produto</span><span>Motivo</span><span>Qtd.</span><span>Saldo</span></li>}
    {items.map(m => <li key={m.id} className="adm-move">
      <time dateTime={m.createdAt}>{when.format(new Date(m.createdAt))}</time>
      <strong>{m.productName}</strong>
      <span>{m.reason}{m.note && <small> — {m.note}</small>}{m.actor && <small> · por {m.actor}</small>}</span>
      <span className="adm-delta" data-sign={m.delta > 0 ? "in" : "out"}>{m.delta > 0 ? "+" : "−"}{units(Math.abs(m.delta))}</span>
      <span className="adm-after">{units(m.stockAfter)}</span>
    </li>)}
  </ul>;
}
