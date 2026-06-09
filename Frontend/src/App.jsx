import { useState, useEffect, useCallback, useRef } from "react";
import {
  RiDashboardLine, RiFileList3Line, RiUploadCloud2Line, RiCheckboxCircleLine,
  RiTimeLine, RiAlertLine, RiSearchLine, RiRefreshLine, RiArrowRightLine,
  RiArrowLeftLine, RiDeleteBin6Line, RiEdit2Line, RiCheckLine, RiCloseLine,
  RiBuildingLine, RiAddLine, RiBarChartLine, RiArrowUpLine, RiArrowDownLine,
  RiFileTextLine, RiMenuLine, RiMoonLine, RiSunLine, RiLoader4Line,
  RiFlashlightLine, RiEyeLine, RiShieldCheckLine, RiArrowGoBackLine,
  RiCheckboxBlankCircleLine, RiAlertFill, RiCheckFill, RiInformationLine
} from "@remixicon/react";

const API = "http://localhost:8000/api";

const fmt = (n, cur = "PKR") => {
  if (n == null) return "—";
  return `${cur} ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};
const pct = (n) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const fmtDate = (s) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

const ROUTE_META = {
  AUTO_POST:     { label: "Auto Post",     color: "#22c55e", bg: "rgba(34,197,94,.12)",   icon: RiFlashlightLine },
  SOFT_REVIEW:   { label: "Soft Review",   color: "#f59e0b", bg: "rgba(245,158,11,.12)",  icon: RiEyeLine },
  MANUAL_REVIEW: { label: "Manual Review", color: "#ef4444", bg: "rgba(239,68,68,.12)",   icon: RiAlertLine },
  CORRECTED:     { label: "Corrected",     color: "#3b82f6", bg: "rgba(59,130,246,.12)",  icon: RiCheckLine },
};
const STATUS_META = {
  SUCCESS: { label: "Success", color: "#22c55e", bg: "rgba(34,197,94,.12)" },
  PARTIAL: { label: "Partial", color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  FAILED:  { label: "Failed",  color: "#ef4444", bg: "rgba(239,68,68,.12)" },
};

function useApi(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refresh = useCallback(() => {
    if (!url) return;
    setLoading(true);
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setData(d); setLoading(false); setError(null); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [url, ...deps]);
  useEffect(refresh, [refresh]);
  return { data, loading, error, refresh };
}

function Spinner({ size = 18, color }) {
  return <RiLoader4Line size={size} style={{ animation: "spin .8s linear infinite", color: color || "var(--accent)", display: "block" }} />;
}

function ConfBar({ value, showLabel = true, height = 6 }) {
  const v = Math.round((value || 0) * 100);
  const col = v >= 95 ? "#22c55e" : v >= 80 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ flex: 1, height, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", background: col, borderRadius: 99, transition: "width .7s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      {showLabel && <span style={{ fontSize: 11, fontWeight: 700, color: col, minWidth: 34, textAlign: "right", fontFamily: "var(--mono)" }}>{v}%</span>}
    </div>
  );
}

function Badge({ route }) {
  const m = ROUTE_META[route] || ROUTE_META.MANUAL_REVIEW;
  const Icon = m.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, background: m.bg, color: m.color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
      <Icon size={11} />{m.label}
    </span>
  );
}

function Tag({ label, color, bg }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, background: bg, color, fontSize: 11, fontWeight: 700 }}>{label}</span>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, accent, loading }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <div className="kpi-icon" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <div className="kpi-value" style={{ color: "var(--text)" }}>
        {loading ? <Spinner size={20} color={accent} /> : value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      <div className="kpi-glow" style={{ background: `radial-gradient(circle at bottom right, color-mix(in srgb, ${accent} 10%, transparent), transparent 70%)` }} />
    </div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ onResult, compact = false }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState(null);
  const ref = useRef();

  const run = async (file) => {
    setBusy(true); setErr(null); setStep("Preprocessing image...");
    const fd = new FormData(); fd.append("file", file);
    try {
      setStep("Running AI extraction...");
      const r = await fetch(`${API}/invoice/process`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed");
      setStep("Complete!");
      setTimeout(() => { setBusy(false); setStep(""); onResult(d); }, 500);
    } catch (e) { setErr(String(e)); setBusy(false); setStep(""); }
  };

  return (
    <div
      className={`upload-zone${drag ? " drag" : ""}${compact ? " compact" : ""}`}
      onClick={() => !busy && ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) run(f); }}
    >
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp" onChange={e => { const f = e.target.files[0]; if (f) run(f); }} style={{ display: "none" }} />
      {busy ? (
        <div className="upload-busy">
          <div className="upload-pulse"><RiUploadCloud2Line size={28} style={{ color: "var(--accent)" }} /></div>
          <span className="upload-step">{step}</span>
          <div className="upload-dots"><span /><span /><span /></div>
        </div>
      ) : (
        <div className="upload-idle">
          <div className="upload-icon-wrap">
            <RiUploadCloud2Line size={compact ? 22 : 28} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="upload-title">{compact ? "Drop or click to upload" : "Drop invoice here or click to browse"}</div>
            {!compact && <div className="upload-hint">PDF · PNG · JPG · TIFF · BMP · WEBP &nbsp;·&nbsp; max 50 MB</div>}
          </div>
        </div>
      )}
      {err && <div className="upload-err">{err}</div>}
    </div>
  );
}

// ── Invoice Row ───────────────────────────────────────────────────────────────
function InvoiceRow({ item, onSelect, onDelete }) {
  const inv = item.invoice || {};
  const route = item.routing?.route;
  const conf = item.confidence?.overall;
  const status = item.meta?.status;
  const sm = STATUS_META[status] || STATUS_META.PARTIAL;

  return (
    <tr className="trow" onClick={() => onSelect(item)}>
      <td className="td">
        <div style={{ fontWeight: 700, fontSize: 12.5, fontFamily: "var(--mono)", color: "var(--text)" }}>{inv.invoice_number || "—"}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{fmtDate(item.meta?.processed_at)}</div>
      </td>
      <td className="td">
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{inv.vendor_name || "—"}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{(inv.vendor_address || "").split(",")[0]}</div>
      </td>
      <td className="td" style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13 }}>{fmt(inv.total_amount, inv.currency)}</td>
      <td className="td"><Tag label={sm.label} color={sm.color} bg={sm.bg} /></td>
      <td className="td" style={{ minWidth: 110 }}><ConfBar value={conf} /></td>
      <td className="td"><Badge route={route} /></td>
      <td className="td" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <button className="ibtn" onClick={() => onSelect(item)}><RiEyeLine size={13} /></button>
          <button className="ibtn red" onClick={() => onDelete(item._id)}><RiDeleteBin6Line size={13} /></button>
        </div>
      </td>
    </tr>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ item, onClose, onRefresh }) {
  const [tab, setTab] = useState("fields");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    const inv = item.invoice || {};
    setForm({ vendor_name: inv.vendor_name || "", invoice_number: inv.invoice_number || "", invoice_date: inv.invoice_date || "", due_date: inv.due_date || "", po_number: inv.po_number || "", currency: inv.currency || "", subtotal: inv.subtotal ?? "", tax_amount: inv.tax_amount ?? "", discount: inv.discount ?? "", total_amount: inv.total_amount ?? "" });
    setTab("fields"); setEditing(false);
  }, [item._id]);

  const save = async () => {
    setSaving(true);
    const payload = { corrected_by: "dashboard_user" };
    const numFields = ["subtotal", "tax_amount", "discount", "total_amount"];
    Object.entries(form).forEach(([k, v]) => { if (v !== "") payload[k] = numFields.includes(k) ? Number(v) : v; });
    await fetch(`${API}/invoice/${item._id}/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false); setEditing(false); onRefresh();
  };

  const inv = item.invoice || {};
  const conf = item.confidence || {};
  const val = item.validation || {};
  const route = item.routing?.route;
  const rm = ROUTE_META[route] || ROUTE_META.MANUAL_REVIEW;
  const TABS = [{ id: "fields", l: "Fields" }, { id: "items", l: `Items (${(inv.line_items || []).length})` }, { id: "conf", l: "Confidence" }, { id: "checks", l: "Checks" }];

  return (
    <div className="detail">
      {/* header */}
      <div className="detail-hdr">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="detail-fname"><RiFileTextLine size={13} style={{ color: "var(--accent)", flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.meta?.file_name}</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            <Badge route={route} />
            <Tag label={`${pct(conf.overall)} conf`} color="var(--muted)" bg="var(--surface2)" />
            <Tag label={fmtDate(item.meta?.processed_at)} color="var(--muted)" bg="var(--surface2)" />
          </div>
        </div>
        <button className="ibtn" onClick={onClose}><RiCloseLine size={15} /></button>
      </div>

      {/* route banner */}
      <div style={{ margin: "12px 0", padding: "8px 12px", borderRadius: 8, background: rm.bg, borderLeft: `3px solid ${rm.color}`, fontSize: 12, color: rm.color, lineHeight: 1.5 }}>{item.routing?.route_reason}</div>

      {/* tabs */}
      <div className="tabs">
        {TABS.map(t => <button key={t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.l}</button>)}
      </div>

      <div className="tab-body">
        {/* Fields */}
        {tab === "fields" && (
          editing ? (
            <div className="edit-grid">
              {[["vendor_name","Vendor Name"],["invoice_number","Invoice #"],["invoice_date","Invoice Date"],["due_date","Due Date"],["po_number","PO Number"],["currency","Currency"],["subtotal","Subtotal"],["tax_amount","Tax Amount"],["discount","Discount"],["total_amount","Total Amount"]].map(([k, l]) => (
                <div key={k} className="field-edit">
                  <label className="field-lbl">{l}</label>
                  <input className="inp" value={form[k] ?? ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button className="btn-sec" onClick={() => setEditing(false)}><RiArrowGoBackLine size={13} /> Cancel</button>
                <button className="btn-pri" onClick={save} disabled={saving}>{saving ? <Spinner size={13} color="white" /> : <RiCheckLine size={13} />} Save</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="fields-grid">
                {[["Vendor", inv.vendor_name], ["Address", inv.vendor_address], ["Tax ID", inv.vendor_tax_id], ["Invoice #", inv.invoice_number], ["Date", fmtDate(inv.invoice_date)], ["Due Date", fmtDate(inv.due_date)], ["PO Number", inv.po_number], ["Currency", inv.currency], ["Payment Terms", inv.payment_terms], ["Subtotal", fmt(inv.subtotal, inv.currency)], ["Tax Rate", inv.tax_rate != null ? `${(inv.tax_rate * 100).toFixed(1)}%` : "—"], ["Tax Amount", fmt(inv.tax_amount, inv.currency)], ["Discount", inv.discount ? fmt(inv.discount, inv.currency) : "—"], ["Total Amount", fmt(inv.total_amount, inv.currency)]].map(([k, v]) => (
                  <div key={k} className={`field-cell${k === "Total Amount" ? " highlight" : ""}`}>
                    <span className="field-key">{k}</span>
                    <span className={`field-val${k === "Total Amount" ? " total" : ""}${!v || v === "—" ? " empty" : ""}`}>{v || "—"}</span>
                  </div>
                ))}
              </div>
              <button className="btn-sec" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => setEditing(true)}><RiEdit2Line size={13} /> Edit Fields</button>
            </div>
          )
        )}

        {/* Line items */}
        {tab === "items" && (
          <div>
            {!(inv.line_items || []).length ? (
              <div className="empty-state"><RiFileTextLine size={32} /><span>No line items extracted</span></div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr className="thead-row">{["#","Description","Qty","Unit Price","Amount","OK"].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>
                    {(inv.line_items || []).map((li, i) => {
                      const ok = Math.abs(li.quantity * li.unit_price - li.amount) < 0.05;
                      return (
                        <tr key={i} className={i % 2 === 0 ? "trow-alt" : "trow-plain"}>
                          <td className="td-sm tc">{i + 1}</td>
                          <td className="td-sm">{li.description}</td>
                          <td className="td-sm tr mono">{li.quantity}</td>
                          <td className="td-sm tr mono">{fmt(li.unit_price, inv.currency)}</td>
                          <td className="td-sm tr mono fw7">{fmt(li.amount, inv.currency)}</td>
                          <td className="td-sm tc">{ok ? <RiCheckFill size={13} style={{ color: "#22c55e" }} /> : <RiAlertFill size={13} style={{ color: "#ef4444" }} />}</td>
                        </tr>
                      );
                    })}
                    <tr className="trow-total">
                      <td className="td-sm" colSpan={4} style={{ textAlign: "right", fontWeight: 700, paddingRight: 12 }}>Line Items Total</td>
                      <td className="td-sm tr mono fw7 accent">{fmt((inv.line_items || []).reduce((s, li) => s + li.amount, 0), inv.currency)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {conf.arithmetic_detail && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: conf.arithmetic_ok ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: conf.arithmetic_ok ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: 500, display: "flex", gap: 6, alignItems: "flex-start" }}>
                {conf.arithmetic_ok ? <RiCheckFill size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : <RiAlertFill size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
                {conf.arithmetic_detail}
              </div>
            )}
          </div>
        )}

        {/* Confidence */}
        {tab === "conf" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div className="mini-stat"><div className="mini-label">Overall</div><div className="mini-val" style={{ color: conf.overall >= .95 ? "#22c55e" : conf.overall >= .8 ? "#f59e0b" : "#ef4444" }}>{pct(conf.overall)}</div></div>
              <div className="mini-stat"><div className="mini-label">Completeness</div><div className="mini-val">{pct(conf.completeness)}</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {(conf.per_field || []).map(f => (
                <div key={f.field} style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.field}>{f.field.replace(/_/g, " ")}</span>
                  <ConfBar value={f.score} height={5} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checks */}
        {tab === "checks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!(val.errors || []).length && !(val.warnings || []).length && (
              <div className="ok-banner"><RiCheckboxCircleLine size={22} /><span>All validation checks passed</span></div>
            )}
            {(val.errors || []).map((e, i) => (
              <div key={i} className="check-row err"><RiAlertFill size={13} style={{ flexShrink: 0 }} />{e}</div>
            ))}
            {val.duplicate_flag && (
              <div className="check-row warn"><RiInformationLine size={13} style={{ flexShrink: 0 }} />Possible duplicate — verify before ERP posting</div>
            )}
            {(val.warnings || []).map((w, i) => (
              <div key={i} className="check-row warn"><RiInformationLine size={13} style={{ flexShrink: 0 }} />{w}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardView({ stats, statsLoading, onUploadResult, onViewInvoice }) {
  const { data: recent, loading: rl } = useApi(`${API}/invoices?limit=6`);

  return (
    <div className="page-content">
      <div className="kpi-grid">
        <KpiCard label="Total Processed" value={stats?.total ?? 0} sub={`${stats?.recent_7_days ?? 0} this week`} icon={RiFileList3Line} accent="#5b7fff" loading={statsLoading} />
        <KpiCard label="Auto Posted" value={stats?.auto_post ?? 0} sub="No review needed" icon={RiFlashlightLine} accent="#22c55e" loading={statsLoading} />
        <KpiCard label="Pending Review" value={(stats?.soft_review ?? 0) + (stats?.manual_review ?? 0)} sub={`${stats?.soft_review ?? 0} soft · ${stats?.manual_review ?? 0} manual`} icon={RiTimeLine} accent="#f59e0b" loading={statsLoading} />
        <KpiCard label="Avg Confidence" value={`${Math.round((stats?.avg_confidence ?? 0) * 100)}%`} sub={`${Math.round((stats?.arithmetic_pass_rate ?? 0) * 100)}% arithmetic pass`} icon={RiBarChartLine} accent="#a855f7" loading={statsLoading} />
      </div>

      <div className="dash-mid">
        <div className="card upload-card">
          <div className="card-title"><RiUploadCloud2Line size={14} style={{ color: "var(--accent)" }} />Process Invoice</div>
          <UploadZone onResult={onUploadResult} />
        </div>
        <div className="card routing-card">
          <div className="card-title"><RiBarChartLine size={14} style={{ color: "var(--accent)" }} />Routing Distribution</div>
          <div className="routing-list">
            {stats && [
              { l: "Auto Post",     v: stats.auto_post,     c: "#22c55e", t: stats.total },
              { l: "Soft Review",   v: stats.soft_review,   c: "#f59e0b", t: stats.total },
              { l: "Manual Review", v: stats.manual_review, c: "#ef4444", t: stats.total },
              { l: "Corrected",     v: stats.corrected,     c: "#3b82f6", t: stats.total },
            ].map(row => (
              <div key={row.l} className="routing-row">
                <span className="routing-label">{row.l}</span>
                <div className="routing-bar-bg">
                  <div className="routing-bar-fill" style={{ width: row.t ? `${(row.v / row.t) * 100}%` : "0%", background: row.c }} />
                </div>
                <span className="routing-count mono" style={{ color: row.c }}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><RiTimeLine size={14} style={{ color: "var(--accent)" }} />Recent Activity</div>
        {rl ? (
          <div style={{ padding: "24px 0", display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : !(recent?.items?.length) ? (
          <div className="empty-state"><RiFileTextLine size={32} /><span>No invoices processed yet</span></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr className="thead-row">{["Invoice #","Vendor","Total","Status","Confidence","Route",""].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{recent.items.map(item => <InvoiceRow key={item._id} item={item} onSelect={onViewInvoice} onDelete={() => {}} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Invoices View ─────────────────────────────────────────────────────────────
function InvoicesView({ onSelect }) {
  const [search, setSearch] = useState("");
  const [routeF, setRouteF] = useState("");
  const [page, setPage] = useState(0);
  const PER = 15;
  const url = `${API}/invoices?limit=${PER}&offset=${page * PER}${routeF ? `&route=${routeF}` : ""}`;
  const { data, loading, refresh } = useApi(url, [routeF, page]);

  const del = async (id) => {
    if (!confirm("Delete this invoice result?")) return;
    await fetch(`${API}/invoice/${id}`, { method: "DELETE" });
    refresh();
  };

  const items = (data?.items || []).filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    const inv = i.invoice || {};
    return (inv.invoice_number || "").toLowerCase().includes(q) || (inv.vendor_name || "").toLowerCase().includes(q);
  });

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}><RiUploadCloud2Line size={14} style={{ color: "var(--accent)" }} />Upload New Invoice</div>
        <UploadZone onResult={onSelect} compact />
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-wrap">
            <RiSearchLine size={13} className="search-icon" />
            <input className="inp search-inp" placeholder="Search invoice # or vendor..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="inp sel" value={routeF} onChange={e => { setRouteF(e.target.value); setPage(0); }}>
            <option value="">All Routes</option>
            <option value="AUTO_POST">Auto Post</option>
            <option value="SOFT_REVIEW">Soft Review</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
            <option value="CORRECTED">Corrected</option>
          </select>
          <button className="ibtn" onClick={refresh} title="Refresh"><RiRefreshLine size={14} /></button>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}><Spinner size={24} /></div>
        ) : !items.length ? (
          <div className="empty-state"><RiFileList3Line size={32} /><span>No invoices found</span></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr className="thead-row">{["Invoice #","Vendor","Total","Status","Confidence","Route","Actions"].map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{items.map(item => <InvoiceRow key={item._id} item={item} onSelect={onSelect} onDelete={del} />)}</tbody>
            </table>
          </div>
        )}

        {data?.total > PER && (
          <div className="pagination">
            <button className="btn-sec sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><RiArrowLeftLine size={13} /> Prev</button>
            <span className="page-info">Page {page + 1} of {Math.ceil(data.total / PER)}</span>
            <button className="btn-sec sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PER >= data.total}>Next <RiArrowRightLine size={13} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vendors View ──────────────────────────────────────────────────────────────
function VendorsView() {
  const { data, loading, refresh } = useApi(`${API}/vendors`);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    await fetch(`${API}/vendor/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setName(""); setAdding(false); refresh();
  };

  return (
    <div className="page-content" style={{ maxWidth: 560 }}>
      <div className="card">
        <div className="card-title"><RiAddLine size={14} style={{ color: "var(--accent)" }} />Register Vendor</div>
        <div className="vendor-add">
          <input className="inp" style={{ flex: 1 }} placeholder="Company name..." value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
          <button className="btn-pri" onClick={add} disabled={adding || !name.trim()}>{adding ? <Spinner size={13} color="white" /> : <RiCheckLine size={13} />} Add</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><RiBuildingLine size={14} style={{ color: "var(--accent)" }} />Registry ({loading ? "…" : data?.vendors?.length ?? 0})</div>
        {loading ? <Spinner /> : (
          <div className="vendor-list">
            {!(data?.vendors?.length) && <div className="empty-state"><RiBuildingLine size={28} /><span>No vendors yet</span></div>}
            {(data?.vendors || []).map((v, i) => (
              <div key={i} className="vendor-row">
                <div className="vendor-dot" />
                <RiBuildingLine size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text)", textTransform: "capitalize", flex: 1 }}>{v}</span>
                <Tag label="Active" color="#22c55e" bg="rgba(34,197,94,.1)" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [dark, setDark] = useState(true);
  const [sideOpen, setSideOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [selected, setSelected] = useState(null);
  const [statsKey, setStatsKey] = useState(0);
  const { data: stats, loading: statsLoading, refresh: refreshStats } = useApi(`${API}/stats`, [statsKey]);

  const NAV = [
    { id: "dashboard", label: "Dashboard",  icon: RiDashboardLine },
    { id: "invoices",  label: "Invoices",   icon: RiFileList3Line },
    { id: "vendors",   label: "Vendors",    icon: RiBuildingLine },
  ];

  const navigate = (id) => { setPage(id); setSelected(null); setMobileNav(false); };
  const handleResult = (r) => { setStatsKey(k => k + 1); setSelected(r); setPage("invoices"); };
  const handleSelect = (item) => setSelected(item);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        :root {
          --font: 'Inter', system-ui, sans-serif;
          --mono: 'JetBrains Mono', 'Courier New', monospace;
          --accent: #5b7fff;
          --accent2: #7c3aed;
          --radius: 12px;
          --radius-sm: 8px;
        }
        .dark {
          --bg: #0c0e14; --surface: #12151e; --surface2: #181c28;
          --border: #1e2235; --border2: #262b40;
          --text: #e6e9f4; --muted: #4e5470; --sidebar: #090b10;
          --topbar: rgba(18,21,30,.9);
        }
        .light {
          --bg: #edf0f7; --surface: #ffffff; --surface2: #f4f6fc;
          --border: #dde1ef; --border2: #c5cade;
          --text: #1a1f35; --muted: #7a82a4; --sidebar: #1a1f35;
          --topbar: rgba(255,255,255,.92);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: .8; } 50% { transform: scale(1.15); opacity: 1; } }
        @keyframes dotBounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }

        /* Layout */
        .layout { display: flex; min-height: 100dvh; background: var(--bg); }
        .sidebar { width: 220px; background: var(--sidebar); border-right: 1px solid rgba(255,255,255,.06); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; position: fixed; top: 0; left: 0; height: 100dvh; z-index: 100; }
        .main { flex: 1; display: flex; flex-direction: column; margin-left: 220px; width: calc(100% - 220px); min-width: 0; transition: margin-left .25s cubic-bezier(.4,0,.2,1); min-height: 100dvh; }
        .main.collapsed { margin-left: 60px; width: calc(100% - 60px); }

        /* Topbar — hamburger always LEFT, title always LEFT */
        .topbar { height: 58px; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 20px; gap: 12px; background: var(--topbar); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 50; flex-shrink: 0; }
        .topbar-menu { flex-shrink: 0; }
        @media (min-width: 768px) { .topbar-menu { display: none; } }
        .topbar-title { font-size: 15px; font-weight: 700; color: var(--text); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .topbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        /* Sidebar logo */
        .logo { padding: 16px 14px 14px; border-bottom: 1px solid rgba(255,255,255,.06); display: flex; align-items: center; gap: 10px; min-height: 58px; }
        .logo-icon { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg,var(--accent),var(--accent2)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 14px rgba(91,127,255,.35); }
        .logo-text { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; opacity: 1; transition: opacity .2s; }
        .sidebar.collapsed .logo-text { opacity: 0; pointer-events: none; width: 0; overflow: hidden; }

        /* Nav */
        .nav { padding: 12px 8px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .nav-btn { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--muted); transition: all .15s; border: none; background: none; width: 100%; font-family: var(--font); white-space: nowrap; }
        .nav-btn:hover { background: rgba(91,127,255,.1); color: var(--text); }
        .nav-btn.active { background: rgba(91,127,255,.16); color: var(--accent); }
        .nav-btn .nav-label { transition: opacity .2s; }
        .sidebar.collapsed .nav-label { opacity: 0; pointer-events: none; width: 0; overflow: hidden; }
        .sidebar-foot { padding: 10px 8px; border-top: 1px solid rgba(255,255,255,.05); }

        /* Mobile overlay */
        .mob-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 99; backdrop-filter: blur(2px); }

        /* Page */
        .page-wrap { flex: 1; overflow: auto; padding: 20px 24px; display: flex; gap: 16px; align-items: flex-start; min-width: 0; }
        .page-content { flex: 1; min-width: 0; max-width: 100%; display: flex; flex-direction: column; gap: 16px; animation: fadeUp .3s ease; }

        /* KPI grid */
        .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
        .kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; display: flex; flex-direction: column; gap: 10px; position: relative; overflow: hidden; transition: transform .2s, box-shadow .2s; cursor: default; }
        .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.18); }
        .kpi-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .kpi-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; }
        .kpi-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
        .kpi-value { font-size: 28px; font-weight: 700; font-family: var(--mono); line-height: 1; }
        .kpi-sub { font-size: 11px; color: var(--muted); }
        .kpi-glow { position: absolute; inset: 0; pointer-events: none; opacity: .6; }

        /* Dash mid */
        .dash-mid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 14px; }
        .upload-card { display: flex; flex-direction: column; gap: 12px; }
        .routing-card { display: flex; flex-direction: column; gap: 14px; }
        .routing-list { display: flex; flex-direction: column; gap: 10px; }
        .routing-row { display: grid; grid-template-columns: 110px 1fr 32px; align-items: center; gap: 10px; }
        .routing-label { font-size: 12px; color: var(--muted); font-weight: 500; }
        .routing-bar-bg { height: 7px; background: var(--border); border-radius: 99px; overflow: hidden; }
        .routing-bar-fill { height: 100%; border-radius: 99px; transition: width .9s cubic-bezier(.4,0,.2,1); }
        .routing-count { font-size: 13px; font-weight: 700; text-align: right; }

        /* Card */
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }
        .card-title { font-size: 13px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 7px; margin-bottom: 14px; }

        /* Table */
        .tbl { width: 100%; border-collapse: collapse; }
        .thead-row { background: var(--surface2); }
        .th { padding: 9px 14px; text-align: left; font-size: 10.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; white-space: nowrap; }
        .trow { cursor: pointer; border-bottom: 1px solid var(--border); transition: background .1s; }
        .trow:last-child { border-bottom: none; }
        .trow:hover { background: var(--surface2); }
        .trow-alt { background: var(--surface2); border-bottom: 1px solid var(--border); }
        .trow-plain { border-bottom: 1px solid var(--border); }
        .trow-total { background: var(--surface2); border-top: 2px solid var(--border); }
        .td { padding: 11px 14px; vertical-align: middle; }
        .td-sm { padding: 8px 10px; font-size: 12px; }
        .tr { text-align: right; }
        .tc { text-align: center; }
        .mono { font-family: var(--mono); }
        .fw7 { font-weight: 700; }
        .accent { color: var(--accent); }

        /* Upload */
        .upload-zone { border: 2px dashed var(--border2); border-radius: var(--radius); padding: 28px 20px; cursor: pointer; transition: all .2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 140px; }
        .upload-zone:hover, .upload-zone.drag { border-color: var(--accent); background: rgba(91,127,255,.04); }
        .upload-zone.compact { min-height: 80px; padding: 16px; }
        .upload-icon-wrap { width: 50px; height: 50px; border-radius: 14px; background: rgba(91,127,255,.1); display: flex; align-items: center; justify-content: center; }
        .upload-zone.compact .upload-icon-wrap { width: 36px; height: 36px; border-radius: 9px; }
        .upload-idle { display: flex; align-items: center; gap: 14px; }
        .upload-zone.compact .upload-idle { flex-direction: row; gap: 12px; }
        .upload-title { font-size: 14px; font-weight: 600; color: var(--text); }
        .upload-zone.compact .upload-title { font-size: 13px; }
        .upload-hint { font-size: 11px; color: var(--muted); margin-top: 3px; }
        .upload-busy { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .upload-pulse { animation: pulse 1.4s ease-in-out infinite; }
        .upload-step { font-size: 13px; color: var(--muted); font-weight: 500; }
        .upload-dots { display: flex; gap: 4px; }
        .upload-dots span { width: 5px; height: 5px; border-radius: 99px; background: var(--accent); animation: dotBounce 1.2s ease-in-out infinite; }
        .upload-dots span:nth-child(2) { animation-delay: .2s; }
        .upload-dots span:nth-child(3) { animation-delay: .4s; }
        .upload-err { font-size: 12px; color: #ef4444; text-align: center; margin-top: 4px; }

        /* Inputs */
        .inp { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; color: var(--text); font-family: var(--font); width: 100%; outline: none; transition: border-color .15s; }
        .inp:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(91,127,255,.12); }
        .sel { width: auto; cursor: pointer; min-width: 145px; }

        /* Buttons */
        .btn-pri { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font); transition: opacity .15s, transform .1s; }
        .btn-pri:hover { opacity: .88; transform: translateY(-1px); }
        .btn-pri:active { transform: none; }
        .btn-pri:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .btn-sec { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; font-family: var(--font); transition: all .15s; }
        .btn-sec:hover { border-color: var(--accent); color: var(--accent); }
        .btn-sec:disabled { opacity: .5; cursor: not-allowed; }
        .btn-sec.sm { padding: 6px 12px; font-size: 12px; }
        .ibtn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; color: var(--muted); transition: all .15s; flex-shrink: 0; }
        .ibtn:hover { border-color: var(--accent); color: var(--accent); background: rgba(91,127,255,.08); }
        .ibtn.red:hover { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,.08); }

        /* Toolbar */
        .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
        .search-wrap { position: relative; flex: 1; min-width: 160px; }
        .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
        .search-inp { padding-left: 30px; }
        .pagination { display: flex; align-items: center; gap: 10px; justify-content: center; padding-top: 14px; border-top: 1px solid var(--border); margin-top: 4px; }
        .page-info { font-size: 12px; color: var(--muted); }

        /* Detail panel */
        .detail { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; animation: slideIn .25s ease; width: 100%; }
        .detail-hdr { display: flex; gap: 10px; align-items: flex-start; }
        .detail-fname { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--text); max-width: 100%; }
        .tabs { display: flex; gap: 1px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
        .tab { padding: 7px 12px; font-size: 12px; font-weight: 500; color: var(--muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: var(--font); transition: all .15s; white-space: nowrap; }
        .tab:hover { color: var(--text); }
        .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }
        .tab-body { min-height: 120px; }

        /* Fields grid */
        .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-radius: 10px; overflow: hidden; }
        .field-cell { background: var(--surface); padding: 9px 12px; display: flex; flex-direction: column; gap: 2px; transition: background .1s; }
        .field-cell:hover { background: var(--surface2); }
        .field-cell.highlight { grid-column: 1/-1; background: rgba(91,127,255,.06); }
        .field-key { font-size: 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
        .field-val { font-size: 13px; color: var(--text); font-weight: 500; }
        .field-val.total { font-size: 15px; font-weight: 700; color: var(--accent); font-family: var(--mono); }
        .field-val.empty { color: var(--border2); }
        .edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .field-edit { display: flex; flex-direction: column; gap: 4px; }
        .field-lbl { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }

        /* Mini stats */
        .mini-stat { background: var(--surface2); border-radius: 9px; padding: 10px 14px; }
        .mini-label { font-size: 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .mini-val { font-size: 20px; font-weight: 700; font-family: var(--mono); color: var(--text); }

        /* Check rows */
        .check-row { padding: 9px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; }
        .check-row.err { background: rgba(239,68,68,.1); color: #ef4444; border-left: 3px solid #ef4444; }
        .check-row.warn { background: rgba(245,158,11,.1); color: #f59e0b; border-left: 3px solid #f59e0b; }
        .ok-banner { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: #22c55e; font-size: 13px; font-weight: 600; }

        /* Empty state */
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; color: var(--muted); font-size: 13px; }

        /* Vendor */
        .vendor-add { display: flex; gap: 8px; }
        .vendor-list { display: flex; flex-direction: column; gap: 6px; }
        .vendor-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--surface2); border-radius: 9px; transition: background .1s; border: 1px solid transparent; }
        .vendor-row:hover { border-color: var(--border); }
        .vendor-dot { width: 7px; height: 7px; border-radius: 99px; background: #22c55e; flex-shrink: 0; box-shadow: 0 0 6px rgba(34,197,94,.5); }

        /* Responsive */
        /* Desktop & Laptop (>=768px): sidebar always visible, no hamburger */
        @media (min-width: 1280px) {
          .kpi-grid { grid-template-columns: repeat(4, 1fr); }
          .dash-mid { grid-template-columns: 1fr 1.5fr; }
          .page-wrap { padding: 24px; gap: 20px; }
        }
        @media (min-width: 900px) and (max-width: 1279px) {
          .kpi-grid { grid-template-columns: repeat(4, 1fr); }
          .kpi-value { font-size: 22px; }
          .dash-mid { grid-template-columns: 1fr 1.4fr; }
          .page-wrap { padding: 20px; gap: 16px; }
        }
        @media (min-width: 768px) and (max-width: 899px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .dash-mid { grid-template-columns: 1fr; }
          .page-wrap { padding: 16px; gap: 14px; }
        }
        /* Mobile <768: slide-in overlay sidebar */
        @media (max-width: 767px) {
          .sidebar { transform: translateX(-100%); transition: transform .25s cubic-bezier(.4,0,.2,1); width: 220px !important; }
          .sidebar.mobile-open { transform: translateX(0); }
          .main { margin-left: 0 !important; width: 100% !important; }
          .mob-overlay { display: block; }
          .kpi-grid { grid-template-columns: 1fr 1fr; }
          .dash-mid { grid-template-columns: 1fr; }
          .page-wrap { flex-direction: column; padding: 12px; gap: 12px; }
          .detail-wrap { width: 100% !important; position: static !important; max-height: none !important; }
          .fields-grid { grid-template-columns: 1fr; }
          .edit-grid { grid-template-columns: 1fr; }
          .routing-row { grid-template-columns: 90px 1fr 28px; }
          .toolbar { flex-direction: column; align-items: stretch; }
          .search-wrap { min-width: unset; }
          .sel { width: 100%; }
          .hide-xs { display: none; }
          .topbar { padding: 0 12px; }
          .card { padding: 14px; }
        }
        @media (max-width: 480px) {
          .kpi-grid { grid-template-columns: 1fr; }
          .kpi-value { font-size: 20px; }
          .page-wrap { padding: 10px; gap: 10px; }
        }
      `}</style>

      <div className={dark ? "dark" : "light"}>
        {/* Mobile overlay */}
        {mobileNav && <div className="mob-overlay" onClick={() => setMobileNav(false)} />}

        <div className="layout">
          {/* Sidebar */}
          <aside className={`sidebar${!sideOpen ? " collapsed" : ""}${mobileNav ? " mobile-open" : ""}`}>
            <div className="logo">
              <div className="logo-icon"><RiFileTextLine size={16} style={{ color: "#fff" }} /></div>
              <span className="logo-text">Invoice RPA</span>
            </div>
            <nav className="nav">
              {NAV.map(n => {
                const Icon = n.icon;
                return (
                  <button key={n.id} className={`nav-btn${page === n.id ? " active" : ""}`} onClick={() => navigate(n.id)}>
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    <span className="nav-label">{n.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-foot">
              <button className="nav-btn" onClick={() => setDark(d => !d)}>
                {dark ? <RiSunLine size={16} style={{ flexShrink: 0 }} /> : <RiMoonLine size={16} style={{ flexShrink: 0 }} />}
                <span className="nav-label">{dark ? "Light mode" : "Dark mode"}</span>
              </button>
            </div>
          </aside>

          {/* Main */}
          <div className={`main${!sideOpen ? " collapsed" : ""}`}>
            {/* Topbar */}
            <header className="topbar">
              <button className="ibtn topbar-menu" onClick={() => { if (window.innerWidth < 768) setMobileNav(o => !o); else setSideOpen(o => !o); }}>
                <RiMenuLine size={15} />
              </button>
              <span className="topbar-title">
                {page === "dashboard" && "Dashboard"}
                {page === "invoices" && "Invoices"}
                {page === "vendors" && "Vendor Registry"}
              </span>
              <div className="topbar-actions">
                <button className="btn-pri" style={{ fontSize: 12 }} onClick={() => navigate("invoices")}>
                  <RiUploadCloud2Line size={13} /><span className="hide-xs">Upload Invoice</span>
                </button>
              </div>
            </header>

            {/* Content */}
            <div className="page-wrap">
              <div className="page-content" style={{ flex: 1, minWidth: 0 }}>
                {page === "dashboard" && <DashboardView stats={stats} statsLoading={statsLoading} onUploadResult={handleResult} onViewInvoice={handleSelect} />}
                {page === "invoices" && <InvoicesView onSelect={handleSelect} />}
                {page === "vendors" && <VendorsView />}
              </div>

              {/* Detail panel */}
              {selected && (
                <div className="detail-wrap" style={{ width: 460, flexShrink: 0, position: "sticky", top: 0, maxHeight: "calc(100dvh - 58px)", overflowY: "auto" }}>
                  <DetailPanel item={selected} onClose={() => setSelected(null)} onRefresh={() => setStatsKey(k => k + 1)} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}