import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const LS_KEY = "financeos_portfolios";
const LS_PAY_KEY = "financeos_upcoming";
const loadPortfolios = () => { try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : null; } catch { return null; } };
const savePortfolios = (data) => { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {} };
const loadUpcoming = () => { try { const d = localStorage.getItem(LS_PAY_KEY); return d ? JSON.parse(d) : []; } catch { return []; } };
const saveUpcoming = (data) => { try { localStorage.setItem(LS_PAY_KEY, JSON.stringify(data)); } catch {} };

const createPortfolio = (name) => ({ id: Date.now(), name, createdAt: new Date().toISOString().slice(0,10), transactions: [], debts: [] });
const defaultData = () => { const d = { portfolios: [createPortfolio("Mi Portafolio Principal")], activeId: null }; d.activeId = d.portfolios[0].id; return d; };

const fmt = (n) => new Intl.NumberFormat("es-MX", { style:"currency", currency:"MXN" }).format(n || 0);
const fmtDate = (d) => new Date(d).toLocaleDateString("es-MX", { day:"2-digit", month:"short" });
const fmtDateFull = (d) => new Date(d+"T00:00:00").toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" });
const daysUntil = (dateStr) => { const t = new Date(dateStr+"T00:00:00"); const n = new Date(); n.setHours(0,0,0,0); return Math.ceil((t-n)/(1000*60*60*24)); };

const CAT_EXPENSE = ["Alimentación","Transporte","Salud","Entretenimiento","Servicios","Ropa","Educación","Deudas","Otro"];
const CAT_INCOME  = ["Salario","Freelance","Inversiones","Regalos","Ventas","Otro"];
const PIE_PALETTE = ["#a78bfa","#818cf8","#60a5fa","#34d399","#fbbf24"];
const PAY_TYPES   = ["Tarjeta de crédito","Tarjeta de débito","Préstamo","Renta","Servicio","Suscripción","Otro"];

const generatePlan = (total, interest, payment) => {
  const monthlyRate = interest / 100 / 12;
  let remaining = total;
  const plan = [];
  let month = 1;
  while (remaining > 0.0001 && month <= 600) {
    const interestCharge = remaining * monthlyRate;
    if (payment <= interestCharge) return { error: "El pago mensual no cubre los intereses. Aumenta el pago mensual." };
    const totalOwed = remaining + interestCharge;
    const realPayment = payment >= totalOwed ? totalOwed : payment;
    const principal = realPayment - interestCharge;
    remaining = remaining - principal;
    if (remaining < 0.0001) remaining = 0;
    plan.push({ month, interest: interestCharge, principal, remaining, payment: realPayment });
    if (remaining === 0) break;
    month++;
  }
  return plan;
};

export default function App() {
  const [state, setState] = useState(() => {
    const saved = loadPortfolios();
    if (saved) return { ...saved, activeId: saved.portfolios[0]?.id || null };
    return defaultData();
  });
  const [view, setView] = useState("dashboard");
  const [notification, setNotification] = useState(null);
  const [showNewPortfolioModal, setShowNewPortfolioModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [upcoming, setUpcoming] = useState(() => loadUpcoming());
  const [payAlerts, setPayAlerts] = useState([]);
  const [payForm, setPayForm] = useState({ name:"", amount:"", dueDate:"", type:"Tarjeta de crédito", reminderDays:"3", notes:"", repeat:"none" });
  const [txForm, setTxForm] = useState({ type:"expense", amount:"", category:"Alimentación", description:"", date: new Date().toISOString().slice(0,10) });
  const [debtForm, setDebtForm] = useState({ name:"", total:"", interest:"0", payment:"", startDate: new Date().toISOString().slice(0,10), notes:"" });

  const save = useCallback((ns) => { setState(ns); savePortfolios({ portfolios: ns.portfolios, activeId: ns.activeId }); }, []);

  const notify = (msg, type="success") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 4000); };

  // Check alerts on upcoming change
  useEffect(() => {
    const alerts = upcoming.filter(p => {
      if (p.dismissed) return false;
      const diff = daysUntil(p.dueDate);
      return diff >= 0 && diff <= Number(p.reminderDays);
    });
    setPayAlerts(alerts);
  }, [upcoming]);

  const portfolio = state.portfolios.find(p => p.id === state.activeId) || state.portfolios[0];
  const updatePortfolio = (updater) => { save({ ...state, portfolios: state.portfolios.map(p => p.id === portfolio.id ? updater(p) : p) }); };

  const totalIncome  = portfolio.transactions.filter(t => t.type==="income").reduce((s,t) => s+t.amount, 0);
  const totalExpense = portfolio.transactions.filter(t => t.type==="expense").reduce((s,t) => s+t.amount, 0);
  const balance = totalIncome - totalExpense;
  const totalDebt = portfolio.debts.reduce((s,d) => s+d.remaining, 0);

  const monthlyData = (() => {
    const months = {}; const now = new Date();
    for (let i=5; i>=0; i--) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; months[k] = { month: d.toLocaleDateString("es-MX",{month:"short"}), income:0, expense:0 }; }
    portfolio.transactions.forEach(t => { const k = t.date.slice(0,7); if (months[k]) months[k][t.type] += t.amount; });
    return Object.values(months);
  })();

  const categoryData = (() => {
    const cats = {};
    portfolio.transactions.filter(t => t.type==="expense").forEach(t => { cats[t.category] = (cats[t.category]||0)+t.amount; });
    return Object.entries(cats).map(([name,value]) => ({name,value})).sort((a,b) => b.value-a.value).slice(0,5);
  })();

  const addTransaction = () => {
    if (!txForm.amount || isNaN(txForm.amount) || +txForm.amount<=0) { notify("Ingresa un monto válido","error"); return; }
    updatePortfolio(p => ({ ...p, transactions: [{ id:Date.now(), ...txForm, amount:+txForm.amount }, ...p.transactions] }));
    setTxForm({ type:"expense", amount:"", category:"Alimentación", description:"", date: new Date().toISOString().slice(0,10) });
    notify("Transacción registrada");
  };
  const deleteTransaction = (id) => { updatePortfolio(p => ({ ...p, transactions: p.transactions.filter(t => t.id!==id) })); };

  const addDebt = () => {
    if (!debtForm.name || !debtForm.total || !debtForm.payment) { notify("Completa todos los campos","error"); return; }
    const plan = generatePlan(+debtForm.total, +debtForm.interest, +debtForm.payment);
    if (!Array.isArray(plan)) { notify(plan.error,"error"); return; }
    updatePortfolio(p => ({ ...p, debts: [...p.debts, { id:Date.now(), ...debtForm, total:+debtForm.total, payment:+debtForm.payment, interest:+debtForm.interest, remaining:+debtForm.total, paid:0, plan, payments:[] }] }));
    setDebtForm({ name:"", total:"", interest:"0", payment:"", startDate: new Date().toISOString().slice(0,10), notes:"" });
    notify("Deuda registrada");
  };

  const makePayment = (debtId, amount) => {
    updatePortfolio(p => {
      const debt = p.debts.find(d => d.id===debtId); if (!debt) return p;
      const pay = Math.min(+amount, debt.remaining);
      const today = new Date().toISOString().slice(0,10);
      return {
        ...p,
        debts: p.debts.map(d => d.id!==debtId ? d : { ...d, remaining:d.remaining-pay, paid:d.paid+pay, payments:[...d.payments,{date:today,amount:pay}] }),
        transactions: [{ id:Date.now(), type:"expense", amount:pay, category:"Deudas", description:`Pago deuda: ${debt.name}`, date:today }, ...p.transactions],
      };
    });
    notify("Abono registrado — gasto descontado del balance");
  };

  const deleteDebt = (id) => { updatePortfolio(p => ({ ...p, debts: p.debts.filter(d => d.id!==id) })); setSelectedDebt(null); };

  const createNewPortfolio = () => {
    if (!newPortfolioName.trim()) { notify("Escribe un nombre","error"); return; }
    const np = createPortfolio(newPortfolioName.trim());
    save({ portfolios:[...state.portfolios, np], activeId:np.id });
    setNewPortfolioName(""); setShowNewPortfolioModal(false); setView("dashboard");
    notify(`Portafolio "${np.name}" creado`);
  };
  const switchPortfolio = (id) => { save({ ...state, activeId:id }); setView("dashboard"); setSidebarOpen(false); };

  // Upcoming payments CRUD
  const addUpcoming = () => {
    if (!payForm.name || !payForm.dueDate) { notify("Nombre y fecha son requeridos","error"); return; }
    const np = { id:Date.now(), ...payForm, amount:payForm.amount ? +payForm.amount : null, dismissed:false };
    const updated = [...upcoming, np];
    setUpcoming(updated); saveUpcoming(updated);
    setPayForm({ name:"", amount:"", dueDate:"", type:"Tarjeta de crédito", reminderDays:"3", notes:"", repeat:"none" });
    notify("Pago próximo registrado");
  };
  const deleteUpcoming = (id) => { const u = upcoming.filter(p => p.id!==id); setUpcoming(u); saveUpcoming(u); };
  const dismissAlert = (id) => { const u = upcoming.map(p => p.id===id ? {...p, dismissed:true} : p); setUpcoming(u); saveUpcoming(u); };
  const resetDismiss = (id) => { const u = upcoming.map(p => p.id===id ? {...p, dismissed:false} : p); setUpcoming(u); saveUpcoming(u); };

  const sortedUpcoming = [...upcoming].sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate));

  const TYPE_ICONS = { "Tarjeta de crédito":"💳","Tarjeta de débito":"💳","Préstamo":"🏦","Renta":"🏠","Servicio":"⚡","Suscripción":"📱","Otro":"📅" };

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
        .btn-danger{background:transparent;border:1px solid #7f1d1d;color:#f87171;padding:8px 14px;border-radius:8px;font-size:12px}
        .btn-danger:hover{background:#1f0a0a}
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
        .notif{position:fixed;top:20px;right:20px;z-index:999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;animation:slideIn .3s ease;max-width:320px}
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
        .pay-card{background:#12121e;border:1px solid #1e1e2e;border-radius:14px;padding:16px;transition:all .2s;position:relative;overflow:hidden}
        .pay-card:hover{border-color:#2d2d4d}
        .alert-banner{display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:12px;margin-bottom:20px;animation:slideIn .4s ease}
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

      {/* Toast notification */}
      {notification && (
        <div className="notif" style={{ background:notification.type==="error"?"#1f0a0a":"#0a1f0a", border:`1px solid ${notification.type==="error"?"#7f1d1d":"#14532d"}`, color:notification.type==="error"?"#f87171":"#4ade80" }}>
          {notification.msg}
        </div>
      )}

      {/* ── ALERT BANNERS (floating top-center) ── */}
      {payAlerts.length > 0 && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:500, display:"flex", flexDirection:"column", gap:8, minWidth:320, maxWidth:460 }}>
          {payAlerts.map(a => {
            const diff = daysUntil(a.dueDate);
            const urgent = diff <= 1;
            return (
              <div key={a.id} className="alert-banner" style={{ background:urgent?"#1f0a0a":"#1a130a", border:`1px solid ${urgent?"#ef4444":"#f59e0b"}`, color:urgent?"#f87171":"#fbbf24", boxShadow:`0 0 24px ${urgent?"#ef444433":"#f59e0b33"}` }}>
                <span style={{ fontSize:22 }}>{urgent ? "🚨" : "⏰"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{a.name}</div>
                  <div style={{ fontSize:12, opacity:.8 }}>
                    {diff === 0 ? "¡Vence HOY!" : diff === 1 ? "Vence MAÑANA" : `Vence en ${diff} días`}
                    {a.amount ? ` · ${fmt(a.amount)}` : ""}
                  </div>
                </div>
                <button onClick={() => dismissAlert(a.id)} style={{ background:"none", border:"none", color:"inherit", fontSize:18, opacity:.6, padding:4 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>☰</button>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div style={{ display:"flex", minHeight:"100vh" }}>
        {/* ── SIDEBAR ── */}
        <div className={`sidebar ${sidebarOpen?"open":""}`} style={{ width:240, background:"#0d0d17", borderRight:"1px solid #1a1a2a", padding:"28px 14px", display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
          <div style={{ padding:"0 8px 20px" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:900, background:"linear-gradient(135deg,#a78bfa,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>FinanceOS</div>
            <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>Control financiero inteligente</div>
          </div>

          {[
            { id:"dashboard", label:"Dashboard", icon:"◈" },
            { id:"transactions", label:"Transacciones", icon:"⇄" },
            { id:"debts", label:"Deudas", icon:"◎" },
            { id:"payments", label:"Próximos Pagos", icon:"🔔", badge:payAlerts.length },
          ].map(n => (
            <button key={n.id} className={`nav-item ${view===n.id?"active":""}`} onClick={() => { setView(n.id); setSidebarOpen(false); }}>
              <span style={{ fontSize:16 }}>{n.icon}</span>
              <span style={{ flex:1 }}>{n.label}</span>
              {n.badge > 0 && <span style={{ background:"#ef4444", color:"#fff", fontSize:10, fontWeight:700, borderRadius:99, padding:"1px 7px", minWidth:18, textAlign:"center" }}>{n.badge}</span>}
            </button>
          ))}

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
          <button onClick={() => setShowNewPortfolioModal(true)}
            style={{ display:"flex", alignItems:"center", gap:8, margin:"8px 0 0", padding:"10px 14px", borderRadius:10, border:"1px dashed #2d2d3d", background:"transparent", color:"#475569", fontSize:13, fontWeight:500, width:"100%", transition:"all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="#a78bfa"; e.currentTarget.style.color="#a78bfa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="#2d2d3d"; e.currentTarget.style.color="#475569"; }}>
            <span style={{ fontSize:18, lineHeight:1 }}>+</span> Nuevo portafolio
          </button>

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
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:38, fontWeight:900, lineHeight:1.1, background:"linear-gradient(135deg,#a78bfa 0%,#60a5fa 50%,#34d399 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:"-.02em" }}>{portfolio.name}</div>
                  <div style={{ color:"#334155", fontSize:13, marginTop:6 }}>{new Date().toLocaleDateString("es-MX",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
                </div>

                <div className="stats-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                  {[
                    { label:"Balance", value:balance, color:balance>=0?"#4ade80":"#f87171", icon:"◈", glow:"#4ade8022" },
                    { label:"Ingresos", value:totalIncome, color:"#4ade80", icon:"↑", glow:"#4ade8022" },
                    { label:"Gastos", value:totalExpense, color:"#f87171", icon:"↓", glow:"#f8717122" },
                    { label:"Deuda", value:totalDebt, color:"#fb923c", icon:"◎", glow:"#fb923c22" },
                  ].map((s,i) => (
                    <div key={i} style={{ background:"#12121e", border:`1px solid ${s.glow}`, borderRadius:16, padding:"18px 16px", position:"relative", overflow:"hidden" }}>
                      <div style={{ fontSize:11, color:"#475569", marginBottom:8, fontWeight:600, letterSpacing:".05em", textTransform:"uppercase" }}>{s.label}</div>
                      <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{fmt(s.value)}</div>
                      <div style={{ position:"absolute", top:14, right:14, fontSize:20, color:s.color, opacity:.4 }}>{s.icon}</div>
                    </div>
                  ))}
                </div>

                {/* Upcoming alerts on dashboard */}
                {payAlerts.length > 0 && (
                  <div className="card" style={{ border:"1px solid #f59e0b33", background:"#1a130a" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#fbbf24", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>🔔 Pagos próximos que requieren atención</div>
                    {payAlerts.map(a => {
                      const diff = daysUntil(a.dueDate);
                      return (
                        <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #2a1f0a" }}>
                          <div>
                            <div style={{ fontSize:14, fontWeight:600, color:"#f1f5f9" }}>{TYPE_ICONS[a.type] || "📅"} {a.name}</div>
                            <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{fmtDateFull(a.dueDate)} · {diff===0?"Vence hoy":diff===1?"Vence mañana":`En ${diff} días`}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            {a.amount && <div style={{ fontSize:15, fontWeight:700, color:"#fbbf24" }}>{fmt(a.amount)}</div>}
                            <button onClick={() => setView("payments")} style={{ fontSize:11, color:"#a78bfa", background:"none", border:"none", marginTop:2 }}>Ver →</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="chart-grid" style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>
                  <div className="card" style={{ position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, background:"radial-gradient(ellipse at 50% 110%, rgba(167,139,250,.08) 0%, transparent 70%)", pointerEvents:"none" }}/>
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:4, textTransform:"uppercase", letterSpacing:".06em" }}>Flujo — últimos 6 meses</div>
                    <div style={{ fontSize:11, color:"#334155", marginBottom:16 }}>
                      <span style={{ color:"#4ade80", marginRight:12 }}>● Ingresos</span>
                      <span style={{ color:"#f87171" }}>● Gastos</span>
                    </div>
                    <ResponsiveContainer width="100%" height={210}>
                      <AreaChart data={monthlyData} margin={{ top:10, right:10, left:0, bottom:0 }}>
                        <defs>
                          <linearGradient id="ig3d" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4ade80" stopOpacity={0.9}/><stop offset="40%" stopColor="#4ade80" stopOpacity={0.5}/><stop offset="100%" stopColor="#4ade80" stopOpacity={0.05}/></linearGradient>
                          <linearGradient id="eg3d" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.9}/><stop offset="40%" stopColor="#f87171" stopOpacity={0.5}/><stop offset="100%" stopColor="#f87171" stopOpacity={0.05}/></linearGradient>
                          <filter id="glow-g"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                          <filter id="glow-r"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                        </defs>
                        <XAxis dataKey="month" tick={{fill:"#475569",fontSize:12}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`}/>
                        <Tooltip contentStyle={{background:"#0d0d17",border:"1px solid #a78bfa44",borderRadius:12,color:"#e2e8f0",boxShadow:"0 0 20px rgba(167,139,250,.2)"}} formatter={v=>fmt(v)} cursor={{stroke:"#a78bfa33",strokeWidth:1}}/>
                        <Area type="monotoneX" dataKey="income" stroke="#4ade80" strokeWidth={2.5} fill="url(#ig3d)" name="Ingresos" dot={{r:4,fill:"#4ade80",strokeWidth:2,stroke:"#0d0d17"}} activeDot={{r:6,fill:"#4ade80",stroke:"#fff",strokeWidth:2,filter:"url(#glow-g)"}}/>
                        <Area type="monotoneX" dataKey="expense" stroke="#f87171" strokeWidth={2.5} fill="url(#eg3d)" name="Gastos" dot={{r:4,fill:"#f87171",strokeWidth:2,stroke:"#0d0d17"}} activeDot={{r:6,fill:"#f87171",stroke:"#fff",strokeWidth:2,filter:"url(#glow-r)"}}/>
                      </AreaChart>
                    </ResponsiveContainer>
                    <div style={{ height:1, background:"linear-gradient(90deg,transparent,rgba(167,139,250,.3),transparent)", marginTop:4 }}/>
                  </div>
                  <div className="card">
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:14, textTransform:"uppercase", letterSpacing:".06em" }}>Por categoría</div>
                    {categoryData.length>0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={120}>
                          <PieChart>
                            <defs>
                              {PIE_PALETTE.map((c,i) => (
                                <radialGradient key={i} id={`pg${i}`} cx="50%" cy="30%" r="70%">
                                  <stop offset="0%" stopColor={c} stopOpacity={1}/>
                                  <stop offset="100%" stopColor={c} stopOpacity={0.6}/>
                                </radialGradient>
                              ))}
                              <filter id="pie-shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.5"/></filter>
                            </defs>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={30} outerRadius={56} dataKey="value" paddingAngle={4} filter="url(#pie-shadow)" startAngle={90} endAngle={-270}>
                              {categoryData.map((_,i) => <Cell key={i} fill={`url(#pg${i})`} stroke={PIE_PALETTE[i%PIE_PALETTE.length]} strokeWidth={1}/>)}
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

                <div className="card">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", textTransform:"uppercase", letterSpacing:".06em" }}>Últimas transacciones</div>
                    <button className="btn-ghost" onClick={() => setView("transactions")} style={{ fontSize:12, padding:"6px 14px" }}>Ver todas →</button>
                  </div>
                  {portfolio.transactions.slice(0,6).length===0 ? (
                    <div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"24px 0" }}>Sin transacciones. ¡Empieza registrando una!</div>
                  ) : portfolio.transactions.slice(0,6).map(t => (
                    <div key={t.id} className="tx-row">
                      <div style={{ width:36,height:36,borderRadius:10,background:t.type==="income"?"#0d2010":"#200d0d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>{t.type==="income"?"↑":"↓"}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:"#e2e8f0" }}>{t.description||t.category}</div>
                        <div style={{ fontSize:12, color:"#475569" }}>{t.category} · {fmtDate(t.date)}</div>
                      </div>
                      <div style={{ fontSize:15, fontWeight:700, color:t.type==="income"?"#4ade80":"#f87171" }}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
                    </div>
                  ))}
                </div>

                {portfolio.debts.length>0 && (
                  <div className="card">
                    <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Estado de deudas</div>
                    {portfolio.debts.map(d => {
                      const pct = ((d.total-d.remaining)/d.total)*100;
                      return (
                        <div key={d.id} style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                            <span style={{ color:"#e2e8f0", fontWeight:500 }}>{d.name}</span>
                            <span style={{ color:"#fb923c" }}>{fmt(d.remaining)} restante</span>
                          </div>
                          <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%`, background:"linear-gradient(90deg,#fb923c,#a78bfa)" }}/></div>
                          <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>{pct.toFixed(1)}% pagado · {d.plan.length} meses plan</div>
                        </div>
                      );
                    })}
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
                      <div style={{ width:36,height:36,borderRadius:10,background:t.type==="income"?"#0d2010":"#200d0d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>{t.type==="income"?"↑":"↓"}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:"#e2e8f0" }}>{t.description||t.category}</div>
                        <div style={{ fontSize:12, color:"#475569" }}>{t.category} · {fmtDate(t.date)}</div>
                      </div>
                      <div style={{ fontSize:15, fontWeight:700, color:t.type==="income"?"#4ade80":"#f87171", marginRight:12 }}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</div>
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
                        if (!Array.isArray(plan)) return <div style={{ color:"#f87171",fontSize:13 }}>⚠ {plan.error}</div>;
                        if (!plan.length) return <div style={{ color:"#f87171",fontSize:13 }}>⚠ No se pudo generar el plan</div>;
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

            {/* ══ PRÓXIMOS PAGOS ══ */}
            {view==="payments" && (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
                <div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, background:"linear-gradient(135deg,#fbbf24,#fb923c)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Próximos Pagos</div>
                  <div style={{ fontSize:13, color:"#475569", marginTop:4 }}>Fechas de corte, vencimientos y recordatorios</div>
                </div>

                {/* Form */}
                <div className="card">
                  <div style={{ fontSize:13, fontWeight:600, color:"#475569", marginBottom:16, textTransform:"uppercase", letterSpacing:".06em" }}>Agregar pago / fecha de corte</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14 }}>
                    <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Nombre *</div><input placeholder="Ej. Tarjeta BBVA, Netflix, Renta..." value={payForm.name} onChange={e=>setPayForm(f=>({...f,name:e.target.value}))}/></div>
                    <div>
                      <div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Tipo</div>
                      <select value={payForm.type} onChange={e=>setPayForm(f=>({...f,type:e.target.value}))}>
                        {PAY_TYPES.map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Monto (opcional)</div><input type="number" placeholder="0.00" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))}/></div>
                    <div><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Fecha de vencimiento *</div><input type="date" value={payForm.dueDate} onChange={e=>setPayForm(f=>({...f,dueDate:e.target.value}))}/></div>
                    <div>
                      <div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Avisar con anticipación</div>
                      <select value={payForm.reminderDays} onChange={e=>setPayForm(f=>({...f,reminderDays:e.target.value}))}>
                        <option value="1">1 día antes</option>
                        <option value="3">3 días antes</option>
                        <option value="7">7 días antes</option>
                        <option value="14">14 días antes</option>
                        <option value="30">30 días antes</option>
                      </select>
                    </div>
                    <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:12,color:"#64748b",marginBottom:6 }}>Notas</div><input placeholder="Notas opcionales..." value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))}/></div>
                  </div>
                  <button className="btn-primary" onClick={addUpcoming} style={{ marginTop:16, width:"100%" }}>+ Agregar recordatorio</button>
                </div>

                {/* List */}
                {sortedUpcoming.length===0 ? (
                  <div className="card" style={{ textAlign:"center", padding:40 }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
                    <div style={{ color:"#475569", fontSize:14 }}>Sin pagos próximos registrados</div>
                    <div style={{ color:"#334155", fontSize:12, marginTop:6 }}>Agrega fechas de corte o vencimientos para recibir alertas</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {sortedUpcoming.map(p => {
                      const diff = daysUntil(p.dueDate);
                      const overdue = diff < 0;
                      const urgent = diff >= 0 && diff <= Number(p.reminderDays);
                      const color = overdue ? "#f87171" : urgent ? "#fbbf24" : "#94a3b8";
                      const bg = overdue ? "#200d0d" : urgent ? "#1a130a" : "#12121e";
                      const border = overdue ? "#7f1d1d" : urgent ? "#92400e" : "#1e1e2e";
                      return (
                        <div key={p.id} className="pay-card" style={{ background:bg, borderColor:border }}>
                          {/* Urgency strip */}
                          {urgent && !overdue && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:"linear-gradient(180deg,#fbbf24,#fb923c)", borderRadius:"14px 0 0 14px" }}/>}
                          {overdue && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:"#f87171", borderRadius:"14px 0 0 14px" }}/>}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                              <div style={{ width:40, height:40, borderRadius:10, background:overdue?"#200d0d":urgent?"#1f1205":"#1a1a2e", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0, border:`1px solid ${border}` }}>
                                {TYPE_ICONS[p.type] || "📅"}
                              </div>
                              <div>
                                <div style={{ fontSize:15, fontWeight:600, color:"#f1f5f9" }}>{p.name}</div>
                                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{p.type} · Aviso: {p.reminderDays} días antes</div>
                                {p.notes && <div style={{ fontSize:12, color:"#475569", marginTop:2, fontStyle:"italic" }}>{p.notes}</div>}
                              </div>
                            </div>
                            <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                              {p.amount && <div style={{ fontSize:16, fontWeight:700, color }}>{fmt(p.amount)}</div>}
                              <div style={{ fontSize:13, fontWeight:600, color, marginTop:2 }}>
                                {overdue ? `Venció hace ${Math.abs(diff)} día${Math.abs(diff)!==1?"s":""}` : diff===0 ? "¡Vence HOY!" : diff===1 ? "Vence mañana" : `En ${diff} días`}
                              </div>
                              <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>{fmtDateFull(p.dueDate)}</div>
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"flex-end" }}>
                            {p.dismissed && <button onClick={() => resetDismiss(p.id)} style={{ fontSize:11, color:"#64748b", background:"none", border:"1px solid #2d2d3d", padding:"4px 10px", borderRadius:6 }}>Reactivar alerta</button>}
                            {urgent && !p.dismissed && <div style={{ fontSize:11, color, fontWeight:600, padding:"4px 10px", border:`1px solid ${border}`, borderRadius:6 }}>⚡ Alerta activa</div>}
                            <button className="btn-danger" onClick={() => deleteUpcoming(p.id)}>Eliminar</button>
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

/* ── 3D Donut ── */
function Donut3D({ pct }) {
  const R=54, stroke=18, circ=2*Math.PI*R, filled=(pct/100)*circ, cx=80, cy=80;
  return (
    <div style={{ position:"relative", width:160, height:160, flexShrink:0 }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        <defs>
          <radialGradient id="dg-paid" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor="#6ee7a0"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
          <radialGradient id="dg-rem" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor="#2d2d3d"/><stop offset="100%" stopColor="#18181f"/></radialGradient>
          <filter id="d3s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#a78bfa" floodOpacity="0.35"/></filter>
          <filter id="d3i" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.6"/></filter>
          <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity="0.18"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R+2} fill="none" stroke="#a78bfa" strokeWidth={1} opacity={0.15}/>
        <circle cx={cx} cy={cy+3} r={R} fill="none" stroke="#0a0a0f" strokeWidth={stroke+2} opacity={0.5}/>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#dg-rem)" strokeWidth={stroke} filter="url(#d3i)"/>
        {pct>0 && <>
          <circle cx={cx} cy={cy+3} r={R} fill="none" stroke="#16a34a" strokeWidth={stroke+2} strokeDasharray={`${filled} ${circ-filled}`} strokeDashoffset={circ/4} strokeLinecap="round" opacity={0.25} style={{transform:`rotate(-90deg)`,transformOrigin:`${cx}px ${cy+3}px`}}/>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#dg-paid)" strokeWidth={stroke} strokeDasharray={`${filled} ${circ-filled}`} strokeDashoffset={circ/4} strokeLinecap="round" filter="url(#d3s)" style={{transform:`rotate(-90deg)`,transformOrigin:`${cx}px ${cy}px`}}/>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#gloss)" strokeWidth={stroke*0.5} strokeDasharray={`${filled*0.6} ${circ-filled*0.6}`} strokeDashoffset={circ/4} strokeLinecap="round" style={{transform:`rotate(-90deg)`,transformOrigin:`${cx}px ${cy}px`}}/>
        </>}
        <circle cx={cx} cy={cy-6} r={R-stroke-4} fill="rgba(255,255,255,0.03)"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:22, fontWeight:800, color:pct===100?"#4ade80":"#f1f5f9", lineHeight:1, fontFamily:"'Syne',sans-serif" }}>{pct.toFixed(0)}%</div>
        <div style={{ fontSize:10, color:"#475569", marginTop:3, fontWeight:600, letterSpacing:".06em", textTransform:"uppercase" }}>{pct===100?"¡Pagado!":"completado"}</div>
      </div>
    </div>
  );
}

/* ── Debt Modal ── */
function DebtModal({ debt:d, onClose, onPay, onDelete, fmt, fmtDate }) {
  const [payAmt, setPayAmt] = useState(String(d.payment));
  const pct = Math.min((d.paid/d.total)*100, 100);
  let cumPaid=0;
  const planWithStatus = d.plan.map(row => { cumPaid+=row.payment; return { ...row, isDone: d.paid >= cumPaid-0.005 }; });
  const paidMonths = planWithStatus.filter(r=>r.isDone).length;
  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:"#f1f5f9" }}>{d.name}</div>
            <div style={{ fontSize:13,color:"#475569",marginTop:3 }}>Plan de pago · <span style={{ color:"#a78bfa",fontWeight:600 }}>{d.plan.length} meses</span>{paidMonths>0&&<span style={{ color:"#4ade80",marginLeft:8 }}>· {paidMonths} cubiertos</span>}</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#475569",fontSize:26,lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:"flex", gap:20, alignItems:"center", marginBottom:24, background:"#0d0d17", borderRadius:16, padding:"20px" }}>
          <Donut3D pct={pct}/>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12 }}>
            {[{label:"Deuda inicial",value:fmt(d.total),color:"#94a3b8",icon:"◈",bg:"#1a1a2e"},{label:"Restante",value:fmt(d.remaining),color:"#fb923c",icon:"↓",bg:"#1f120a"},{label:"Pagado",value:fmt(d.paid),color:"#4ade80",icon:"↑",bg:"#0a1f0a"}].map((s,i)=>(
              <div key={i} style={{ background:s.bg, border:`1px solid ${s.color}22`, borderRadius:10, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div><div style={{ fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:".06em",fontWeight:700 }}>{s.label}</div><div style={{ fontSize:16,fontWeight:700,color:s.color,marginTop:2 }}>{s.value}</div></div>
                <span style={{ fontSize:20,color:s.color,opacity:.5 }}>{s.icon}</span>
              </div>
            ))}
          </div>
        </div>
        {d.remaining>0 ? (
          <div style={{ background:"#0d0d17",border:"1px solid #1e1e2e",borderRadius:12,padding:16,marginBottom:20 }}>
            <div style={{ fontSize:13,fontWeight:600,color:"#94a3b8",marginBottom:10 }}>Registrar abono <span style={{ fontSize:11,color:"#334155",marginLeft:8 }}>· Sugerido: {fmt(d.payment)}</span></div>
            <div style={{ display:"flex",gap:10 }}>
              <input type="number" value={payAmt} onChange={e=>setPayAmt(e.target.value)} placeholder="Monto" style={{ flex:1 }}/>
              <button className="btn-primary" onClick={()=>onPay(d.id,payAmt)}>Abonar</button>
            </div>
          </div>
        ) : <div style={{ background:"#0d2010",border:"1px solid #14532d",borderRadius:12,padding:16,marginBottom:20,textAlign:"center",color:"#4ade80",fontWeight:700,fontSize:15 }}>🎉 ¡Deuda completamente pagada!</div>}
        {d.payments.length>0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:10,textTransform:"uppercase",letterSpacing:".06em" }}>Historial de abonos</div>
            <div style={{ maxHeight:130,overflow:"auto",borderRadius:10,border:"1px solid #1a1a2a" }}>
              {d.payments.map((p,i)=>(
                <div key={i} style={{ display:"flex",justifyContent:"space-between",padding:"10px 14px",borderBottom:i<d.payments.length-1?"1px solid #1a1a2a":"none",fontSize:13 }}>
                  <span style={{ color:"#64748b" }}>{fmtDate(p.date)}</span>
                  <span style={{ color:"#4ade80",fontWeight:700 }}>+{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:10,textTransform:"uppercase",letterSpacing:".06em" }}>Tabla de amortización</div>
          <div style={{ display:"grid",gridTemplateColumns:"36px 1fr 1fr 1fr 1fr",gap:4,fontSize:11,color:"#334155",padding:"8px 12px",fontWeight:700,background:"#0d0d17",borderRadius:"8px 8px 0 0",borderBottom:"1px solid #1a1a2a" }}>
            <span>#</span><span>Pago real</span><span>Capital</span><span>Interés</span><span>Saldo restante</span>
          </div>
          <div style={{ maxHeight:240,overflow:"auto",border:"1px solid #1a1a2a",borderTop:"none",borderRadius:"0 0 8px 8px" }}>
            {planWithStatus.map((p,i)=>(
              <div key={i} style={{ display:"grid",gridTemplateColumns:"36px 1fr 1fr 1fr 1fr",gap:4,padding:"9px 12px",fontSize:12,alignItems:"center",background:p.isDone?"#0a1a0a":i%2===0?"#0f0f1a":"transparent",borderBottom:"1px solid #1a1a2a",opacity:p.isDone?0.55:1 }}>
                <span style={{ color:p.isDone?"#4ade80":"#475569",fontWeight:600 }}>{p.isDone?"✓":p.month}</span>
                <span style={{ color:p.isDone?"#4ade8088":"#e2e8f0",fontWeight:600,textDecoration:p.isDone?"line-through":"none" }}>{fmt(p.payment)}</span>
                <span style={{ color:p.isDone?"#60a5fa66":"#60a5fa" }}>{fmt(p.principal)}</span>
                <span style={{ color:p.isDone?"#f8717166":"#f87171" }}>{fmt(p.interest)}</span>
                <span style={{ color:p.isDone?"#47556966":"#94a3b8" }}>{fmt(p.remaining)}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"36px 1fr 1fr 1fr 1fr",gap:4,fontSize:12,padding:"10px 12px",background:"#12121e",borderRadius:"0 0 8px 8px",marginTop:1,fontWeight:700 }}>
            <span style={{ color:"#475569" }}>∑</span>
            <span style={{ color:"#e2e8f0" }}>{fmt(d.plan.reduce((s,r)=>s+r.payment,0))}</span>
            <span style={{ color:"#60a5fa" }}>{fmt(d.plan.reduce((s,r)=>s+r.principal,0))}</span>
            <span style={{ color:"#f87171" }}>{fmt(d.plan.reduce((s,r)=>s+r.interest,0))}</span>
            <span style={{ color:"#334155" }}>$0.00</span>
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
