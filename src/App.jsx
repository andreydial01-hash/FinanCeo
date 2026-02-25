import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

/* ─── localStorage helpers ─── */
const LS_KEY = "financeos_portfolios";
const loadPortfolios = () => {
  try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
};
const savePortfolios = (data) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
};

const createPortfolio = (name) => ({
  id: Date.now(),
  name,
  createdAt: new Date().toISOString().slice(0, 10),
  transactions: [],
  debts: [],
});

const defaultData = () => ({
  portfolios: [createPortfolio("Mi Portafolio Principal")],
  activeId: null,
});

/* ─── Formatters ─── */
const fmt = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const fmtDate = (d) => new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

const CAT_EXPENSE = ["Alimentación","Transporte","Salud","Entretenimiento","Servicios","Ropa","Educación","Otro"];
const CAT_INCOME  = ["Salario","Freelance","Inversiones","Regalos","Ventas","Otro"];
const PIE_PALETTE = ["#a78bfa","#818cf8","#60a5fa","#34d399","#fbbf24"];

const generatePlan = (total, interest, payment) => {
  const monthlyRate = interest / 100 / 12;
  let remaining = total;
  const plan = [];
  let month = 1;
  while (remaining > 0.01 && month <= 600) {
    const interestCharge = remaining * monthlyRate;
    const principal = Math.min(payment - interestCharge, remaining);
    if (principal <= 0) break;
    remaining -= principal;
    plan.push({ month, interest: interestCharge, principal, remaining: Math.max(remaining, 0), payment: Math.min(payment, remaining + payment) });
    month++;
  }
  return plan;
};

/* ══════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════ */
export default function App() {
  const [state, setState] = useState(() => {
    const saved = loadPortfolios();
    if (saved) return { ...saved, activeId: saved.portfolios[0]?.id || null };
    const def = defaultData();
    def.activeId = def.portfolios[0].id;
    return def;
  });

  const [view, setView] = useState("dashboard");
  const [notification, setNotification] = useState(null);
  const [showNewPortfolioModal, setShowNewPortfolioModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Forms
  const [txForm, setTxForm] = useState({ type:"expense", amount:"", category:"Alimentación", description:"", date: new Date().toISOString().slice(0,10) });
  const [debtForm, setDebtForm] = useState({ name:"", total:"", interest:"0", payment:"", startDate: new Date().toISOString().slice(0,10), notes:"" });

  const save = useCallback((newState) => {
    setState(newState);
    savePortfolios({ portfolios: newState.portfolios, activeId: newState.activeId });
  }, []);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const portfolio = state.portfolios.find(p => p.id === state.activeId) || state.portfolios[0];

  const updatePortfolio = (updater) => {
    const updated = state.portfolios.map(p => p.id === portfolio.id ? updater(p) : p);
    save({ ...state, portfolios: updated });
  };

  /* ─── Stats ─── */
  const totalIncome  = portfolio.transactions.filter(t => t.type === "income").reduce((s,t) => s + t.amount, 0);
  const totalExpense = portfolio.transactions.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const totalDebt = portfolio.debts.reduce((s,d) => s + d.remaining, 0);

  const monthlyData = (() => {
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      months[key] = { month: d.toLocaleDateString("es-MX",{month:"short"}), income:0, expense:0 };
    }
    portfolio.transactions.forEach(t => {
      const key = t.date.slice(0,7);
      if (months[key]) months[key][t.type] += t.amount;
    });
    return Object.values(months);
  })();

  const categoryData = (() => {
    const cats = {};
    portfolio.transactions.filter(t => t.type === "expense").forEach(t => { cats[t.category] = (cats[t.category]||0) + t.amount; });
    return Object.entries(cats).map(([name,value]) => ({name,value})).sort((a,b)=>b.value-a.value).slice(0,5);
  })();

  /* ─── Actions ─── */
  const addTransaction = () => {
    if (!txForm.amount || isNaN(txForm.amount) || +txForm.amount <= 0) { notify("Ingresa un monto válido","error"); return; }
    const tx = { id:Date.now(), ...txForm, amount:+txForm.amount };
    updatePortfolio(p => ({ ...p, transactions: [tx, ...p.transactions] }));
    setTxForm({ type:"expense", amount:"", category:"Alimentación", description:"", date: new Date().toISOString().slice(0,10) });
    notify("Transacción registrada ✓");
  };

  const deleteTransaction = (id) => {
    updatePortfolio(p => ({ ...p, transactions: p.transactions.filter(t => t.id !== id) }));
    notify("Transacción eliminada");
  };

  const addDebt = () => {
    if (!debtForm.name || !debtForm.total || !debtForm.payment) { notify("Completa todos los campos requeridos","error"); return; }
    const total = +debtForm.total, payment = +debtForm.payment, interest = +debtForm.interest;
    const plan = generatePlan(total, interest, payment);
    const debt = { id:Date.now(), ...debtForm, total, payment, interest, remaining:total, paid:0, plan, payments:[] };
    updatePortfolio(p => ({ ...p, debts: [...p.debts, debt] }));
    setDebtForm({ name:"", total:"", interest:"0", payment:"", startDate: new Date().toISOString().slice(0,10), notes:"" });
    notify("Deuda registrada ✓");
  };

  const makePayment = (debtId, amount) => {
    updatePortfolio(p => ({
      ...p,
      debts: p.debts.map(d => {
        if (d.id !== debtId) return d;
        const pay = Math.min(+amount, d.remaining);
        return { ...d, remaining: d.remaining - pay, paid: d.paid + pay, payments: [...d.payments, { date: new Date().toISOString().slice(0,10), amount: pay }] };
      })
    }));
    notify("Abono registrado ✓");
  };

  const deleteDebt = (id) => {
    updatePortfolio(p => ({ ...p, debts: p.debts.filter(d => d.id !== id) }));
    setSelectedDebt(null);
    notify("Deuda eliminada");
  };

  const createNewPortfolio = () => {
    if (!newPortfolioName.trim()) { notify("Escribe un nombre","error"); return; }
    const np = createPortfolio(newPortfolioName.trim());
    const newState = { portfolios: [...state.portfolios, np], activeId: np.id };
    save(newState);
    setNewPortfolioName("");
    setShowNewPortfolioModal(false);
    setView("dashboard");
    notify(`Portafolio "${np.name}" creado ✓`);
  };

  const switchPortfolio = (id) => { save({ ...state, activeId: id }); setView("dashboard"); setSidebarOpen(false); };

  /* ══ RENDER ══ */
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#0a0a0f", minHeight:"100vh", color:"#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0a0a0f}::-webkit-scrollbar-thumb{background:#2d2d3d;border-radius:3px}
        input,select,textarea{background:#12121e!important;border:1px solid #2d2d3d!important;color:#e2e8f0!important;border-radius:10px!important;padding:10px 14px!important;width:100%;font-family:inherit;font-size:14px;outline:none!important;transition:border-color .2s}
        input:focus,select:focus{border-color:#a78bfa!important;box-shadow:0 0 0 3px rgba(167,139,250,.12)!important}
        select option{background:#12121e}
        button{cursor:pointer;font-family:inherit;transition:all .2s}
        .card{background:#12121e;border:1px solid #1e1e2e;border-radius:18px;padding:22px}
        .btn-primary{background:linear-gradient(135deg,#7c3aed,#a78bfa);color:white;border:none;padding:11px 22px;border-radius:10px;font-weight:600;font-size:14px}
        .btn-primary:hover{opacity:.85;transform:translateY(-1px)}
        .btn-ghost{background:transparent;border:1px solid #2d2d3d;color:#94a3b8;padding:10px 18px;border-radius:10px;font-size:13px}
        .btn-ghost:hover{border-color:#a78bfa;color:#a78bfa}
        .nav-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;font-size:14px;font-weight:500;color:#64748b;cursor:pointer;transition:all .2s;border:none;background:none;width:100%;text-align:left}
        .nav-item:hover{color:#e2e8f0;background:#1e1e2e}
        .nav-item.active{color:#a78bfa;background:rgba(167,139,250,.1)}
        .tx-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #1a1a2a}
        .tx-row:last-child{border-bottom:none}
        .progress-bar{height:8px;background:#1e1e2e;border-radius:99px;overflow:hidden}
        .progress-fill{height:100%;border-radius:99px;transition:width 1s ease}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .debt-card{background:#12121e;border:1px solid #1e1e2e;border-radius:14px;padding:18px;cursor:pointer;transition:all .2s}
        .debt-card:hover{border-color:#a78bfa;transform:translateY(-2px)}
        .notif{position:fixed;top:20px;right:20px;z-index:999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;animation:slideIn .3s ease}
        @keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)}
        .modal{background:#12121e;border:1px solid #2d2d3d;border-radius:20px;padding:28px;width:100%;max-width:600px;max-height:88vh;overflow-y:auto}
        .plan-row{display:grid;grid-template-columns:auto 1fr 1fr 1fr 1fr;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;align-items:center}
        .plan-row:nth-child(even){background:#0f0f1a}
        .portfolio-pill{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:none;background:none;color:#64748b;width:100%;text-align:left;transition:all .2s}
        .portfolio-pill:hover{background:#1e1e2e;color:#e2e8f0}
        .portfolio-pill.active-pill{background:rgba(167,139,250,.12);color:#a78bfa}
        .hamburger{display:none}
        .sidebar-overlay{display:none}
        @media(max-width:768px){
          .hamburger{display:flex;position:fixed;top:14px;left:14px;z-index:150;background:#12121e;border:1px solid #2d2d3d;border-radius:10px;padding:8px 10px;align-items:center;justify-content:center;color:#a78bfa;font-size:20px}
          .sidebar{position:fixed!important;left:-260px!important;top:0;height:100%;z-index:140;transition:left .3s ease!important}
          .sidebar.open{left:0!important}
          .sidebar-overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:130;backdrop-filter:blur(3px)}
          .main-content{padding:20px 16px!important;padding-top:60px!important}
          .grid2{grid-template-columns:1fr!important}
          .stats-grid{grid-template-columns:1fr 1fr!important}
          .chart-grid{grid-template-columns:1fr!important}
        }
        @media(max-width:420px){.stats-grid{grid-template-columns:1fr!important}}
      `}</style>

      {/* Notification */}
      {notification && (
        <div className="notif" style={{ background:notification.type==="error"?"#1f0a0a":"#0a1f0a", border:`1px solid ${notification.type==="error"?"#7f1d1d":"#14532d"}`, color:notification.type==="error"?"#f87171":"#4ade80" }}>
          {notification.msg}
        </div>
      )}

      {/* Mobile hamburger */}
      <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>☰</button>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div style={{ display:"flex", minHeight:"100vh" }}>
        {/* ── SIDEBAR ── */}
        <div className={`sidebar ${sidebarOpen ? "open" : ""}`} style={{ width:240, background:"#0d0d17", borderRight:"1px solid #1a1a2a", padding:"28px 14px", display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
          {/* Logo */}
          <div style={{ padding:"0 8px 20px" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:900, background:"linear-gradient(135deg,#a78bfa,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>FinanceOS</div>
            <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>Control financiero inteligente</div>
          </div>

          {/* Nav */}
          {[
            { id:"dashboard", label:"Dashboard", icon:"◈" },
            { id:"transactions", label:"Transacciones", icon:"⇄" },
            { id:"debts", label:"Deudas", icon:"◎" },
          ].map(n => (
            <button key={n.id} className={`nav-item ${view===n.id?"active":""}`} onClick={() => { setView(n.id); setSidebarOpen(false); }}>
              <span style={{ fontSize:16 }}>{n.icon}</span> {n.label}
            </button>
          ))}

          {/* Portfolios */}
          <div style={{ margin:"16px 0 6px", padding:"0 8px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#334155", letterSpacing:".1em", textTransform:"uppercase" }}>Portafolios</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:2, maxHeight:180, overflowY:"auto" }}>
            {state.portfolios.map(p => (
              <button key={p.id} className={`portfolio-pill ${state.activeId===p.id?"active-pill":""}`} onClick={() => switchPortfolio(p.id)}>
                <span style={{ fontSize:14 }}>◑</span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
              </button>
            ))}
          </div>

          {/* New portfolio button */}
          <button
            onClick={() => setShowNewPortfolioModal(true)}
            style={{ display:"flex", alignItems:"center", gap:8, margin:"8px 0 0", padding:"10px 14px", borderRadius:10, border:"1px dashed #2d2d3d", background:"transparent", color:"#475569", fontSize:13, fontWeight:500, width:"100%", transition:"all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="#a78bfa"; e.currentTarget.style.color="#a78bfa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="#2d2d3d"; e.currentTarget.style.color="#475569"; }}
          >
            <span style={{ fontSize:18, lineHeight:1 }}>+</span> Nuevo portafolio
          </button>

          {/* Balance */}
          <div style={{ marginTop:"auto", padding:"16px 10px", borderTop:"1px solid #1a1a2a" }}>
            <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:".06em" }}>Balance · {portfolio.name}</div>
            <div style={{ fontSize:22, fontWeight:700, color:balance>=0?"#4ade80":"#f87171", marginTop:6 }}>{fmt(balance)}</div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div className="main-content" style={{ flex:1, overflow:"auto", padding:"32px 28px" }}>
          <div style={{ maxWidth:1080, margin:"0 auto" }}>

            {/* ══ DASHBOARD ══ */}
            {view==="dashboard" && (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
                {/* Hero title */}
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:38, fontWeight:900, lineHeight:1.1, background:"linear-gradient(135deg,#a78bfa 0%,#60a5fa 50%,#34d399 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:"-.02em" }}>
                    {portfolio.name}
                  </div>
                  <div style={{ color:"#334155", fontSize:13, marginTop:6 }}>
                    {new Date().toLocaleDateString("es-MX",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
                  </div>
                </div>

                {/* Stat cards */}
                <div className="stats-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                  {[
                    { label:"Balance", value:balance, color:balance>=0?"#4ade80":"#f87171", icon:"◈", glow:"#4ade8022" },
                    { label:"Ingresos", value:totalIncome, color:"#4ade80", icon:"↑", glow:"#4ade8022" },
                    { label:"Gastos", value:totalExpense, color:"#f87171", icon:"↓", glow:"#f8717122" },
                    { label:"Deuda", value:totalDebt, color:"#fb923c", icon:"◎", glow:"#fb923c22" },
                  ].map((s,i) => (
                    <div key={i} style={{ background:"#12121e", border:`1px solid ${s.glow}`, borderRadius:16, padding:"18px 16px", position:"relative", overflow:"hidden" }}>
                      <div style={{ fontSize:11, color:"#475569", marginBottom:8, fontWeight:600, letterSpacing:".05em", textTransform:"uppercase" }}>{s.label}</div>
                      <div style={{ fontSize:20, fontWeight:700, color:s.color, lineHeight:1.2 }}>{fmt(s.value)}</div>
                      <div style={{ position:"absolute", top:14, right:14, fontSize:20, color:s.color, opacity:.4 }}>{s.icon}</div>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div className="chart-grid" style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>
                  <div className="card">
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Flujo — últimos 6 meses</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={monthlyData}>
                        <defs>
                          <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={.3}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient>
                          <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={.3}/><stop offset="95%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{fill:"#475569",fontSize:12}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/>
                        <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #2d2d3d",borderRadius:10,color:"#e2e8f0"}} formatter={v=>fmt(v)}/>
                        <Area type="monotone" dataKey="income" stroke="#4ade80" fill="url(#ig)" strokeWidth={2} name="Ingresos"/>
                        <Area type="monotone" dataKey="expense" stroke="#f87171" fill="url(#eg)" strokeWidth={2} name="Gastos"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card">
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:14, textTransform:"uppercase", letterSpacing:".06em" }}>Por categoría</div>
                    {categoryData.length>0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={120}>
                          <PieChart>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={32} outerRadius={56} dataKey="value" paddingAngle={3}>
                              {categoryData.map((_,i) => <Cell key={i} fill={PIE_PALETTE[i%PIE_PALETTE.length]}/>)}
                            </Pie>
                            <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #2d2d3d",borderRadius:10}} formatter={v=>fmt(v)}/>
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
                          {categoryData.map((c,i) => (
                            <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                              <span style={{ display:"flex", alignItems:"center", gap:6, color:"#94a3b8" }}><span style={{ width:8, height:8, borderRadius:2, background:PIE_PALETTE[i%PIE_PALETTE.length], display:"inline-block" }}/>{c.name}</span>
                              <span style={{ color:"#f87171", fontWeight:600 }}>{fmt(c.value)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : <div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"30px 0" }}>Sin datos aún</div>}
                  </div>
                </div>

                {/* Recent transactions */}
                <div className="card">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", textTransform:"uppercase", letterSpacing:".06em" }}>Últimas transacciones</div>
                    <button className="btn-ghost" onClick={() => setView("transactions")} style={{ fontSize:12, padding:"6px 14px" }}>Ver todas →</button>
                  </div>
                  {portfolio.transactions.slice(0,6).length===0 ? (
                    <div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"24px 0" }}>Sin transacciones. ¡Empieza registrando una!</div>
                  ) : portfolio.transactions.slice(0,6).map(t => (
                    <div key={t.id} className="tx-row">
                      <div style={{ width:36,height:36,borderRadius:10,background:t.type==="income"?"#0d2010":"#200d0d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                        {t.type==="income"?"↑":"↓"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:"#e2e8f0" }}>{t.description||t.category}</div>
                        <div style={{ fontSize:12, color:"#475569" }}>{t.category} · {fmtDate(t.date)}</div>
                      </div>
                      <div style={{ fontSize:15, fontWeight:700, color:t.type==="income"?"#4ade80":"#f87171" }}>
                        {t.type==="income"?"+":"-"}{fmt(t.amount)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Debts summary */}
                {portfolio.debts.length>0 && (
                  <div className="card">
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Estado de deudas</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {portfolio.debts.map(d => {
                        const pct = ((d.total-d.remaining)/d.total)*100;
                        return (
                          <div key={d.id}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                              <span style={{ color:"#e2e8f0", fontWeight:500 }}>{d.name}</span>
                              <span style={{ color:"#fb923c" }}>{fmt(d.remaining)} restante</span>
                            </div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width:`${pct}%`, background:"linear-gradient(90deg,#fb923c,#a78bfa)" }}/>
                            </div>
                            <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>{pct.toFixed(1)}% pagado · {d.plan.length} meses plan</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ TRANSACTIONS ══ */}
            {view==="transactions" && (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, background:"linear-gradient(135deg,#a78bfa,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Transacciones</div>
                <div className="card">
                  <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Nueva transacción</div>
                  <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                    {["expense","income"].map(t => (
                      <button key={t} onClick={() => setTxForm(f=>({...f,type:t,category:t==="income"?"Salario":"Alimentación"}))}
                        style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${txForm.type===t?(t==="income"?"#4ade80":"#f87171"):"#2d2d3d"}`, background:txForm.type===t?(t==="income"?"#0d2010":"#200d0d"):"transparent", color:txForm.type===t?(t==="income"?"#4ade80":"#f87171"):"#64748b", fontWeight:600, fontSize:13 }}>
                        {t==="income"?"↑ Ingreso":"↓ Gasto"}
                      </button>
                    ))}
                  </div>
                  <div className="grid2">
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Monto *</div><input type="number" placeholder="0.00" value={txForm.amount} onChange={e=>setTxForm(f=>({...f,amount:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Fecha</div><input type="date" value={txForm.date} onChange={e=>setTxForm(f=>({...f,date:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Categoría</div>
                      <select value={txForm.category} onChange={e=>setTxForm(f=>({...f,category:e.target.value}))}>
                        {(txForm.type==="income"?CAT_INCOME:CAT_EXPENSE).map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Descripción</div><input placeholder="Opcional" value={txForm.description} onChange={e=>setTxForm(f=>({...f,description:e.target.value}))}/></div>
                  </div>
                  <button className="btn-primary" onClick={addTransaction} style={{ marginTop:16, width:"100%" }}>Registrar transacción</button>
                </div>
                <div className="card">
                  <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Historial ({portfolio.transactions.length})</div>
                  {portfolio.transactions.length===0 ? (
                    <div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"30px 0" }}>Sin transacciones registradas</div>
                  ) : portfolio.transactions.map(t => (
                    <div key={t.id} className="tx-row">
                      <div style={{ width:36,height:36,borderRadius:10,background:t.type==="income"?"#0d2010":"#200d0d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                        {t.type==="income"?"↑":"↓"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:"#e2e8f0" }}>{t.description||t.category}</div>
                        <div style={{ fontSize:12, color:"#475569" }}>{t.category} · {fmtDate(t.date)}</div>
                      </div>
                      <div style={{ fontSize:15, fontWeight:700, color:t.type==="income"?"#4ade80":"#f87171", marginRight:12 }}>
                        {t.type==="income"?"+":"-"}{fmt(t.amount)}
                      </div>
                      <button onClick={()=>deleteTransaction(t.id)} style={{ background:"none",border:"none",color:"#334155",fontSize:20,padding:4,borderRadius:6,lineHeight:1 }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ DEBTS ══ */}
            {view==="debts" && (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, background:"linear-gradient(135deg,#fb923c,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Gestión de Deudas</div>
                <div className="card">
                  <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Registrar nueva deuda</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14 }}>
                    <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Nombre *</div><input placeholder="Ej. Tarjeta, préstamo..." value={debtForm.name} onChange={e=>setDebtForm(f=>({...f,name:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Total *</div><input type="number" placeholder="0.00" value={debtForm.total} onChange={e=>setDebtForm(f=>({...f,total:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Interés anual (%)</div><input type="number" placeholder="0" value={debtForm.interest} onChange={e=>setDebtForm(f=>({...f,interest:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Pago mensual *</div><input type="number" placeholder="0.00" value={debtForm.payment} onChange={e=>setDebtForm(f=>({...f,payment:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Fecha de inicio</div><input type="date" value={debtForm.startDate} onChange={e=>setDebtForm(f=>({...f,startDate:e.target.value}))}/></div>
                    <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Notas</div><input placeholder="Notas adicionales..." value={debtForm.notes} onChange={e=>setDebtForm(f=>({...f,notes:e.target.value}))}/></div>
                  </div>
                  {debtForm.total && debtForm.payment && (
                    <div style={{ background:"#0d0d17",border:"1px solid #1e1e2e",borderRadius:12,padding:14,marginTop:14 }}>
                      {(() => {
                        const plan = generatePlan(+debtForm.total,+debtForm.interest,+debtForm.payment);
                        if (!plan.length) return <div style={{ color:"#f87171",fontSize:13 }}>⚠ Pago insuficiente para cubrir intereses</div>;
                        const totalPaid = plan.reduce((s,p)=>s+p.payment,0);
                        const totalInt  = plan.reduce((s,p)=>s+p.interest,0);
                        return (
                          <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                            <div><div style={{ fontSize:11,color:"#475569" }}>Meses para liquidar</div><div style={{ fontSize:22,fontWeight:700,color:"#a78bfa" }}>{plan.length}</div></div>
                            <div><div style={{ fontSize:11,color:"#475569" }}>Total a pagar</div><div style={{ fontSize:22,fontWeight:700,color:"#fb923c" }}>{fmt(totalPaid)}</div></div>
                            <div><div style={{ fontSize:11,color:"#475569" }}>Total intereses</div><div style={{ fontSize:22,fontWeight:700,color:"#f87171" }}>{fmt(totalInt)}</div></div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <button className="btn-primary" onClick={addDebt} style={{ marginTop:16, width:"100%" }}>Registrar deuda</button>
                </div>
                {portfolio.debts.length===0 ? (
                  <div className="card" style={{ textAlign:"center",padding:40 }}>
                    <div style={{ fontSize:40,marginBottom:12 }}>◎</div>
                    <div style={{ color:"#475569",fontSize:14 }}>Sin deudas registradas. ¡Excelente!</div>
                  </div>
                ) : (
                  <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                    {portfolio.debts.map(d => {
                      const pct = ((d.total-d.remaining)/d.total)*100;
                      return (
                        <div key={d.id} className="debt-card" onClick={()=>setSelectedDebt(d)}>
                          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
                            <div>
                              <div style={{ fontSize:15,fontWeight:600,color:"#e2e8f0" }}>{d.name}</div>
                              <div style={{ fontSize:12,color:"#475569",marginTop:2 }}>{d.interest>0?`${d.interest}% anual`:"Sin interés"} · {fmt(d.payment)}/mes</div>
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontSize:18,fontWeight:700,color:d.remaining===0?"#4ade80":"#fb923c" }}>{fmt(d.remaining)}</div>
                              <div style={{ fontSize:11,color:"#475569" }}>de {fmt(d.total)}</div>
                            </div>
                          </div>
                          <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%`,background:d.remaining===0?"#4ade80":"linear-gradient(90deg,#fb923c,#a78bfa)" }}/></div>
                          <div style={{ display:"flex",justifyContent:"space-between",marginTop:8,fontSize:12,color:"#475569" }}>
                            <span>{pct.toFixed(1)}% pagado</span>
                            <span style={{ color:"#a78bfa" }}>Ver plan →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ DEBT MODAL ══ */}
      {selectedDebt && <DebtModal debt={portfolio.debts.find(x=>x.id===selectedDebt.id)||selectedDebt} onClose={()=>setSelectedDebt(null)} onPay={(id,amt)=>{makePayment(id,amt);setSelectedDebt(s=>({...s}));}} onDelete={deleteDebt} fmt={fmt} fmtDate={fmtDate} />}

      {/* ══ NEW PORTFOLIO MODAL ══ */}
      {showNewPortfolioModal && (
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setShowNewPortfolioModal(false)}>
          <div className="modal" style={{ maxWidth:420 }}>
            <div style={{ fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,background:"linear-gradient(135deg,#a78bfa,#60a5fa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:6 }}>Nuevo Portafolio</div>
            <div style={{ fontSize:13,color:"#475569",marginBottom:24 }}>Crea un portafolio separado para organizar distintos proyectos o personas.</div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Nombre del portafolio *</div>
              <input autoFocus placeholder="Ej. Gastos del hogar, Negocio..." value={newPortfolioName} onChange={e=>setNewPortfolioName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createNewPortfolio()} />
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button className="btn-ghost" onClick={()=>setShowNewPortfolioModal(false)} style={{ flex:1 }}>Cancelar</button>
              <button className="btn-primary" onClick={createNewPortfolio} style={{ flex:1 }}>Crear portafolio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Debt detail modal (separate component to allow local state) ── */
function DebtModal({ debt: d, onClose, onPay, onDelete, fmt, fmtDate }) {
  const [payAmt, setPayAmt] = useState(String(d.payment));
  const pct = ((d.total-d.remaining)/d.total)*100;
  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:700,color:"#f1f5f9" }}>{d.name}</div>
            <div style={{ fontSize:13,color:"#475569",marginTop:4 }}>Plan de pago · {d.plan.length} meses</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#475569",fontSize:26,lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20 }}>
          {[{label:"Deuda inicial",value:fmt(d.total),color:"#94a3b8"},{label:"Restante",value:fmt(d.remaining),color:"#fb923c"},{label:"Pagado",value:fmt(d.paid),color:"#4ade80"}].map((s,i)=>(
            <div key={i} style={{ background:"#0d0d17",borderRadius:10,padding:"12px 14px" }}>
              <div style={{ fontSize:11,color:"#475569" }}>{s.label}</div>
              <div style={{ fontSize:15,fontWeight:700,color:s.color,marginTop:4 }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="progress-bar" style={{ marginBottom:6 }}>
          <div className="progress-fill" style={{ width:`${pct}%`,background:d.remaining===0?"#4ade80":"linear-gradient(90deg,#fb923c,#a78bfa)" }}/>
        </div>
        <div style={{ fontSize:12,color:"#475569",marginBottom:20 }}>{pct.toFixed(1)}% completado</div>
        {d.remaining>0 ? (
          <div style={{ background:"#0d0d17",border:"1px solid #1e1e2e",borderRadius:12,padding:16,marginBottom:20 }}>
            <div style={{ fontSize:13,fontWeight:600,color:"#94a3b8",marginBottom:10 }}>Registrar abono</div>
            <div style={{ display:"flex",gap:10 }}>
              <input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)} placeholder="Monto" style={{ flex:1 }}/>
              <button className="btn-primary" onClick={()=>onPay(d.id,payAmt)}>Abonar</button>
            </div>
          </div>
        ) : (
          <div style={{ background:"#0d2010",border:"1px solid #14532d",borderRadius:12,padding:16,marginBottom:20,textAlign:"center",color:"#4ade80",fontWeight:600 }}>🎉 ¡Deuda completamente pagada!</div>
        )}
        {d.payments.length>0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13,fontWeight:600,color:"#94a3b8",marginBottom:10 }}>Historial de abonos</div>
            <div style={{ maxHeight:140,overflow:"auto" }}>
              {d.payments.map((p,i)=>(
                <div key={i} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1a1a2a",fontSize:13 }}>
                  <span style={{ color:"#64748b" }}>{fmtDate(p.date)}</span>
                  <span style={{ color:"#4ade80",fontWeight:600 }}>+{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize:13,fontWeight:600,color:"#94a3b8",marginBottom:10 }}>Tabla de amortización</div>
          <div style={{ display:"grid",gridTemplateColumns:"auto 1fr 1fr 1fr 1fr",gap:4,fontSize:11,color:"#334155",padding:"6px 12px",fontWeight:700 }}>
            <span>#</span><span>Pago</span><span>Capital</span><span>Interés</span><span>Restante</span>
          </div>
          <div style={{ maxHeight:220,overflow:"auto" }}>
            {d.plan.map((p,i)=>(
              <div key={i} className="plan-row" style={{ color:i<d.payments.length?"#2d2d3d":"#94a3b8",textDecoration:i<d.payments.length?"line-through":"none" }}>
                <span>{p.month}</span><span>{fmt(p.payment)}</span><span>{fmt(p.principal)}</span>
                <span style={{ color:i<d.payments.length?"#2d2d3d":"#f87171" }}>{fmt(p.interest)}</span>
                <span>{fmt(p.remaining)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end",marginTop:20,gap:10 }}>
          <button className="btn-ghost" onClick={()=>onDelete(d.id)} style={{ color:"#f87171",borderColor:"#7f1d1d" }}>Eliminar deuda</button>
          <button className="btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
