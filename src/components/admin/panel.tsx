"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight, CalendarDays, Download, ExternalLink, Eye, EyeOff, History, House, KeyRound, LogOut, Menu, Package, Pencil, Plus, Search, ShoppingBag, ShoppingBasket, Star, Trash2, Users, X, type LucideIcon } from "lucide-react";
import { DeleteDialog, ProductDialog, StockDialog } from "@/components/admin/dialogs";
import { OrdersView, QuotesView, Segments, timeAgo } from "@/components/admin/orders";
import { SaleDialog } from "@/components/admin/sale-dialog";
import { AccountDialog, TeamView } from "@/components/admin/team";
import type { AdminRepo } from "@/lib/admin-repo";
import { levelOf, restockList, summarize, toCsv } from "@/lib/admin-stats";
import { setCatalog, toData } from "@/lib/catalog";
import { money } from "@/lib/money";
import type { OrderRecord, Product, QuoteRecord, StockMovement } from "@/types/product";

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

type View = "inicio" | "pedidos" | "orcamentos" | "produtos" | "movimentacoes" | "equipe";
const pages: Record<View, { label: string; icon: LucideIcon; title: string; description: string }> = {
  inicio: { label: "Início", icon: House, title: "Início", description: "O que precisa da sua atenção agora." },
  pedidos: { label: "Pedidos", icon: ShoppingBag, title: "Pedidos", description: "Pedidos feitos no site. Combine pelo WhatsApp e confirme aqui para baixar o estoque." },
  orcamentos: { label: "Orçamentos", icon: CalendarDays, title: "Orçamentos da foodbike", description: "Pedidos de orçamento para eventos, feitos na página da foodbike." },
  produtos: { label: "Produtos", icon: Package, title: "Produtos e estoque", description: "Sabores à venda, preços e quantas unidades há no freezer." },
  movimentacoes: { label: "Movimentações", icon: History, title: "Movimentações", description: "Tudo o que entrou e saiu do estoque, com quem registrou." },
  equipe: { label: "Equipe", icon: Users, title: "Equipe", description: "Quem pode entrar no painel e o que cada pessoa pode fazer." },
};

type Dialog =
  | { type: "product"; product: Product | null } | { type: "stock"; product: Product } | { type: "delete"; product: Product }
  | { type: "sale" } | { type: "account" } | null;

export function Panel({ repo, email, onSignOut }: { repo: AdminRepo; email: string | null; onSignOut: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteRecord[] | null>(null);
  const [failure, setFailure] = useState("");
  const [recordsFailure, setRecordsFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("inicio");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [moveQuery, setMoveQuery] = useState("");
  const [moveFilter, setMoveFilter] = useState<MovementFilter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const manager = repo.role === "admin";

  const reload = useCallback(async () => {
    // Estoque e registros carregam separados: se a migração de pedidos faltar, o estoque continua funcionando.
    const stock = Promise.all([repo.list(), repo.movements()]).then(([list, history]) => {
      setProducts(list); setMovements(history); setFailure(""); setCatalog(list);
    }).catch(error => setFailure(message(error)));
    const records = Promise.all([repo.orders(), repo.quotes()]).then(([o, q]) => {
      setOrders(o); setQuotes(q); setRecordsFailure("");
    }).catch(error => { setOrders([]); setQuotes([]); setRecordsFailure(message(error)); });
    await Promise.all([stock, records]);
  }, [repo]);
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer); }, [reload]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  // Novos pedidos chegam sem recarregar: confere a cada minuto.
  useEffect(() => {
    if (!repo.records) return;
    const timer = setInterval(() => { repo.orders().then(setOrders).catch(() => {}); }, 60000);
    return () => clearInterval(timer);
  }, [repo]);

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
  }), [all]);
  const categories = useMemo(() => [...new Set(all.map(p => p.category))], [all]);
  const restock = useMemo(() => restockList(all), [all]);
  const period = useMemo(() => summarize(movements, all), [movements, all]);
  const fresh = (orders ?? []).filter(o => o.status === "pending_whatsapp");
  const freshQuotes = (quotes ?? []).filter(q => q.status === "pending_whatsapp");
  const shown = all.filter(p => productFilters.find(f => f.id === filter)!.test(p) && normalize(p.name).includes(normalize(query)));
  const shownMoves = movements.filter(m => movementFilters.find(f => f.id === moveFilter)!.test(m) && normalize(`${m.productName} ${m.note}`).includes(normalize(moveQuery)));

  const exportStock = () => download(`estoque-${stamp()}.csv`, toCsv([
    ["Produto", "Categoria", "Unidade", "Preço (R$)", "Estoque (un.)", "Mínimo (un.)", "Situação", "Na loja"],
    ...all.map(p => [p.name, p.category, p.unitLabel, (p.priceInCents / 100).toFixed(2).replace(".", ","), p.stock, p.lowStock, { ok: "Normal", low: "Baixo", out: "Esgotado" }[levelOf(p)], p.active ? "Sim" : "Não"]),
  ]));
  const exportMoves = () => download(`movimentacoes-${stamp()}.csv`, toCsv([
    ["Data", "Produto", "Motivo", "Observação", "Quantidade", "Saldo", "Por"],
    ...shownMoves.map(m => [when.format(new Date(m.createdAt)), m.productName, m.reason, m.note, m.delta, m.stockAfter, m.actor ?? ""]),
  ]));

  const navigate = (next: View) => { setView(next); setMenu(false); window.scrollTo({ top: 0 }); };
  const counts: Partial<Record<View, number>> = { pedidos: fresh.length, orcamentos: freshQuotes.length, produtos: restock.length };
  const visibleViews = (Object.keys(pages) as View[]).filter(v => v !== "equipe" || manager);
  const page = pages[view];

  const actions: Record<View, ReactNode> = {
    inicio: <button className="adm-btn adm-btn-primary" onClick={() => setDialog({ type: "sale" })} disabled={!all.some(p => p.stock > 0)}><ShoppingBasket size={16} /> Registrar venda</button>,
    pedidos: null,
    orcamentos: null,
    produtos: <>
      <button className="adm-btn" onClick={exportStock} disabled={!all.length}><Download size={16} /> Exportar</button>
      {manager && <button className="adm-btn adm-btn-primary" onClick={() => setDialog({ type: "product", product: null })}><Plus size={16} /> Novo produto</button>}
    </>,
    movimentacoes: <>
      <button className="adm-btn" onClick={exportMoves} disabled={!shownMoves.length}><Download size={16} /> Exportar</button>
      <button className="adm-btn adm-btn-primary" onClick={() => setDialog({ type: "sale" })} disabled={!all.some(p => p.stock > 0)}><ShoppingBasket size={16} /> Registrar venda</button>
    </>,
    equipe: null,
  };

  const productCell = (p: Product) => <div className="adm-product">
    <span className={`adm-thumb tone-${p.tone}`}>{p.image && <img src={p.image} alt="" width="40" height="40" />}</span>
    <div>
      <strong>{p.name}{p.featured && <Star size={13} aria-label="Em destaque" />}</strong>
      <span>{p.category} · {p.unitLabel}{!p.active && " · oculto da loja"}</span>
    </div>
  </div>;
  const stockCell = (p: Product) => {
    const level = levelOf(p);
    const fill = p.stock === 0 ? 0 : p.lowStock === 0 ? 100 : Math.min(100, (p.stock / (p.lowStock * 4)) * 100);
    return <div className="adm-stock" data-level={level}>
      <div><strong>{units(p.stock)}</strong><span>{level === "out" ? "Esgotado" : level === "low" ? `Baixo (mín. ${p.lowStock})` : "em estoque"}</span></div>
      <div className="adm-meter" aria-hidden="true"><i style={{ width: `${fill}%` }} /></div>
    </div>;
  };

  return <div className="adm">
    <aside className="adm-side" data-open={menu}>
      <div className="adm-side-head">
        <Link href="/" aria-label="Polpas Becal — ir para a loja"><img src="/images/brand/logo.webp" width="112" height="37" alt="Polpas Becal" /></Link>
        <button className="adm-icon adm-side-close" onClick={() => setMenu(false)} aria-label="Fechar menu"><X size={18} /></button>
      </div>
      <nav aria-label="Seções do painel">
        {visibleViews.map(id => { const { label, icon: Icon } = pages[id]; return <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{Boolean(counts[id]) && <em data-kind={id === "produtos" ? "warn" : "new"}>{counts[id]}</em>}
        </button>; })}
      </nav>
      <div className="adm-side-foot">
        <div className="adm-me">
          <strong>{email ?? "Modo demonstração"}</strong>
          <span>{repo.mode === "local" ? "Sem login" : manager ? "Administrador" : "Estoque"}</span>
        </div>
        <Link className="adm-side-link" href="/produtos/" target="_blank"><ExternalLink size={16} /> Ver loja</Link>
        {repo.changePassword && <button className="adm-side-link" onClick={() => setDialog({ type: "account" })}><KeyRound size={16} /> Minha conta</button>}
        {email && <button className="adm-side-link" onClick={onSignOut}><LogOut size={16} /> Sair</button>}
      </div>
    </aside>
    {menu && <button className="adm-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)} />}

    <div className="adm-page">
      <header className="adm-mobilebar">
        <button className="adm-icon" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu size={20} /></button>
        <img src="/images/brand/logo.webp" width="96" height="32" alt="Polpas Becal" />
        <span className="adm-mobilebar-badge">{fresh.length > 0 && <button className="adm-badge" data-status="pending_whatsapp" onClick={() => navigate("pedidos")}>{fresh.length} novo{fresh.length > 1 ? "s" : ""}</button>}</span>
      </header>

      <main className="adm-main">
        {repo.mode === "local" && <p className="adm-banner"><strong>Modo demonstração.</strong> O Supabase não está configurado neste computador: as alterações ficam só neste navegador.</p>}
        {failure && <p className="adm-banner adm-banner-error" role="alert">{failure} <button className="adm-link" onClick={() => void reload()}>Tentar de novo</button></p>}

        <header className="adm-pagehead">
          <div><h1>{page.title}</h1><p>{page.description}</p></div>
          {actions[view] && <div className="adm-pageactions">{actions[view]}</div>}
        </header>

        {view === "inicio" && <div className="adm-stack">
          <section className="adm-pulse" aria-label="Resumo">
            <button onClick={() => navigate("pedidos")} data-tone={fresh.length ? "new" : undefined}><strong>{repo.records ? fresh.length : "—"}</strong><span>{fresh.length === 1 ? "pedido novo" : "pedidos novos"}</span></button>
            <button onClick={() => navigate("orcamentos")} data-tone={freshQuotes.length ? "new" : undefined}><strong>{repo.records ? freshQuotes.length : "—"}</strong><span>{freshQuotes.length === 1 ? "orçamento novo" : "orçamentos novos"}</span></button>
            <button onClick={() => { setFilter("low"); navigate("produtos"); }} data-tone={restock.length ? "warn" : undefined}><strong>{restock.length}</strong><span>para repor</span></button>
            <div><strong>{products ? units(totals.units) : "—"}</strong><span>un. no estoque · {money(totals.value)}</span></div>
          </section>

          <div className="adm-columns">
            <section className="adm-card" aria-labelledby="h-novos">
              <header><h2 id="h-novos">Pedidos novos</h2>{fresh.length > 0 && <button className="adm-link" onClick={() => navigate("pedidos")}>Ver todos</button>}</header>
              {!repo.records ? <p className="adm-quiet">Os pedidos aparecem aqui quando o site estiver ligado ao Supabase.</p>
                : recordsFailure ? <p className="adm-quiet">{recordsFailure}</p>
                : !fresh.length ? <p className="adm-quiet">Nenhum pedido esperando. Quando chegar um, ele aparece aqui.</p>
                : <ul className="adm-mini">{fresh.slice(0, 5).map(o => <li key={o.id}>
                    <button onClick={() => navigate("pedidos")}>
                      <span><strong>{o.customerName || "Cliente"}</strong><small>{o.items.reduce((s, i) => s + i.quantity, 0)} un. · {o.fulfillment === "entrega" ? "entrega" : o.fulfillment === "retirada" ? "retirada" : "combinar"} · {timeAgo(o.createdAt)}</small></span>
                      <b>{money(o.totalInCents)}</b>
                    </button>
                  </li>)}</ul>}
            </section>

            <section className="adm-card" aria-labelledby="h-repor">
              <header><h2 id="h-repor">Repor primeiro</h2>{restock.length > 0 && <span className="adm-hint">{restock.length} {restock.length === 1 ? "sabor" : "sabores"}</span>}</header>
              {!products ? <p className="adm-quiet" role="status">Carregando…</p>
                : !restock.length ? <p className="adm-quiet">Tudo acima do mínimo. Bom trabalho!</p>
                : <ul className="adm-restock">{restock.slice(0, 5).map(p => <li key={p.id}>
                    {productCell(p)}{stockCell(p)}
                    <button className="adm-btn" onClick={() => setDialog({ type: "stock", product: p })} aria-label={`Repor ${p.name}`}>Repor</button>
                  </li>)}</ul>}
            </section>
          </div>

          <section className="adm-card" aria-labelledby="h-periodo">
            <header><h2 id="h-periodo">Últimos 30 dias</h2><span className="adm-hint">pelas vendas registradas</span></header>
            <div className="adm-period-row">
              <dl className="adm-period">
                <div><dt>Vendidas</dt><dd>{units(period.unitsSold)} <small>un.</small></dd></div>
                <div><dt>Faturamento estimado</dt><dd>{money(period.revenueCents)}</dd></div>
                <div><dt>Entradas</dt><dd>+{units(period.unitsIn)}</dd></div>
              </dl>
              <div className="adm-top-sold-wrap">
                <h3>Mais vendidos</h3>
                {period.top.length ? <ol className="adm-top-sold">{period.top.map(item => <li key={item.productId}>
                  <span>{item.name}</span><strong>{units(item.units)}</strong>
                  <i aria-hidden="true" style={{ width: `${(item.units / period.top[0].units) * 100}%` }} />
                </li>)}</ol> : <p className="adm-quiet">Ainda sem vendas no período.</p>}
              </div>
            </div>
          </section>
        </div>}

        {view === "pedidos" && <OrdersView repo={repo} orders={orders} products={all} failure={recordsFailure} onChanged={text => { setNotice(text); void reload(); }} />}
        {view === "orcamentos" && <QuotesView repo={repo} quotes={quotes} failure={recordsFailure} onChanged={text => { setNotice(text); void reload(); }} />}

        {view === "produtos" && <section aria-label="Produtos" className="adm-stack">
          <div className="adm-tools">
            <div className="adm-search"><Search size={16} /><label className="sr-only" htmlFor="adm-search">Buscar produto</label><input id="adm-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar sabor" /></div>
            <Segments label="Filtrar produtos" value={filter} onChange={id => setFilter(id as ProductFilter)} options={productFilters.map(f => ({ id: f.id, label: f.label, count: all.filter(f.test).length }))} />
          </div>
          {!products ? <p className="adm-empty" role="status">{failure ? "Não foi possível carregar os produtos." : "Carregando produtos…"}</p>
            : !shown.length ? <div className="adm-empty">
                {all.length === 0 ? <><strong>Nenhum produto cadastrado.</strong><p>Crie o primeiro sabor para ele aparecer na loja.</p>{manager && <button className="adm-btn adm-btn-primary" onClick={() => setDialog({ type: "product", product: null })}><Plus size={16} /> Novo produto</button>}</>
                  : <><strong>Nada por aqui.</strong><p>Nenhum produto corresponde à busca ou ao filtro.</p><button className="adm-btn" onClick={() => { setQuery(""); setFilter("all"); }}>Limpar filtros</button></>}
              </div>
            : <ul className="adm-list">
                <li className="adm-row adm-row-head" aria-hidden="true"><span>Sabor</span><span>Preço</span><span>Estoque</span><span /></li>
                {shown.map(p => <li key={p.id} className="adm-row" data-hidden={!p.active}>
                  {productCell(p)}
                  <span className="adm-price">{money(p.priceInCents)}</span>
                  {stockCell(p)}
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

        {view === "movimentacoes" && <section aria-label="Movimentações" className="adm-stack">
          <div className="adm-tools">
            <div className="adm-search"><Search size={16} /><label className="sr-only" htmlFor="adm-move-search">Buscar nas movimentações</label><input id="adm-move-search" type="search" value={moveQuery} onChange={event => setMoveQuery(event.target.value)} placeholder="Sabor ou observação" /></div>
            <Segments label="Filtrar movimentações" value={moveFilter} onChange={id => setMoveFilter(id as MovementFilter)} options={movementFilters.map(f => ({ id: f.id, label: f.label }))} />
          </div>
          {!movements.length ? <div className="adm-empty"><strong>Nenhuma movimentação ainda.</strong><p>Entradas, saídas, contagens e vendas aparecem aqui, da mais recente para a mais antiga.</p></div>
            : !shownMoves.length ? <div className="adm-empty"><strong>Nada por aqui.</strong><p>Nenhuma movimentação corresponde à busca ou ao filtro.</p><button className="adm-btn" onClick={() => { setMoveQuery(""); setMoveFilter("all"); }}>Limpar filtros</button></div>
            : <MovementList items={shownMoves} />}
        </section>}

        {view === "equipe" && manager && <TeamView repo={repo} onNotice={setNotice} />}
      </main>
    </div>

    <div className={`adm-toast ${notice ? "visible" : ""}`} role="status" aria-live="polite">{notice}</div>

    {dialog?.type === "product" && <ProductDialog repo={repo} product={dialog.product} categories={categories} nextSort={all.reduce((max, p) => Math.max(max, p.sort + 1), 0)} onClose={() => setDialog(null)} onSaved={name => done(dialog.product ? `${name} atualizado.` : `${name} criado.`)} />}
    {dialog?.type === "stock" && <StockDialog repo={repo} product={dialog.product} onClose={() => setDialog(null)} onSaved={stock => done(`${dialog.product.name}: saldo de ${units(stock)} un.`)} />}
    {dialog?.type === "delete" && <DeleteDialog repo={repo} product={dialog.product} onClose={() => setDialog(null)} onDeleted={() => done(`${dialog.product.name} excluído.`)} />}
    {dialog?.type === "sale" && <SaleDialog repo={repo} products={all} onClose={() => setDialog(null)} onSaved={count => done(`Venda registrada: ${units(count)} un.`)} />}
    {dialog?.type === "account" && repo.changePassword && <AccountDialog email={email ?? ""} changePassword={repo.changePassword} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice("Senha alterada."); }} />}
  </div>;
}

function MovementList({ items }: { items: StockMovement[] }) {
  return <ul className="adm-list">
    <li className="adm-move adm-row-head" aria-hidden="true"><span>Quando</span><span>Sabor</span><span>Motivo</span><span>Qtd.</span><span>Saldo</span></li>
    {items.map(m => <li key={m.id} className="adm-move">
      <time dateTime={m.createdAt}>{when.format(new Date(m.createdAt))}</time>
      <strong>{m.productName}</strong>
      <span>{m.reason}{m.note && <small> — {m.note}</small>}{m.actor && <small> · {m.actor}</small>}</span>
      <span className="adm-delta" data-sign={m.delta > 0 ? "in" : "out"}>{m.delta > 0 ? "+" : "−"}{units(Math.abs(m.delta))}</span>
      <span className="adm-after">{units(m.stockAfter)}</span>
    </li>)}
  </ul>;
}

