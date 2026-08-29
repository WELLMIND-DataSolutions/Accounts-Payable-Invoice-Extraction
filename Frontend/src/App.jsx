/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   INVOICE RPA DASHBOARD  v4  —  Full Feature Frontend                   ║
 * ║   Pure CSS-in-JS · React 18 · No Tailwind required                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * NEW IN v4 (all backed by new API endpoints):
 *  ✅ Review Queue page     — pending SOFT+MANUAL invoices, priority sorted
 *  ✅ Approve / Reject      — HITL workflow buttons in detail panel + review queue
 *  ✅ ERP Submission        — "Post to ERP" button with system selector modal
 *  ✅ ERP Status badge      — shows MOCK/ODOO/QB ref-id in detail panel
 *  ✅ Audit Log page        — full paginated audit trail with filters
 *  ✅ Feedback Summary      — AI correction stats card on dashboard
 *  ✅ PDF Viewer            — original file iframe in detail panel (new "File" tab)
 *  ✅ Detailed Health       — live health indicator in topbar
 *  ✅ Extended KPIs         — approved + rejected + ERP posted counts
 *  ✅ Enhanced ROUTE_META   — APPROVED / REJECTED / ERP_POSTED badges
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RiDashboardLine, RiFileList3Line, RiUploadCloud2Line, RiCheckboxCircleLine,
  RiTimeLine, RiAlertLine, RiSearchLine, RiRefreshLine, RiArrowRightLine,
  RiArrowLeftLine, RiDeleteBin6Line, RiEdit2Line, RiCheckLine, RiCloseLine,
  RiBuildingLine, RiAddLine, RiBarChartLine, RiArrowUpLine, RiArrowDownLine,
  RiFileTextLine, RiMenuLine, RiMoonLine, RiSunLine, RiLoader4Line,
  RiFlashlightLine, RiEyeLine, RiShieldCheckLine, RiArrowGoBackLine,
  RiAlertFill, RiCheckFill, RiInformationLine, RiPieChartLine,
  RiArrowLeftSLine, RiArrowRightSLine, RiHistoryLine, RiUserLine,
  RiSendPlaneLine, RiServerLine, RiThumbUpLine, RiThumbDownLine,
  RiExternalLinkLine, RiFilter3Line, RiClockwiseLine, RiHeartPulseLine,
  RiErrorWarningLine, RiSpeedLine,
} from "@remixicon/react";

const API = "http://localhost:8000/api";

/* ─── Formatters ──────────────────────────────────────────────────────────── */
const fmt     = (n, cur = "PKR") => n == null ? "—" : `${cur} ${Number(n).toLocaleString("en-PK",{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const pct     = (n) => n == null ? "—" : `${(n*100).toFixed(1)}%`;
const fmtDate = (s) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("en-PK",{day:"2-digit",month:"short",year:"numeric"}); } catch { return s; } };
const fmtTime = (s) => { if (!s) return "—"; try { return new Date(s).toLocaleTimeString("en-PK",{hour:"2-digit",minute:"2-digit",hour12:true}); } catch { return s; } };

/* ─── Color tokens ────────────────────────────────────────────────────────── */
const C = {
  indigo:  { solid:"#6366f1", bg:"rgba(99,102,241,.12)",  border:"rgba(99,102,241,.25)"  },
  emerald: { solid:"#22c55e", bg:"rgba(34,197,94,.12)",   border:"rgba(34,197,94,.25)"   },
  amber:   { solid:"#f59e0b", bg:"rgba(245,158,11,.12)",  border:"rgba(245,158,11,.25)"  },
  violet:  { solid:"#a855f7", bg:"rgba(168,85,247,.12)",  border:"rgba(168,85,247,.25)"  },
  rose:    { solid:"#f43f5e", bg:"rgba(244,63,94,.12)",   border:"rgba(244,63,94,.25)"   },
  blue:    { solid:"#3b82f6", bg:"rgba(59,130,246,.12)",  border:"rgba(59,130,246,.25)"  },
  cyan:    { solid:"#06b6d4", bg:"rgba(6,182,212,.12)",   border:"rgba(6,182,212,.25)"   },
  slate:   { solid:"#64748b", bg:"rgba(100,116,139,.12)", border:"rgba(100,116,139,.25)" },
};

/* ─── Route meta — extended with new states ──────────────────────────────── */
const ROUTE_META = {
  AUTO_POST:     { label:"Auto Post",     color:C.emerald.solid, bg:C.emerald.bg, icon:RiFlashlightLine   },
  SOFT_REVIEW:   { label:"Soft Review",   color:C.amber.solid,   bg:C.amber.bg,   icon:RiEyeLine          },
  MANUAL_REVIEW: { label:"Manual Review", color:C.rose.solid,    bg:C.rose.bg,    icon:RiAlertLine        },
  CORRECTED:     { label:"Corrected",     color:C.blue.solid,    bg:C.blue.bg,    icon:RiEdit2Line        },
  APPROVED:      { label:"Approved",      color:C.emerald.solid, bg:C.emerald.bg, icon:RiCheckLine        },
  REJECTED:      { label:"Rejected",      color:C.rose.solid,    bg:C.rose.bg,    icon:RiCloseLine        },
  ERP_POSTED:    { label:"ERP Posted",    color:C.cyan.solid,    bg:C.cyan.bg,    icon:RiServerLine       },
};
const STATUS_META = {
  SUCCESS: { label:"Success", color:C.emerald.solid, bg:C.emerald.bg },
  PARTIAL: { label:"Partial", color:C.amber.solid,   bg:C.amber.bg   },
  FAILED:  { label:"Failed",  color:C.rose.solid,    bg:C.rose.bg    },
};
const ACTION_META = {
  invoice_uploaded:   { label:"Uploaded",   color:C.indigo.solid,  bg:C.indigo.bg,  icon:RiUploadCloud2Line },
  invoice_corrected:  { label:"Corrected",  color:C.blue.solid,    bg:C.blue.bg,    icon:RiEdit2Line        },
  invoice_approved:   { label:"Approved",   color:C.emerald.solid, bg:C.emerald.bg, icon:RiCheckLine        },
  invoice_rejected:   { label:"Rejected",   color:C.rose.solid,    bg:C.rose.bg,    icon:RiCloseLine        },
  invoice_deleted:    { label:"Deleted",    color:C.slate.solid,   bg:C.slate.bg,   icon:RiDeleteBin6Line   },
  erp_submission:     { label:"ERP Post",   color:C.cyan.solid,    bg:C.cyan.bg,    icon:RiServerLine       },
  vendor_registered:  { label:"Vendor",     color:C.violet.solid,  bg:C.violet.bg,  icon:RiBuildingLine     },
};

/* ══════════════════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════════════════ */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');

  @keyframes rpa-spin    { to { transform: rotate(360deg); } }
  @keyframes rpa-fadeUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  @keyframes rpa-slideIn { from { opacity:0; transform:translateX(14px); } to { opacity:1; transform:none; } }
  @keyframes rpa-pulse   { 0%,100%{transform:scale(1);opacity:.8;} 50%{transform:scale(1.1);opacity:1;} }
  @keyframes rpa-dot     { 0%,80%,100%{transform:translateY(0);} 40%{transform:translateY(-5px);} }
  @keyframes rpa-shimmer { from{left:-100%} to{left:100%} }

  #rpa-root {
    display: flex; height: 100vh; width: 100vw; overflow: hidden;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 14px; line-height: 1.5; color: var(--text);
  }
  [data-theme="dark"]  { color-scheme: dark; }
  [data-theme="light"] { color-scheme: light; }
  #rpa-root[data-theme="dark"] {
    --bg:#080b10; --surface:#0f1117; --surface2:#141720; --surface3:#1a1e2a;
    --border:rgba(255,255,255,.07); --border2:rgba(255,255,255,.13);
    --text:#e8eaf6; --text2:#9399b2; --muted:#4a5070;
    --sidebar:#060810; --topbar:rgba(8,11,16,.85);
  }
  #rpa-root[data-theme="light"] {
    --bg:#f0f2f8; --surface:#ffffff; --surface2:#f7f8fc; --surface3:#eef0f8;
    --border:rgba(0,0,0,.08); --border2:rgba(0,0,0,.15);
    --text:#0d0f1e; --text2:#5a6285; --muted:#8892b0;
    --sidebar:#0d1020; --topbar:rgba(240,242,248,.88);
  }

  /* ── Sidebar ── */
  #rpa-sidebar {
    width:256px; min-width:256px; flex-shrink:0;
    background:var(--sidebar); border-right:1px solid rgba(255,255,255,.06);
    display:flex; flex-direction:column; height:100%; overflow:hidden;
    transition:width .25s cubic-bezier(.4,0,.2,1),min-width .25s;
    position:relative; z-index:100;
  }
  #rpa-sidebar.collapsed { width:68px; min-width:68px; }
  @media (max-width:767px) {
    #rpa-sidebar { position:fixed; top:0; left:0; height:100vh; transform:translateX(-100%);
      transition:transform .25s cubic-bezier(.4,0,.2,1); z-index:200;
      width:256px !important; min-width:256px !important; }
    #rpa-sidebar.mobile-open { transform:translateX(0); }
    #rpa-overlay { display:block !important; }
  }
  #rpa-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.55); backdrop-filter:blur(3px); z-index:150; }

  .rpa-logo { display:flex; align-items:center; gap:12px; padding:16px 14px; border-bottom:1px solid rgba(255,255,255,.06); min-height:62px; overflow:hidden; }
  .rpa-logo-icon { width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,#6366f1,#a855f7); display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 4px 14px rgba(99,102,241,.4); }
  .rpa-logo-text-wrap { overflow:hidden; transition:opacity .2s,width .25s; white-space:nowrap; }
  #rpa-sidebar.collapsed .rpa-logo-text-wrap { opacity:0; width:0; }
  .rpa-logo-name { font-size:14px; font-weight:800; color:#fff; }
  .rpa-logo-sub  { font-size:10px; font-weight:600; color:rgba(255,255,255,.3); letter-spacing:.08em; text-transform:uppercase; margin-top:1px; }

  .rpa-nav { flex:1; padding:10px 8px; display:flex; flex-direction:column; gap:3px; overflow-y:auto; }
  .rpa-nav-btn {
    display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:10px;
    border:none; background:none; cursor:pointer; font-family:inherit; font-size:13.5px; font-weight:600;
    color:rgba(255,255,255,.32); transition:background .15s,color .15s;
    white-space:nowrap; overflow:hidden; text-align:left; width:100%; position:relative;
  }
  .rpa-nav-btn:hover  { background:rgba(99,102,241,.1); color:rgba(255,255,255,.75); }
  .rpa-nav-btn.active { background:rgba(99,102,241,.18); color:#fff; box-shadow:inset 0 0 0 1px rgba(99,102,241,.28); }
  .rpa-nav-label { transition:opacity .2s; flex:1; }
  .rpa-nav-dot   { width:5px; height:5px; border-radius:50%; background:#6366f1; flex-shrink:0; opacity:0; }
  .rpa-nav-badge { background:rgba(244,63,94,.9); color:#fff; font-size:10px; font-weight:800; min-width:18px; height:18px; border-radius:99px; display:inline-flex; align-items:center; justify-content:center; padding:0 5px; flex-shrink:0; }
  .rpa-nav-btn.active .rpa-nav-dot { opacity:1; }
  #rpa-sidebar.collapsed .rpa-nav-label { opacity:0; width:0; overflow:hidden; }
  #rpa-sidebar.collapsed .rpa-nav-dot   { display:none; }
  #rpa-sidebar.collapsed .rpa-nav-badge { display:none; }
  #rpa-sidebar.collapsed .rpa-nav-btn   { justify-content:center; padding:10px 0; }

  .rpa-side-foot { padding:8px; border-top:1px solid rgba(255,255,255,.05); display:flex; flex-direction:column; gap:2px; }
  .rpa-side-foot-btn {
    display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px;
    border:none; background:none; cursor:pointer; font-family:inherit; font-size:13px; font-weight:500;
    color:rgba(255,255,255,.28); transition:background .15s,color .15s;
    white-space:nowrap; overflow:hidden; width:100%; text-align:left;
  }
  .rpa-side-foot-btn:hover { background:rgba(255,255,255,.05); color:rgba(255,255,255,.6); }
  #rpa-sidebar.collapsed .rpa-side-foot-btn { justify-content:center; padding:9px 0; }
  #rpa-sidebar.collapsed .rpa-foot-label { opacity:0; width:0; overflow:hidden; }

  /* ── Main ── */
  #rpa-main { flex:1; min-width:0; display:flex; flex-direction:column; height:100%; overflow:hidden; background:var(--bg); transition:background .2s; }
  #rpa-topbar {
    flex-shrink:0; height:62px; display:flex; align-items:center; gap:12px; padding:0 28px;
    background:var(--topbar); backdrop-filter:blur(12px); border-bottom:1px solid var(--border);
    position:sticky; top:0; z-index:50;
  }
  @media (max-width:767px) { #rpa-topbar { padding:0 16px; } }
  #rpa-topbar-title { flex:1; font-size:16px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rpa-mobile-menu-btn { display:none !important; }
  @media (max-width:767px) { .rpa-mobile-menu-btn { display:flex !important; } }

  /* Health dot in topbar */
  .rpa-health-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .rpa-health-dot.ok       { background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,.6); }
  .rpa-health-dot.degraded { background:#f59e0b; box-shadow:0 0 6px rgba(245,158,11,.6); }
  .rpa-health-dot.error    { background:#f43f5e; box-shadow:0 0 6px rgba(244,63,94,.6); }

  #rpa-scroll { flex:1; overflow-y:auto; overflow-x:hidden; }
  #rpa-scroll::-webkit-scrollbar { width:5px; }
  #rpa-scroll::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }
  #rpa-content { display:flex; gap:24px; align-items:flex-start; padding:28px 32px; width:100%; }
  @media (max-width:1023px) { #rpa-content { padding:20px; } }
  @media (max-width:767px)  { #rpa-content { padding:14px; flex-direction:column; } }

  .rpa-page { flex:1; min-width:0; display:flex; flex-direction:column; gap:20px; animation:rpa-fadeUp .3s ease; }

  /* ── Grids ── */
  .rpa-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; width:100%; }
  @media (max-width:1279px) { .rpa-kpi-grid { grid-template-columns:repeat(2,1fr); } }
  @media (max-width:480px)  { .rpa-kpi-grid { grid-template-columns:1fr; } }
  .rpa-mid-grid { display:grid; grid-template-columns:1fr 1.4fr; gap:18px; width:100%; }
  @media (max-width:1023px) { .rpa-mid-grid { grid-template-columns:1fr; } }
  .rpa-kpi-grid-6 { display:grid; grid-template-columns:repeat(6,1fr); gap:14px; width:100%; }
  @media (max-width:1400px) { .rpa-kpi-grid-6 { grid-template-columns:repeat(3,1fr); } }
  @media (max-width:700px)  { .rpa-kpi-grid-6 { grid-template-columns:repeat(2,1fr); } }

  /* ── Card ── */
  .rpa-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px 22px; transition:background .2s,border-color .2s; position:relative; overflow:hidden; color:var(--text); }
  .rpa-card-title { display:flex; align-items:center; gap:10px; font-size:14px; font-weight:700; color:var(--text); margin-bottom:18px; }
  .rpa-card-icon { width:28px; height:28px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:rgba(99,102,241,.12); border:1px solid rgba(99,102,241,.22); }

  /* ── KPI card ── */
  .rpa-kpi-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px 22px; display:flex; flex-direction:column; gap:10px; position:relative; overflow:hidden; cursor:default; transition:transform .2s,box-shadow .2s,border-color .2s,background .2s; color:var(--text); }
  .rpa-kpi-card:hover { transform:translateY(-3px); box-shadow:0 14px 40px rgba(0,0,0,.18); border-color:var(--border2); }
  .rpa-kpi-top  { display:flex; justify-content:space-between; align-items:flex-start; }
  .rpa-kpi-label { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.09em; color:var(--muted); }
  .rpa-kpi-icon-box { width:38px; height:38px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rpa-kpi-value { font-family:'JetBrains Mono',monospace; font-size:30px; font-weight:700; letter-spacing:-.02em; line-height:1; color:var(--text); }
  .rpa-kpi-foot { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .rpa-kpi-trend { display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:600; }
  .rpa-kpi-sub  { font-size:11px; color:var(--muted); font-weight:400; }
  .rpa-kpi-glow { position:absolute; inset:0; pointer-events:none; }

  /* ── Table ── */
  .rpa-table { width:100%; border-collapse:collapse; }
  .rpa-thead tr { background:var(--surface2); }
  .rpa-th { padding:10px 14px; text-align:left; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); white-space:nowrap; }
  .rpa-trow { border-bottom:1px solid var(--border); cursor:pointer; transition:background .1s; color:var(--text); }
  .rpa-trow:last-child { border-bottom:none; }
  .rpa-trow:hover { background:var(--surface2); }
  .rpa-td { padding:12px 14px; vertical-align:middle; color:var(--text); }

  /* ── Progress bar ── */
  .rpa-bar-track { height:6px; background:var(--surface3); border-radius:99px; overflow:hidden; flex:1; }
  .rpa-bar-fill  { height:100%; border-radius:99px; transition:width 1s cubic-bezier(.4,0,.2,1); }

  /* ── Badge / pill ── */
  .rpa-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:99px; font-size:11px; font-weight:700; white-space:nowrap; }
  .rpa-tag   { display:inline-flex; align-items:center; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; }

  /* ── Upload zone ── */
  .rpa-upload { border:2px dashed var(--border2); border-radius:14px; padding:28px 20px; cursor:pointer; transition:border-color .2s,background .2s,box-shadow .2s; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; min-height:148px; text-align:center; }
  .rpa-upload:hover,.rpa-upload.drag { border-color:#6366f1; background:rgba(99,102,241,.04); box-shadow:0 0 0 3px rgba(99,102,241,.1); }
  .rpa-upload.compact { min-height:80px; padding:16px 20px; }
  .rpa-upload-idle { display:flex; align-items:center; gap:16px; }
  .rpa-upload-busy { display:flex; flex-direction:column; align-items:center; gap:12px; }
  .rpa-dot-row { display:flex; gap:5px; }
  .rpa-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#6366f1; }
  .rpa-dot:nth-child(1) { animation:rpa-dot 1.2s ease-in-out infinite; }
  .rpa-dot:nth-child(2) { animation:rpa-dot 1.2s ease-in-out .2s infinite; }
  .rpa-dot:nth-child(3) { animation:rpa-dot 1.2s ease-in-out .4s infinite; }

  /* ── Inputs ── */
  .rpa-input { width:100%; background:var(--surface2); border:1px solid var(--border2); border-radius:10px; padding:9px 13px; font-size:13px; font-family:inherit; color:var(--text); outline:none; transition:border-color .15s,box-shadow .15s; }
  .rpa-input::placeholder { color:var(--muted); }
  .rpa-input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.15); }
  .rpa-select { background:var(--surface2); border:1px solid var(--border2); border-radius:10px; padding:9px 13px; font-size:13px; font-family:inherit; color:var(--text); outline:none; cursor:pointer; transition:border-color .15s; }
  .rpa-select:focus { border-color:#6366f1; }
  .rpa-textarea { width:100%; background:var(--surface2); border:1px solid var(--border2); border-radius:10px; padding:9px 13px; font-size:13px; font-family:inherit; color:var(--text); outline:none; resize:vertical; min-height:72px; transition:border-color .15s; }
  .rpa-textarea:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.15); }

  /* ── Buttons ── */
  .rpa-btn-primary { display:inline-flex; align-items:center; gap:6px; padding:9px 18px; background:#6366f1; color:#fff; border:none; border-radius:10px; font-size:13px; font-weight:700; font-family:inherit; cursor:pointer; transition:opacity .15s,transform .1s,box-shadow .15s; box-shadow:0 4px 14px rgba(99,102,241,.35); white-space:nowrap; flex-shrink:0; }
  .rpa-btn-primary:hover { opacity:.9; transform:translateY(-1px); box-shadow:0 6px 20px rgba(99,102,241,.45); }
  .rpa-btn-primary:active { transform:none; }
  .rpa-btn-primary:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
  .rpa-btn-secondary { display:inline-flex; align-items:center; gap:6px; padding:9px 14px; background:var(--surface2); color:var(--text2); border:1px solid var(--border2); border-radius:10px; font-size:13px; font-weight:600; font-family:inherit; cursor:pointer; transition:border-color .15s,color .15s; white-space:nowrap; }
  .rpa-btn-secondary:hover { border-color:#6366f1; color:#6366f1; }
  .rpa-btn-secondary:disabled { opacity:.4; cursor:not-allowed; }
  .rpa-btn-success { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; background:rgba(34,197,94,.15); color:#22c55e; border:1px solid rgba(34,197,94,.3); border-radius:10px; font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .15s; white-space:nowrap; }
  .rpa-btn-success:hover { background:rgba(34,197,94,.25); }
  .rpa-btn-success:disabled { opacity:.4; cursor:not-allowed; }
  .rpa-btn-danger { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; background:rgba(244,63,94,.12); color:#f43f5e; border:1px solid rgba(244,63,94,.28); border-radius:10px; font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .15s; white-space:nowrap; }
  .rpa-btn-danger:hover { background:rgba(244,63,94,.22); }
  .rpa-btn-danger:disabled { opacity:.4; cursor:not-allowed; }
  .rpa-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:var(--surface2); border:1px solid var(--border); border-radius:9px; cursor:pointer; color:var(--muted); flex-shrink:0; transition:border-color .15s,color .15s,background .15s; }
  .rpa-icon-btn:hover     { border-color:#6366f1; color:#6366f1; background:rgba(99,102,241,.08); }
  .rpa-icon-btn.red:hover { border-color:#f43f5e; color:#f43f5e; background:rgba(244,63,94,.08); }

  /* ── Detail panel ── */
  .rpa-detail { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px; animation:rpa-slideIn .25s ease; width:480px; flex-shrink:0; position:sticky; top:0; max-height:calc(100vh - 62px); overflow-y:auto; color:var(--text); }
  .rpa-detail::-webkit-scrollbar { width:4px; }
  .rpa-detail::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }
  @media (max-width:1100px) { .rpa-detail { width:100%; position:static; max-height:none; } }

  /* ── Tabs ── */
  .rpa-tabs { display:flex; border-bottom:1px solid var(--border); margin-bottom:16px; overflow-x:auto; }
  .rpa-tabs::-webkit-scrollbar { display:none; }
  .rpa-tab { padding:8px 12px; font-size:12.5px; font-weight:600; color:var(--muted); background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; font-family:inherit; transition:color .15s,border-color .15s; white-space:nowrap; -webkit-text-fill-color: inherit; }
  .rpa-tab:hover  { color:var(--text); }
  .rpa-tab.active { color:#6366f1; border-bottom-color:#6366f1; }

  /* ── Fields ── */
  .rpa-fields-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); border-radius:12px; overflow:hidden; }
  @media (max-width:400px) { .rpa-fields-grid { grid-template-columns:1fr; } }
  .rpa-field-cell { background:var(--surface); padding:9px 12px; display:flex; flex-direction:column; gap:3px; transition:background .1s; color:var(--text); }
  .rpa-field-cell:hover    { background:var(--surface2); }
  .rpa-field-cell.full-col { grid-column:1/-1; background:rgba(99,102,241,.05); }
  .rpa-field-key { font-size:10px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .rpa-field-val { font-size:13px; color:var(--text); font-weight:500; }
  .rpa-field-val.total { font-size:15px; font-weight:800; color:#6366f1; font-family:'JetBrains Mono',monospace; }
  .rpa-field-val.empty { color:var(--muted); opacity:.4; }
  .rpa-edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media (max-width:400px) { .rpa-edit-grid { grid-template-columns:1fr; } }

  /* ── Mini stat ── */
  .rpa-mini-stat { background:var(--surface2); border-radius:10px; padding:11px 14px; }
  .rpa-mini-label { font-size:10px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:5px; }
  .rpa-mini-val   { font-size:22px; font-weight:700; font-family:'JetBrains Mono',monospace; color:var(--text); }

  /* ── Misc helpers ── */
  .rpa-vendor-item { display:flex; align-items:center; gap:10px; padding:11px 14px; background:var(--surface2); border-radius:11px; border:1px solid transparent; transition:border-color .15s; color:var(--text); }
  .rpa-vendor-item:hover { border-color:var(--border2); }
  .rpa-empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:40px; color:var(--muted); font-size:13px; font-weight:500; background:transparent; }
  .rpa-spin { animation:rpa-spin .8s linear infinite; display:block; }
  .rpa-anim-pulse { animation:rpa-pulse 1.4s ease-in-out infinite; }
  .rpa-alert { display:flex; align-items:flex-start; gap:8px; padding:9px 12px; border-radius:10px; font-size:12px; font-weight:500; line-height:1.55; border-left:3px solid; }
  .rpa-info-strip { display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:11px; background:var(--surface2); border:1px solid var(--border2); font-size:11.5px; color:var(--muted); line-height:1.55; }
  .rpa-route-banner { padding:10px 14px; border-radius:11px; border-left:3px solid; font-size:12px; font-weight:500; line-height:1.6; margin-bottom:14px; }
  .rpa-search-wrap { position:relative; flex:1; min-width:160px; }
  .rpa-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); pointer-events:none; color:var(--muted); }
  .rpa-search-wrap .rpa-input { padding-left:30px; }
  .rpa-pagination { display:flex; align-items:center; justify-content:center; gap:12px; padding:14px 0 4px; border-top:1px solid var(--border); margin-top:4px; font-size:12px; color:var(--muted); }
  .rpa-li-table { width:100%; font-size:12px; }
  .rpa-li-table th { padding:8px 10px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); background:var(--surface2); }
  .rpa-li-table td { padding:7px 10px; border-bottom:1px solid var(--border); color:var(--text); }
  .rpa-li-table tr:last-child td { border-bottom:none; color:var(--text); }
  .rpa-li-table tr { color:var(--text); }
  .rpa-summary-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:2px; padding-top:14px; margin-top:16px; border-top:1px solid var(--border); }
  .rpa-summary-col { text-align:center; }
  .rpa-summary-num { font-size:20px; font-weight:700; font-family:'JetBrains Mono',monospace; color:var(--text); }
  .rpa-summary-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-top:2px; }
  .rpa-route-row { display:flex; flex-direction:column; gap:7px; }
  .rpa-route-header { display:flex; align-items:center; justify-content:space-between; }
  .rpa-route-left  { display:flex; align-items:center; gap:8px; }
  .rpa-route-dot   { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .rpa-route-name  { font-size:13px; font-weight:600; color:var(--text); }
  .rpa-route-desc  { font-size:11px; color:var(--muted); }
  .rpa-route-right { display:flex; align-items:center; gap:8px; }
  .rpa-route-pct   { font-size:11px; font-weight:600; color:var(--muted); }
  .rpa-route-count { font-size:13px; font-weight:700; font-family:'JetBrains Mono',monospace; color:var(--text2); min-width:22px; text-align:right; }

  /* ── Review queue ── */
  .rpa-review-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; transition:border-color .15s,box-shadow .15s; cursor:pointer; color:var(--text); }
  .rpa-review-card:hover { border-color:var(--border2); box-shadow:0 4px 20px rgba(0,0,0,.1); }
  .rpa-review-card.high { border-left:3px solid #f43f5e; }
  .rpa-review-card.normal { border-left:3px solid #f59e0b; }
  .rpa-priority-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text); }

  /* ── ERP modal ── */
  .rpa-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(4px); z-index:500; display:flex; align-items:center; justify-content:center; padding:20px; }
  .rpa-modal { background:var(--surface); border:1px solid var(--border2); border-radius:20px; padding:28px; width:100%; max-width:420px; animation:rpa-fadeUp .2s ease; color:var(--text); }
  .rpa-modal-title { font-size:16px; font-weight:800; color:var(--text); margin-bottom:4px; }
  .rpa-modal-sub   { font-size:13px; color:var(--muted); margin-bottom:20px; }
  .rpa-erp-option { display:flex; align-items:center; gap:14px; padding:14px 16px; border-radius:12px; border:2px solid var(--border); cursor:pointer; transition:all .15s; margin-bottom:8px; color:var(--text); }
  .rpa-erp-option:hover   { border-color:#6366f1; background:rgba(99,102,241,.05); }
  .rpa-erp-option.selected { border-color:#6366f1; background:rgba(99,102,241,.1); }
  .rpa-erp-icon { width:40px; height:40px; border-radius:11px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rpa-erp-name { font-size:14px; font-weight:700; color:var(--text); }
  .rpa-erp-desc { font-size:11.5px; color:var(--muted); margin-top:1px; }

  /* ── Audit log ── */
  .rpa-audit-row { display:flex; align-items:flex-start; gap:14px; padding:13px 16px; border-bottom:1px solid var(--border); transition:background .1s; color:var(--text); }
  .rpa-audit-row:last-child { border-bottom:none; }
  .rpa-audit-row:hover { background:var(--surface2); }
  .rpa-audit-icon { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rpa-audit-action { font-size:12.5px; font-weight:700; color:var(--text); }
  .rpa-audit-meta   { font-size:11px; color:var(--muted); margin-top:2px; }
  .rpa-audit-detail { font-size:11px; color:var(--text2); margin-top:4px; font-family:'JetBrains Mono',monospace; background:var(--surface2); padding:4px 8px; border-radius:6px; }

  /* ── Reject modal ── */
  .rpa-reject-modal { background:var(--surface); border:1px solid var(--border2); border-radius:16px; padding:22px; width:100%; max-width:380px; animation:rpa-fadeUp .2s ease; color:var(--text); }

  /* ── PDF viewer ── */
  .rpa-pdf-frame { width:100%; height:420px; border:1px solid var(--border); border-radius:10px; background:var(--surface2); }

  /* ── Feedback card ── */
  .rpa-feedback-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); }
  .rpa-feedback-row:last-child { border-bottom:none; }
  .rpa-feedback-field { font-size:12px; font-weight:600; color:var(--text); flex:1; text-transform:capitalize; }
  .rpa-feedback-count { font-size:13px; font-weight:800; font-family:'JetBrains Mono',monospace; color:#6366f1; min-width:28px; text-align:right; }
`;

function injectStyles() {
  if (document.getElementById("rpa-styles")) return;
  const el = document.createElement("style");
  el.id = "rpa-styles";
  el.textContent = STYLES;
  document.head.appendChild(el);
}

/* ══════════════════════════════════════════════════════════════════════════
   DATA HOOK
   ══════════════════════════════════════════════════════════════════════════ */
function useApi(url, deps = []) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
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

/* ══════════════════════════════════════════════════════════════════════════
   PRIMITIVES
   ══════════════════════════════════════════════════════════════════════════ */
function Spinner({ size = 18, color = "#6366f1" }) {
  return <RiLoader4Line size={size} className="rpa-spin" style={{ color, display:"block" }} />;
}
function ConfBar({ value, showLabel = true }) {
  const v   = Math.round((value||0)*100);
  const col = v >= 95 ? C.emerald.solid : v >= 80 ? C.amber.solid : C.rose.solid;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, width:"100%" }}>
      <div className="rpa-bar-track">
        <div className="rpa-bar-fill" style={{ width:`${v}%`, background:col }} />
      </div>
      {showLabel && <span style={{ fontSize:11, fontWeight:700, color:col, minWidth:34, textAlign:"right", fontFamily:"'JetBrains Mono',monospace" }}>{v}%</span>}
    </div>
  );
}
function Badge({ route }) {
  const m = ROUTE_META[route] || ROUTE_META.MANUAL_REVIEW;
  const Icon = m.icon;
  return <span className="rpa-badge" style={{ color:m.color, background:m.bg }}><Icon size={11}/>{m.label}</span>;
}
function Tag({ label, color, bg }) {
  return <span className="rpa-tag" style={{ color, background:bg }}>{label}</span>;
}
function Empty({ icon: Icon = RiFileTextLine, children }) {
  return <div className="rpa-empty"><Icon size={32}/>{children}</div>;
}
function CardTitle({ icon: Icon, children, right }) {
  return (
    <div className="rpa-card-title">
      <div className="rpa-card-icon"><Icon size={14} style={{ color:"#6366f1" }}/></div>
      {children}
      {right && <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted)", fontWeight:500 }}>{right}</span>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   KPI CARD
   ══════════════════════════════════════════════════════════════════════════ */
function KpiCard({ label, value, sub, icon: Icon, color, trendLabel, trendUp, loading }) {
  return (
    <div className="rpa-kpi-card">
      <div className="rpa-kpi-glow" style={{ background:`radial-gradient(circle at 85% 85%, ${color}18, transparent 65%)` }} />
      <div className="rpa-kpi-top">
        <span className="rpa-kpi-label">{label}</span>
        <div className="rpa-kpi-icon-box" style={{ background:`${color}18`, border:`1px solid ${color}30` }}>
          <Icon size={17} style={{ color }} />
        </div>
      </div>
      <div className="rpa-kpi-value">{loading ? <Spinner size={22} color={color}/> : value}</div>
      <div className="rpa-kpi-foot">
        {trendLabel && (
          <span className="rpa-kpi-trend" style={{ color:trendUp ? C.emerald.solid : "var(--muted)" }}>
            {trendUp ? <RiArrowUpLine size={11}/> : <RiArrowDownLine size={11}/>}{trendLabel}
          </span>
        )}
        {sub && <span className="rpa-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   UPLOAD ZONE
   ══════════════════════════════════════════════════════════════════════════ */
function UploadZone({ onResult, compact = false }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err,  setErr]  = useState(null);
  const ref             = useRef();
  const run = async (file) => {
    setBusy(true); setErr(null); setStep("Preprocessing image…");
    const fd = new FormData(); fd.append("file", file);
    try {
      setStep("Running AI extraction…");
      const r = await fetch(`${API}/invoice/process`, { method:"POST", body:fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed");
      setStep("Complete!"); setTimeout(() => { setBusy(false); setStep(""); onResult(d); }, 500);
    } catch (e) { setErr(String(e)); setBusy(false); setStep(""); }
  };
  return (
    <div className={`rpa-upload${drag?" drag":""}${compact?" compact":""}`}
      onClick={() => !busy && ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) run(f); }}>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp"
        onChange={e => { const f = e.target.files[0]; if (f) run(f); }} style={{ display:"none" }} />
      {busy ? (
        <div className="rpa-upload-busy">
          <div className="rpa-anim-pulse" style={{ width:compact?36:50, height:compact?36:50, borderRadius:compact?10:16, background:"rgba(99,102,241,.12)", border:"1px solid rgba(99,102,241,.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <RiUploadCloud2Line size={compact?18:24} style={{ color:"#6366f1" }}/>
          </div>
          <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{step}</span>
          <div className="rpa-dot-row"><span className="rpa-dot"/><span className="rpa-dot"/><span className="rpa-dot"/></div>
        </div>
      ) : (
        <div className="rpa-upload-idle">
          <div style={{ width:compact?38:52, height:compact?38:52, borderRadius:compact?11:16, flexShrink:0, background:"rgba(99,102,241,.1)", border:"1px solid rgba(99,102,241,.22)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <RiUploadCloud2Line size={compact?18:24} style={{ color:"#6366f1" }}/>
          </div>
          <div style={{ textAlign:"left" }}>
            <p style={{ fontSize:compact?13:14, fontWeight:600, color:"var(--text)" }}>{compact ? "Drop or click to upload" : "Drop invoice here, or click to browse"}</p>
            {!compact && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 6px", marginTop:6 }}>
                {["PDF","PNG","JPG","TIFF","BMP","WEBP"].map(t=>(
                  <span key={t} style={{ fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:99, background:"var(--surface3)", color:"var(--muted)", letterSpacing:".04em" }}>{t}</span>
                ))}
                <span style={{ fontSize:10, color:"var(--muted)", alignSelf:"center" }}>· max 50 MB</span>
              </div>
            )}
          </div>
        </div>
      )}
      {err && <p style={{ fontSize:12, color:C.rose.solid, textAlign:"center", padding:"6px 12px", background:C.rose.bg, borderRadius:8, marginTop:4 }}>{err}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ERP SUBMIT MODAL
   ══════════════════════════════════════════════════════════════════════════ */
function ErpModal({ invoiceId, invoiceNum, onClose, onDone }) {
  const [selected, setSelected] = useState("mock");
  const [busy, setBusy]         = useState(false);
  const [result, setResult]     = useState(null);
  const ERP_OPTIONS = [
    { id:"mock",       name:"Mock ERP",    desc:"Demo mode — always succeeds, no credentials needed", color:"#6366f1" },
    { id:"odoo",       name:"Odoo",        desc:"Odoo XML-RPC — requires ODOO_URL + API key in .env",  color:"#a855f7" },
    { id:"quickbooks", name:"QuickBooks",  desc:"QBO REST API — requires QB credentials in .env",       color:"#22c55e" },
    { id:"sap",        name:"SAP",         desc:"SAP stub — placeholder, returns PENDING",               color:"#f59e0b" },
  ];
  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/erp/post/${invoiceId}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ erp_system:selected, submitted_by:"dashboard_user" }) });
      const d = await r.json();
      if (r.status === 409) { setResult({ status:"ALREADY_POSTED", message: d.detail || "Already submitted." }); }
      else { setResult(d); }
    } catch (e) { setResult({ status:"ERROR", message:String(e) }); }
    setBusy(false);
  };
  return (
    <div className="rpa-modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="rpa-modal">
        {result ? (
          <>
            <div className="rpa-modal-title">{result.status === "SUCCESS" ? "✅ Posted to ERP" : result.status === "ALREADY_POSTED" ? "ℹ️ Already Submitted" : result.status === "PENDING" ? "⏳ Pending" : "❌ Failed"}</div>
            <div className="rpa-modal-sub">{result.message}</div>
            {result.erp_ref_id && (
              <div style={{ padding:"10px 14px", background:C.cyan.bg, borderRadius:10, border:`1px solid ${C.cyan.border}`, fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:C.cyan.solid, marginBottom:16 }}>
                Ref: {result.erp_ref_id}
              </div>
            )}
            <button className="rpa-btn-primary" style={{ width:"100%", justifyContent:"center" }} onClick={() => { onDone(); onClose(); }}>Done</button>
          </>
        ) : (
          <>
            <div className="rpa-modal-title">Post to ERP</div>
            <div className="rpa-modal-sub">Select ERP system for invoice {invoiceNum || invoiceId}</div>
            {ERP_OPTIONS.map(opt => (
              <div key={opt.id} className={`rpa-erp-option${selected===opt.id?" selected":""}`} onClick={() => setSelected(opt.id)}>
                <div className="rpa-erp-icon" style={{ background:`${opt.color}18`, border:`1px solid ${opt.color}30` }}>
                  <RiServerLine size={18} style={{ color:opt.color }}/>
                </div>
                <div>
                  <div className="rpa-erp-name">{opt.name}</div>
                  <div className="rpa-erp-desc">{opt.desc}</div>
                </div>
                {selected === opt.id && <RiCheckLine size={16} style={{ color:"#6366f1", marginLeft:"auto", flexShrink:0 }}/>}
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:6 }}>
              <button className="rpa-btn-secondary" style={{ flex:1, justifyContent:"center" }} onClick={onClose}>Cancel</button>
              <button className="rpa-btn-primary"   style={{ flex:2, justifyContent:"center" }} onClick={submit} disabled={busy}>
                {busy ? <Spinner size={13} color="#fff"/> : <RiSendPlaneLine size={13}/>} Submit to {ERP_OPTIONS.find(o=>o.id===selected)?.name}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   REJECT MODAL
   ══════════════════════════════════════════════════════════════════════════ */
function RejectModal({ invoiceId, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy]     = useState(false);
  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await fetch(`${API}/invoice/${invoiceId}/reject`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ rejected_by:"dashboard_user", reason }) });
    setBusy(false); onDone(); onClose();
  };
  return (
    <div className="rpa-modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="rpa-reject-modal">
        <div style={{ fontSize:15, fontWeight:800, color:"var(--text)", marginBottom:4 }}>Reject Invoice</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginBottom:14 }}>Provide a reason for rejection. This is required and saved to the audit trail.</div>
        <textarea className="rpa-textarea" placeholder="e.g. Duplicate invoice, incorrect amount, missing PO number…" value={reason} onChange={e => setReason(e.target.value)} />
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button className="rpa-btn-secondary" style={{ flex:1, justifyContent:"center" }} onClick={onClose}>Cancel</button>
          <button className="rpa-btn-danger"    style={{ flex:2, justifyContent:"center" }} onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? <Spinner size={13} color="#f43f5e"/> : <RiCloseLine size={13}/>} Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   INVOICE TABLE ROW
   ══════════════════════════════════════════════════════════════════════════ */
function InvoiceRow({ item, onSelect, onDelete }) {
  const inv  = item.invoice || {};
  const sm   = STATUS_META[item.meta?.status] || STATUS_META.PARTIAL;
  return (
    <tr className="rpa-trow" onClick={() => onSelect(item)}>
      <td className="rpa-td">
        <div style={{ fontWeight:700, fontSize:12.5, fontFamily:"'JetBrains Mono',monospace", color:"var(--text)" }}>{inv.invoice_number || "—"}</div>
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{fmtDate(item.meta?.processed_at)}</div>
      </td>
      <td className="rpa-td">
        <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{inv.vendor_name || "—"}</div>
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{(inv.vendor_address||"").split(",")[0]}</div>
      </td>
      <td className="rpa-td" style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:13, color:"var(--text)", whiteSpace:"nowrap" }}>{fmt(inv.total_amount,inv.currency)}</td>
      <td className="rpa-td"><Tag label={sm.label} color={sm.color} bg={sm.bg}/></td>
      <td className="rpa-td" style={{ minWidth:110 }}><ConfBar value={item.confidence?.overall}/></td>
      <td className="rpa-td"><Badge route={item.routing?.route}/></td>
      <td className="rpa-td" onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
          <button className="rpa-icon-btn" onClick={() => onSelect(item)}><RiEyeLine size={13}/></button>
          <button className="rpa-icon-btn red" onClick={() => onDelete(item._id)}><RiDeleteBin6Line size={13}/></button>
        </div>
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DETAIL PANEL  — now with Approve/Reject/ERP/File tabs
   ══════════════════════════════════════════════════════════════════════════ */
function DetailPanel({ item, onClose, onRefresh }) {
  const [tab,      setTab]     = useState("fields");
  const [editing,  setEditing] = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [form,     setForm]    = useState({});
  const [approving,setApproving] = useState(false);
  const [showErp,  setShowErp]   = useState(false);
  const [showReject,setShowReject] = useState(false);

  useEffect(() => {
    const inv = item.invoice || {};
    setForm({ vendor_name:inv.vendor_name||"", invoice_number:inv.invoice_number||"", invoice_date:inv.invoice_date||"", due_date:inv.due_date||"", po_number:inv.po_number||"", currency:inv.currency||"", subtotal:inv.subtotal??"", tax_amount:inv.tax_amount??"", discount:inv.discount??"", total_amount:inv.total_amount??"" });
    setTab("fields"); setEditing(false);
  }, [item._id]);

  const save = async () => {
    setSaving(true);
    const payload = { corrected_by:"dashboard_user" };
    const numF = ["subtotal","tax_amount","discount","total_amount"];
    Object.entries(form).forEach(([k,v]) => { if (v!=="") payload[k] = numF.includes(k) ? Number(v) : v; });
    await fetch(`${API}/invoice/${item._id}/correct`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    setSaving(false); setEditing(false); onRefresh();
  };

  const approve = async () => {
    setApproving(true);
    await fetch(`${API}/invoice/${item._id}/approve`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ approved_by:"dashboard_user" }) });
    setApproving(false); onRefresh();
  };

  const inv   = item.invoice || {};
  const conf  = item.confidence || {};
  const val   = item.validation || {};
  const route = item.routing?.route;
  const rm    = ROUTE_META[route] || ROUTE_META.MANUAL_REVIEW;
  const erp   = item._erp_submission;
  const canApprove  = ["SOFT_REVIEW","MANUAL_REVIEW","CORRECTED"].includes(route);
  const canReject   = ["SOFT_REVIEW","MANUAL_REVIEW","CORRECTED"].includes(route);
  const canPostErp  = ["AUTO_POST","APPROVED"].includes(route);

  const TABS = [
    { id:"fields", label:"Fields" },
    { id:"items",  label:`Items (${(inv.line_items||[]).length})` },
    { id:"conf",   label:"Confidence" },
    { id:"checks", label:"Checks" },
    { id:"file",   label:"File" },
    { id:"erp",    label:"ERP" },
  ];

  return (
    <>
      {showErp    && <ErpModal    invoiceId={item._id} invoiceNum={inv.invoice_number} onClose={() => setShowErp(false)}    onDone={onRefresh}/>}
      {showReject && <RejectModal invoiceId={item._id}                                 onClose={() => setShowReject(false)} onDone={onRefresh}/>}

      <div className="rpa-detail">
        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:13, fontWeight:700, color:"var(--text)" }}>
              <RiFileTextLine size={14} style={{ color:"#6366f1", flexShrink:0 }}/>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.meta?.file_name}</span>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
              <Badge route={route}/>
              <Tag label={`${pct(conf.overall)} conf`} color="var(--muted)" bg="var(--surface2)"/>
              <Tag label={fmtDate(item.meta?.processed_at)} color="var(--muted)" bg="var(--surface2)"/>
              {erp?.status==="SUCCESS" && <Tag label={`ERP: ${erp.erp_ref_id}`} color={C.cyan.solid} bg={C.cyan.bg}/>}
            </div>
          </div>
          <button className="rpa-icon-btn" onClick={onClose}><RiCloseLine size={15}/></button>
        </div>

        {/* Route reason banner */}
        <div className="rpa-route-banner" style={{ color:rm.color, background:rm.bg, borderLeftColor:rm.color }}>
          {item.routing?.route_reason}
        </div>

        {/* HITL Action buttons */}
        {(canApprove || canPostErp) && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {canApprove && (
              <>
                <button className="rpa-btn-success" onClick={approve} disabled={approving}>
                  {approving ? <Spinner size={13} color="#22c55e"/> : <RiThumbUpLine size={13}/>} Approve
                </button>
                <button className="rpa-btn-danger" onClick={() => setShowReject(true)}>
                  <RiThumbDownLine size={13}/> Reject
                </button>
              </>
            )}
            {canPostErp && (
              <button className="rpa-btn-primary" style={{ flex:1, justifyContent:"center" }} onClick={() => setShowErp(true)}>
                <RiSendPlaneLine size={13}/> Post to ERP
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="rpa-tabs">
          {TABS.map(t => <button key={t.id} className={`rpa-tab${tab===t.id?" active":""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {/* ── Fields tab ── */}
        {tab==="fields" && (editing ? (
          <div className="rpa-edit-grid">
            {[["vendor_name","Vendor Name"],["invoice_number","Invoice #"],["invoice_date","Invoice Date"],["due_date","Due Date"],["po_number","PO Number"],["currency","Currency"],["subtotal","Subtotal"],["tax_amount","Tax Amount"],["discount","Discount"],["total_amount","Total Amount"]].map(([k,l]) => (
              <div key={k} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <label style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>{l}</label>
                <input className="rpa-input" value={form[k]??""} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}/>
              </div>
            ))}
            <div style={{ gridColumn:"1/-1", display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
              <button className="rpa-btn-secondary" onClick={() => setEditing(false)}><RiArrowGoBackLine size={13}/> Cancel</button>
              <button className="rpa-btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={13} color="#fff"/> : <RiCheckLine size={13}/>} Save</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rpa-fields-grid">
              {[["Vendor",inv.vendor_name],["Address",inv.vendor_address],["Tax ID",inv.vendor_tax_id],["Invoice #",inv.invoice_number],["Date",fmtDate(inv.invoice_date)],["Due Date",fmtDate(inv.due_date)],["PO Number",inv.po_number],["Currency",inv.currency],["Payment Terms",inv.payment_terms],["Subtotal",fmt(inv.subtotal,inv.currency)],["Tax Rate",inv.tax_rate!=null?`${(inv.tax_rate*100).toFixed(1)}%`:"—"],["Tax Amount",fmt(inv.tax_amount,inv.currency)],["Discount",inv.discount?fmt(inv.discount,inv.currency):"—"],["Total Amount",fmt(inv.total_amount,inv.currency)]].map(([k,v]) => (
                <div key={k} className={`rpa-field-cell${k==="Total Amount"?" full-col":""}`}>
                  <span className="rpa-field-key">{k}</span>
                  <span className={`rpa-field-val${k==="Total Amount"?" total":""}${!v||v==="—"?" empty":""}`}>{v||"—"}</span>
                </div>
              ))}
            </div>
            <button className="rpa-btn-secondary" style={{ width:"100%", justifyContent:"center", marginTop:12 }} onClick={() => setEditing(true)}>
              <RiEdit2Line size={13}/> Edit Fields
            </button>
            {item._correction && (
              <div className="rpa-alert" style={{ marginTop:10, color:C.blue.solid, background:C.blue.bg, borderLeftColor:C.blue.solid }}>
                <RiInformationLine size={13} style={{ flexShrink:0 }}/> Corrected by {item._correction.corrected_by} on {fmtDate(item._correction.corrected_at)}
              </div>
            )}
            {item._approval && (
              <div className="rpa-alert" style={{ marginTop:8, color:C.emerald.solid, background:C.emerald.bg, borderLeftColor:C.emerald.solid }}>
                <RiCheckFill size={13} style={{ flexShrink:0 }}/> Approved by {item._approval.approved_by} on {fmtDate(item._approval.approved_at)}
              </div>
            )}
            {item._rejection && (
              <div className="rpa-alert" style={{ marginTop:8, color:C.rose.solid, background:C.rose.bg, borderLeftColor:C.rose.solid }}>
                <RiAlertFill size={13} style={{ flexShrink:0 }}/> Rejected: {item._rejection.reason}
              </div>
            )}
          </>
        ))}

        {/* ── Items tab ── */}
        {tab==="items" && (
          <div>
            {!(inv.line_items||[]).length ? <Empty icon={RiFileTextLine}>No line items</Empty> : (
              <div style={{ overflowX:"auto" }}>
                <table className="rpa-li-table">
                  <thead><tr>{["#","Description","Qty","Unit Price","Amount","✓"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(inv.line_items||[]).map((li,i) => {
                      const ok = Math.abs(li.quantity*li.unit_price - li.amount) < 0.05;
                      return (
                        <tr key={i}>
                          <td style={{ textAlign:"center" }}>{i+1}</td>
                          <td>{li.description}</td>
                          <td style={{ textAlign:"right", fontFamily:"'JetBrains Mono',monospace" }}>{li.quantity}</td>
                          <td style={{ textAlign:"right", fontFamily:"'JetBrains Mono',monospace" }}>{fmt(li.unit_price,inv.currency)}</td>
                          <td style={{ textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{fmt(li.amount,inv.currency)}</td>
                          <td style={{ textAlign:"center" }}>{ok ? <RiCheckFill size={13} style={{color:C.emerald.solid}}/> : <RiAlertFill size={13} style={{color:C.rose.solid}}/>}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={4} style={{ textAlign:"right", fontWeight:700, paddingRight:12 }}>Total</td>
                      <td style={{ textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"#6366f1" }}>{fmt((inv.line_items||[]).reduce((s,li)=>s+li.amount,0),inv.currency)}</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {conf.arithmetic_detail && (
              <div className="rpa-alert" style={{ marginTop:10, color:conf.arithmetic_ok?C.emerald.solid:C.rose.solid, background:conf.arithmetic_ok?C.emerald.bg:C.rose.bg, borderLeftColor:conf.arithmetic_ok?C.emerald.solid:C.rose.solid }}>
                {conf.arithmetic_ok ? <RiCheckFill size={13} style={{flexShrink:0,marginTop:1}}/> : <RiAlertFill size={13} style={{flexShrink:0,marginTop:1}}/>}
                {conf.arithmetic_detail}
              </div>
            )}
          </div>
        )}

        {/* ── Confidence tab ── */}
        {tab==="conf" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              <div className="rpa-mini-stat">
                <div className="rpa-mini-label">Overall</div>
                <div className="rpa-mini-val" style={{ color:conf.overall>=.95?C.emerald.solid:conf.overall>=.8?C.amber.solid:C.rose.solid }}>{pct(conf.overall)}</div>
              </div>
              <div className="rpa-mini-stat">
                <div className="rpa-mini-label">Completeness</div>
                <div className="rpa-mini-val">{pct(conf.completeness)}</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {(conf.per_field||[]).map(f => (
                <div key={f.field} style={{ display:"grid", gridTemplateColumns:"110px 1fr", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, color:"var(--muted)", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={f.field}>{f.field.replace(/_/g," ")}</span>
                  <ConfBar value={f.score}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Checks tab ── */}
        {tab==="checks" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {!(val.errors||[]).length && !(val.warnings||[]).length && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:28, color:C.emerald.solid, fontSize:13, fontWeight:600 }}>
                <RiCheckboxCircleLine size={24}/> All validation checks passed
              </div>
            )}
            {(val.errors||[]).map((e,i) => (
              <div key={i} className="rpa-alert" style={{ color:C.rose.solid, background:C.rose.bg, borderLeftColor:C.rose.solid }}>
                <RiAlertFill size={13} style={{flexShrink:0,marginTop:1}}/>{e}
              </div>
            ))}
            {val.duplicate_flag && (
              <div className="rpa-alert" style={{ color:C.amber.solid, background:C.amber.bg, borderLeftColor:C.amber.solid }}>
                <RiInformationLine size={13} style={{flexShrink:0,marginTop:1}}/> Possible duplicate — verify before posting
              </div>
            )}
            {(val.warnings||[]).map((w,i) => (
              <div key={i} className="rpa-alert" style={{ color:C.amber.solid, background:C.amber.bg, borderLeftColor:C.amber.solid }}>
                <RiInformationLine size={13} style={{flexShrink:0,marginTop:1}}/>{w}
              </div>
            ))}
          </div>
        )}

        {/* ── File tab (PDF viewer) ── */}
        {tab==="file" && (
          <div>
            <iframe
              className="rpa-pdf-frame"
              src={`${API}/invoice/${item._id}/pdf`}
              title="Invoice File"
            />
            <a href={`${API}/invoice/${item._id}/pdf`} target="_blank" rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:10, fontSize:12, color:"#6366f1", textDecoration:"none", fontWeight:600 }}>
              <RiExternalLinkLine size={13}/> Open in new tab
            </a>
          </div>
        )}

        {/* ── ERP tab ── */}
        {tab==="erp" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {erp ? (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["Status",erp.status],["System",erp.erp_system?.toUpperCase()],["Ref ID",erp.erp_ref_id||"—"],["Submitted",fmtDate(erp.submitted_at)],["By",erp.submitted_by],["Time",fmtTime(erp.submitted_at)]].map(([k,v]) => (
                    <div key={k} className="rpa-mini-stat" style={{ padding:"9px 12px" }}>
                      <div className="rpa-mini-label">{k}</div>
                      <div style={{ fontSize:13, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:erp.status==="SUCCESS"&&k==="Status"?C.emerald.solid:erp.status==="FAILED"&&k==="Status"?C.rose.solid:"var(--text)" }}>{v||"—"}</div>
                    </div>
                  ))}
                </div>
                {erp.message && <div className="rpa-info-strip" style={{ fontSize:12 }}>{erp.message}</div>}
              </>
            ) : (
              <Empty icon={RiServerLine}>Not yet submitted to ERP</Empty>
            )}
            {canPostErp && (
              <button className="rpa-btn-primary" style={{ justifyContent:"center" }} onClick={() => setShowErp(true)}>
                <RiSendPlaneLine size={13}/> {erp ? "Resubmit to ERP" : "Post to ERP"}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DASHBOARD VIEW
   ══════════════════════════════════════════════════════════════════════════ */
function DashboardView({ stats, statsLoading, onUploadResult, onViewInvoice }) {
  const { data: recent, loading: rl } = useApi(`${API}/invoices?limit=6`);
  const { data: feedback }            = useApi(`${API}/feedback/summary`);
  const total   = stats?.total ?? 0;
  const autoP   = stats?.auto_post ?? 0;
  const pending = (stats?.soft_review??0) + (stats?.manual_review??0);
  const avgConf = `${Math.round((stats?.avg_confidence??0)*100)}%`;
  const week    = stats?.recent_7_days ?? 0;

  return (
    <div className="rpa-page">
      {/* ── KPI Row ── */}
      <div className="rpa-kpi-grid">
        <KpiCard label="Total Processed" value={total} sub={`${week} this week`} trendLabel={week>0?`+${week} this week`:undefined} trendUp icon={RiFileList3Line} color={C.indigo.solid} loading={statsLoading}/>
        <KpiCard label="Auto Posted" value={autoP} sub="Zero-touch" trendLabel={autoP>0?`${Math.round(autoP/(total||1)*100)}% rate`:undefined} trendUp icon={RiFlashlightLine} color={C.emerald.solid} loading={statsLoading}/>
        <KpiCard label="Pending Review" value={pending} sub={`${stats?.soft_review??0} soft · ${stats?.manual_review??0} manual`} icon={RiTimeLine} color={C.amber.solid} loading={statsLoading}/>
        <KpiCard label="Avg Confidence" value={avgConf} sub={`${Math.round((stats?.arithmetic_pass_rate??0)*100)}% arith pass`} trendLabel={avgConf} trendUp={(stats?.avg_confidence??0)>=.85} icon={RiBarChartLine} color={C.violet.solid} loading={statsLoading}/>
      </div>

      {/* ── Extended KPIs row ── */}
      {stats && (
        <div className="rpa-kpi-grid-6">
          {[
            { l:"Approved",    v:stats.approved??0,   c:C.emerald.solid, icon:RiCheckLine    },
            { l:"Rejected",    v:stats.rejected??0,   c:C.rose.solid,    icon:RiCloseLine    },
            { l:"Corrected",   v:stats.corrected??0,  c:C.blue.solid,    icon:RiEdit2Line    },
            { l:"ERP Posted",  v:stats.erp_posted??0, c:C.cyan.solid,    icon:RiServerLine   },
            { l:"Success Rate",v:pct(stats.success_rate), c:C.violet.solid, icon:RiSpeedLine },
            { l:"7-Day Volume",v:week,                 c:C.indigo.solid,  icon:RiBarChartLine },
          ].map(s => (
            <div key={s.l} className="rpa-kpi-card" style={{ padding:"14px 16px", gap:8 }}>
              <div className="rpa-kpi-glow" style={{ background:`radial-gradient(circle at 85% 85%, ${s.c}14, transparent 65%)` }}/>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span className="rpa-kpi-label">{s.l}</span>
                <div style={{ width:30, height:30, borderRadius:9, background:`${s.c}18`, border:`1px solid ${s.c}30`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <s.icon size={14} style={{ color:s.c }}/>
                </div>
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Middle: Upload + Routing ── */}
      <div className="rpa-mid-grid">
        <div className="rpa-card">
          <CardTitle icon={RiUploadCloud2Line}>Process Invoice</CardTitle>
          <UploadZone onResult={onUploadResult}/>
          <div className="rpa-info-strip" style={{ marginTop:12 }}>
            <RiShieldCheckLine size={14} style={{ color:C.emerald.solid, flexShrink:0 }}/>
            AI-powered OCR · Auto routing · ERP-ready output
          </div>
        </div>
        <div className="rpa-card">
          <CardTitle icon={RiPieChartLine}>Routing Distribution</CardTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {stats && [
              { l:"Auto Post",     v:stats.auto_post,     col:C.emerald.solid, desc:"Zero-touch to ERP" },
              { l:"Soft Review",   v:stats.soft_review,   col:C.amber.solid,   desc:"Minor exceptions"  },
              { l:"Manual Review", v:stats.manual_review, col:C.rose.solid,    desc:"Human required"    },
              { l:"Corrected",     v:stats.corrected,     col:C.blue.solid,    desc:"Post-correction"   },
            ].map(row => {
              const p = stats.total ? Math.round((row.v/stats.total)*100) : 0;
              return (
                <div key={row.l} className="rpa-route-row">
                  <div className="rpa-route-header">
                    <div className="rpa-route-left">
                      <span className="rpa-route-dot" style={{ background:row.col, boxShadow:`0 0 6px ${row.col}60` }}/>
                      <span className="rpa-route-name">{row.l}</span>
                      <span className="rpa-route-desc">{row.desc}</span>
                    </div>
                    <div className="rpa-route-right">
                      <span className="rpa-route-pct">{p}%</span>
                      <span className="rpa-route-count">{row.v}</span>
                    </div>
                  </div>
                  <div className="rpa-bar-track">
                    <div className="rpa-bar-fill" style={{ width:`${p}%`, background:row.col, boxShadow:`0 0 8px ${row.col}50` }}/>
                  </div>
                </div>
              );
            })}
          </div>
          {stats && (
            <div className="rpa-summary-strip">
              {[{l:"Total",v:stats.total,c:"var(--text)"},{l:"Auto",v:stats.auto_post,c:C.emerald.solid},{l:"Review",v:(stats.soft_review||0)+(stats.manual_review||0),c:C.amber.solid},{l:"Fixed",v:stats.corrected,c:C.blue.solid}].map(s=>(
                <div key={s.l} className="rpa-summary-col">
                  <div className="rpa-summary-num" style={{ color:s.c }}>{s.v??0}</div>
                  <div className="rpa-summary-lbl">{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: Recent Activity + AI Feedback ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:18, alignItems:"start" }}>
        <div className="rpa-card" style={{ padding:0, overflow:"hidden", minWidth:0 }}>
          <div style={{ padding:"20px 22px 0" }}>
            <CardTitle icon={RiTimeLine} right="Last 6 invoices">Recent Activity</CardTitle>
          </div>
          {rl
            ? <div style={{ display:"flex", justifyContent:"center", padding:"36px 0" }}><Spinner size={24}/></div>
            : !(recent?.items?.length)
              ? <Empty icon={RiFileTextLine}>No invoices yet</Empty>
              : (
                <div style={{ overflowX:"auto" }}>
                  <table className="rpa-table">
                    <thead className="rpa-thead">
                      <tr>{["Invoice #","Vendor","Total","Status","Confidence","Route",""].map(h=><th key={h} className="rpa-th">{h}</th>)}</tr>
                    </thead>
                    <tbody>{recent.items.map(item=><InvoiceRow key={item._id} item={item} onSelect={onViewInvoice} onDelete={()=>{}}/>)}</tbody>
                  </table>
                </div>
              )}
        </div>

        {/* AI Feedback sidebar card */}
        {feedback && feedback.total_corrections > 0 && (
          <div className="rpa-card" style={{ width:220, flexShrink:0 }}>
            <CardTitle icon={RiClockwiseLine}>AI Feedback</CardTitle>
            <div style={{ marginBottom:12 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:"var(--text)" }}>{feedback.total_corrections}</span>
              <span style={{ fontSize:11, color:"var(--muted)", marginLeft:6 }}>corrections</span>
            </div>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".07em", color:"var(--muted)", marginBottom:8 }}>Most Corrected Fields</div>
            {(feedback.most_corrected_fields||[]).slice(0,5).map(([field,count],i) => {
              const maxCount = (feedback.most_corrected_fields[0]||[,1])[1] || 1;
              return (
                <div key={i} className="rpa-feedback-row">
                  <div className="rpa-feedback-field">{field.replace(/_/g," ")}</div>
                  <div className="rpa-bar-track" style={{ maxWidth:50 }}>
                    <div className="rpa-bar-fill" style={{ width:`${Math.min(100,(count/maxCount)*100)}%`, background:"#6366f1" }}/>
                  </div>
                  <div className="rpa-feedback-count">{count}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   REVIEW QUEUE VIEW
   ══════════════════════════════════════════════════════════════════════════ */
function ReviewQueueView({ onSelect, onRefresh }) {
  const [priority, setPriority] = useState("");
  const [page, setPage]         = useState(0);
  const PER = 10;
  const url  = `${API}/review/pending?limit=${PER}&offset=${page*PER}${priority?`&priority=${priority}`:""}`;
  const { data, loading, refresh } = useApi(url, [priority, page]);

  const quickApprove = async (e, id) => {
    e.stopPropagation();
    await fetch(`${API}/invoice/${id}/approve`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ approved_by:"dashboard_user" }) });
    refresh(); onRefresh();
  };

  return (
    <div className="rpa-page">
      {data && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
          {[
            { l:"Total Pending",  v:data.total,          c:C.amber.solid  },
            { l:"High Priority",  v:data.pending_high,   c:C.rose.solid   },
            { l:"Normal Priority",v:data.pending_normal, c:C.amber.solid  },
          ].map(s => (
            <div key={s.l} className="rpa-kpi-card" style={{ padding:"14px 18px", gap:8 }}>
              <div className="rpa-kpi-glow" style={{ background:`radial-gradient(circle at 80% 80%, ${s.c}14, transparent 60%)` }}/>
              <span className="rpa-kpi-label">{s.l}</span>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:700, color:s.c }}>{s.v??0}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rpa-card">
        <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ width:28, height:28, borderRadius:9, background:"rgba(99,102,241,.12)", border:"1px solid rgba(99,102,241,.22)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <RiFilter3Line size={14} style={{ color:"#6366f1" }}/>
          </div>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>Pending Invoices</span>
          <select className="rpa-select" style={{ marginLeft:"auto" }} value={priority} onChange={e=>{setPriority(e.target.value);setPage(0);}}>
            <option value="">All Priority</option>
            <option value="manual">High — Manual Review</option>
            <option value="soft">Normal — Soft Review</option>
          </select>
          <button className="rpa-icon-btn" onClick={refresh} title="Refresh"><RiRefreshLine size={14}/></button>
        </div>

        {loading
          ? <div style={{ display:"flex", justifyContent:"center", padding:"44px 0" }}><Spinner size={24}/></div>
          : !(data?.items?.length)
            ? <Empty icon={RiCheckboxCircleLine}>No invoices pending review 🎉</Empty>
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {data.items.map(item => {
                  const inv    = item.invoice || {};
                  const isHigh = item.review_priority === "HIGH";
                  return (
                    <div key={item._id} className={`rpa-review-card ${isHigh?"high":"normal"}`} onClick={() => onSelect(item)}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                            <span className="rpa-priority-badge" style={{ color:isHigh?C.rose.solid:C.amber.solid, background:isHigh?C.rose.bg:C.amber.bg }}>
                              {isHigh ? "🔴 High" : "🟡 Normal"}
                            </span>
                            <Badge route={item.routing?.route}/>
                            {item.is_duplicate && <Tag label="⚠ Duplicate" color={C.amber.solid} bg={C.amber.bg}/>}
                            <span style={{ fontSize:11, color:"var(--muted)", marginLeft:"auto", whiteSpace:"nowrap" }}>⏱ {item.waiting_since}</span>
                          </div>
                          <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                            <div>
                              <div style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Invoice #</div>
                              <div style={{ fontSize:13, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:"var(--text)" }}>{inv.invoice_number||"—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Vendor</div>
                              <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{inv.vendor_name||"—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Amount</div>
                              <div style={{ fontSize:13, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:"var(--text)" }}>{fmt(inv.total_amount,inv.currency)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Confidence</div>
                              <div style={{ width:100 }}><ConfBar value={item.confidence?.overall}/></div>
                            </div>
                          </div>
                          {item.routing?.route_reason && (
                            <div style={{ marginTop:6, fontSize:11.5, color:"var(--muted)", lineHeight:1.5 }}>{item.routing.route_reason}</div>
                          )}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }} onClick={e=>e.stopPropagation()}>
                          <button className="rpa-btn-success" style={{ padding:"6px 12px", fontSize:11.5 }} onClick={e => quickApprove(e, item._id)}>
                            <RiCheckLine size={12}/> Approve
                          </button>
                          <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:11.5 }} onClick={() => onSelect(item)}>
                            <RiEyeLine size={12}/> Review
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

        {data?.total > PER && (
          <div className="rpa-pagination">
            <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}><RiArrowLeftLine size={13}/> Prev</button>
            <span>Page {page+1} of {Math.ceil(data.total/PER)}</span>
            <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>setPage(p=>p+1)} disabled={(page+1)*PER>=data.total}>Next <RiArrowRightLine size={13}/></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   AUDIT LOG VIEW
   ══════════════════════════════════════════════════════════════════════════ */
function AuditLogView() {
  const [actionF, setActionF] = useState("");
  const [page, setPage]       = useState(0);
  const PER = 20;
  const url  = `${API}/audit-logs?limit=${PER}&offset=${page*PER}${actionF?`&action=${actionF}`:""}`;
  const { data, loading, refresh } = useApi(url, [actionF, page]);

  return (
    <div className="rpa-page">
      <div className="rpa-card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"18px 20px", display:"flex", gap:10, alignItems:"center", borderBottom:"1px solid var(--border)", flexWrap:"wrap" }}>
          <div style={{ width:28, height:28, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(99,102,241,.12)", border:"1px solid rgba(99,102,241,.22)", flexShrink:0 }}>
            <RiHistoryLine size={14} style={{ color:"#6366f1" }}/>
          </div>
          <div>
            <span style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>Audit Trail</span>
            <span style={{ fontSize:11, color:"var(--muted)", marginLeft:8 }}>Every system action logged</span>
          </div>
          <select className="rpa-select" style={{ marginLeft:"auto" }} value={actionF} onChange={e=>{setActionF(e.target.value);setPage(0);}}>
            <option value="">All Actions</option>
            <option value="invoice_uploaded">Uploaded</option>
            <option value="invoice_corrected">Corrected</option>
            <option value="invoice_approved">Approved</option>
            <option value="invoice_rejected">Rejected</option>
            <option value="invoice_deleted">Deleted</option>
            <option value="erp_submission">ERP Submitted</option>
            <option value="vendor_registered">Vendor Added</option>
          </select>
          <button className="rpa-icon-btn" onClick={refresh}><RiRefreshLine size={14}/></button>
        </div>

        {loading
          ? <div style={{ display:"flex", justifyContent:"center", padding:"44px 0" }}><Spinner size={24}/></div>
          : !(data?.items?.length)
            ? <Empty icon={RiHistoryLine}>No audit events yet</Empty>
            : (
              <div>
                {data.items.map((log, i) => {
                  const am   = ACTION_META[log.action] || { label:log.action, color:C.slate.solid, bg:C.slate.bg, icon:RiInformationLine };
                  const Icon = am.icon;
                  return (
                    <div key={i} className="rpa-audit-row">
                      <div className="rpa-audit-icon" style={{ background:am.bg, border:`1px solid ${am.color}28` }}>
                        <Icon size={14} style={{ color:am.color }}/>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span className="rpa-audit-action">{am.label}</span>
                          {log.invoice_id && (
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted)" }}>{log.invoice_id}</span>
                          )}
                          <span style={{ fontSize:11, color:"var(--muted)", marginLeft:"auto", whiteSpace:"nowrap" }}>
                            {fmtDate(log.timestamp)} {fmtTime(log.timestamp)}
                          </span>
                        </div>
                        <div className="rpa-audit-meta">Actor: <strong>{log.actor}</strong></div>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="rpa-audit-detail">
                            {Object.entries(log.details)
                              .filter(([,v]) => v != null && v !== "" && !(typeof v === "object" && !Object.keys(v).length))
                              .map(([k,v]) => `${k}: ${typeof v==="object" ? JSON.stringify(v) : v}`)
                              .join("  ·  ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

        {data?.total > PER && (
          <div className="rpa-pagination">
            <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}><RiArrowLeftLine size={13}/> Prev</button>
            <span>Page {page+1} of {Math.ceil(data.total/PER)} ({data.total} events)</span>
            <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>setPage(p=>p+1)} disabled={(page+1)*PER>=data.total}>Next <RiArrowRightLine size={13}/></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   INVOICES VIEW
   ══════════════════════════════════════════════════════════════════════════ */
function InvoicesView({ onSelect }) {
  const [search, setSearch] = useState("");
  const [routeF, setRouteF] = useState("");
  const [page, setPage]     = useState(0);
  const PER = 15;
  const url  = `${API}/invoices?limit=${PER}&offset=${page*PER}${routeF?`&route=${routeF}`:""}`;
  const { data, loading, refresh } = useApi(url, [routeF, page]);
  const del = async (id) => {
    if (!confirm("Delete this invoice?")) return;
    await fetch(`${API}/invoice/${id}`, { method:"DELETE" }); refresh();
  };
  const items = (data?.items||[]).filter(i => {
    if (!search) return true;
    const q=search.toLowerCase(), inv=i.invoice||{};
    return (inv.invoice_number||"").toLowerCase().includes(q)||(inv.vendor_name||"").toLowerCase().includes(q);
  });
  return (
    <div className="rpa-page">
      <div className="rpa-card">
        <CardTitle icon={RiUploadCloud2Line}>Upload New Invoice</CardTitle>
        <UploadZone onResult={onSelect} compact/>
      </div>
      <div className="rpa-card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"18px 20px 0", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <div className="rpa-search-wrap">
            <RiSearchLine size={13} className="rpa-search-icon"/>
            <input className="rpa-input" style={{ paddingLeft:30 }} placeholder="Search invoice # or vendor…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="rpa-select" value={routeF} onChange={e=>{setRouteF(e.target.value);setPage(0);}}>
            <option value="">All Routes</option>
            <option value="AUTO_POST">Auto Post</option>
            <option value="SOFT_REVIEW">Soft Review</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
            <option value="CORRECTED">Corrected</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ERP_POSTED">ERP Posted</option>
          </select>
          <button className="rpa-icon-btn" onClick={refresh}><RiRefreshLine size={14}/></button>
        </div>
        {loading
          ? <div style={{ display:"flex", justifyContent:"center", padding:"44px 0" }}><Spinner size={26}/></div>
          : !items.length
            ? <Empty icon={RiFileList3Line}>No invoices found</Empty>
            : (
              <div style={{ overflowX:"auto", marginTop:14 }}>
                <table className="rpa-table">
                  <thead className="rpa-thead">
                    <tr>{["Invoice #","Vendor","Total","Status","Confidence","Route","Actions"].map(h=><th key={h} className="rpa-th">{h}</th>)}</tr>
                  </thead>
                  <tbody>{items.map(item=><InvoiceRow key={item._id} item={item} onSelect={onSelect} onDelete={del}/>)}</tbody>
                </table>
              </div>
            )}
        {data?.total > PER && (
          <div className="rpa-pagination">
            <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}><RiArrowLeftLine size={13}/> Prev</button>
            <span>Page {page+1} of {Math.ceil(data.total/PER)}</span>
            <button className="rpa-btn-secondary" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>setPage(p=>p+1)} disabled={(page+1)*PER>=data.total}>Next <RiArrowRightLine size={13}/></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   VENDORS VIEW
   ══════════════════════════════════════════════════════════════════════════ */
function VendorsView() {
  const { data, loading, refresh } = useApi(`${API}/vendors`);
  const [name, setName]     = useState("");
  const [adding, setAdding] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    await fetch(`${API}/vendor/register`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name}) });
    setName(""); setAdding(false); refresh();
  };
  return (
    <div className="rpa-page" style={{ maxWidth:560 }}>
      <div className="rpa-card">
        <CardTitle icon={RiAddLine}>Register Vendor</CardTitle>
        <div style={{ display:"flex", gap:8 }}>
          <input className="rpa-input" style={{ flex:1 }} placeholder="Company name…" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}/>
          <button className="rpa-btn-primary" onClick={add} disabled={adding||!name.trim()}>{adding?<Spinner size={13} color="#fff"/>:<RiCheckLine size={13}/>} Add</button>
        </div>
      </div>
      <div className="rpa-card">
        <CardTitle icon={RiBuildingLine} right={loading?"…":`${data?.vendors?.length??0} registered`}>Vendor Registry</CardTitle>
        {loading
          ? <div style={{ display:"flex", justifyContent:"center", padding:"24px 0" }}><Spinner/></div>
          : (
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {!(data?.vendors?.length) && <Empty icon={RiBuildingLine}>No vendors yet</Empty>}
              {(data?.vendors||[]).map((v,i) => (
                <div key={i} className="rpa-vendor-item">
                  <span style={{ width:7, height:7, borderRadius:"50%", background:C.emerald.solid, flexShrink:0, boxShadow:`0 0 6px ${C.emerald.solid}60` }}/>
                  <RiBuildingLine size={13} style={{ color:"#6366f1", flexShrink:0 }}/>
                  <span style={{ fontSize:13, fontWeight:500, color:"var(--text)", textTransform:"capitalize", flex:1 }}>{v}</span>
                  <Tag label="Active" color={C.emerald.solid} bg={C.emerald.bg}/>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HEALTH DOT (topbar indicator)
   ══════════════════════════════════════════════════════════════════════════ */
function HealthDot() {
  const { data } = useApi(`${API}/health/detailed`);
  if (!data) return null;
  const cls = data.status === "ok" ? "ok" : data.status === "degraded" ? "degraded" : "error";
  return (
    <span className={`rpa-health-dot ${cls}`} title={`System ${data.status} — disk: ${data.checks?.disk?.free_gb ?? "?"}GB free`}/>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   APP ROOT
   ══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  injectStyles();

  const [page,       setPage]      = useState("dashboard");
  const [dark,       setDark]      = useState(true);
  const [collapsed,  setCollapsed] = useState(false);
  const [mobileOpen, setMobileO]   = useState(false);
  const [selected,   setSelected]  = useState(null);
  const [statsKey,   setStatsKey]  = useState(0);

  const { data: stats, loading: statsLoading } = useApi(`${API}/stats`, [statsKey]);
  const { data: reviewData }                   = useApi(`${API}/review/pending?limit=1`);
  const pendingCount = reviewData?.total ?? 0;

  const NAV = [
    { id:"dashboard", label:"Dashboard",    icon:RiDashboardLine },
    { id:"invoices",  label:"Invoices",     icon:RiFileList3Line },
    { id:"review",    label:"Review Queue", icon:RiTimeLine,    badge: pendingCount > 0 ? pendingCount : null },
    { id:"audit",     label:"Audit Log",    icon:RiHistoryLine  },
    { id:"vendors",   label:"Vendors",      icon:RiBuildingLine },
  ];

  const navigate     = id => { setPage(id); setSelected(null); setMobileO(false); };
  const handleResult = r  => { setStatsKey(k=>k+1); setSelected(r); setPage("invoices"); };
  const PAGE_TITLES  = { dashboard:"Dashboard", invoices:"Invoices", review:"Review Queue", audit:"Audit Log", vendors:"Vendor Registry" };

  return (
    <div id="rpa-root" data-theme={dark?"dark":"light"}>
      {mobileOpen && <div id="rpa-overlay" style={{ display:"block" }} onClick={()=>setMobileO(false)}/>}

      {/* ── Sidebar ── */}
      <nav id="rpa-sidebar" className={[collapsed?"collapsed":"", mobileOpen?"mobile-open":""].join(" ")}>
        <div className="rpa-logo">
          <div className="rpa-logo-icon"><RiFileTextLine size={16} style={{ color:"#fff" }}/></div>
          <div className="rpa-logo-text-wrap">
            <div className="rpa-logo-name">Invoice RPA</div>
            <div className="rpa-logo-sub">Automation Suite</div>
          </div>
        </div>
        <div className="rpa-nav">
          {NAV.map(n => {
            const Icon   = n.icon;
            const active = page === n.id;
            return (
              <button key={n.id} className={`rpa-nav-btn${active?" active":""}`} onClick={()=>navigate(n.id)} title={collapsed?n.label:undefined}>
                <Icon size={17} style={{ flexShrink:0 }}/>
                <span className="rpa-nav-label">{n.label}</span>
                {n.badge
                  ? <span className="rpa-nav-badge">{n.badge > 99 ? "99+" : n.badge}</span>
                  : active && <span className="rpa-nav-dot"/>
                }
              </button>
            );
          })}
        </div>
        <div className="rpa-side-foot">
          <button className="rpa-side-foot-btn" onClick={()=>setDark(d=>!d)} title={dark?"Light mode":"Dark mode"}>
            {dark ? <RiSunLine size={15} style={{ flexShrink:0, color:"#fbbf24" }}/> : <RiMoonLine size={15} style={{ flexShrink:0, color:"#a78bfa" }}/>}
            <span className="rpa-foot-label">{dark?"Light mode":"Dark mode"}</span>
          </button>
          <button className="rpa-side-foot-btn" onClick={()=>setCollapsed(c=>!c)} title={collapsed?"Expand":"Collapse"}>
            {collapsed ? <RiArrowRightSLine size={16} style={{ flexShrink:0 }}/> : <RiArrowLeftSLine size={16} style={{ flexShrink:0 }}/>}
            <span className="rpa-foot-label">Collapse</span>
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main id="rpa-main">
        <div id="rpa-topbar">
          <button className="rpa-icon-btn rpa-mobile-menu-btn" onClick={()=>setMobileO(o=>!o)} aria-label="Open menu">
            <RiMenuLine size={15}/>
          </button>
          <h1 id="rpa-topbar-title">{PAGE_TITLES[page]}</h1>
          <HealthDot/>
          <button className="rpa-btn-primary" onClick={()=>navigate("invoices")}>
            <RiUploadCloud2Line size={14}/><span>Upload Invoice</span>
          </button>
        </div>

        <div id="rpa-scroll">
          <div id="rpa-content">
            <div style={{ flex:1, minWidth:0 }}>
              {page==="dashboard" && <DashboardView stats={stats} statsLoading={statsLoading} onUploadResult={handleResult} onViewInvoice={setSelected}/>}
              {page==="invoices"  && <InvoicesView  onSelect={setSelected}/>}
              {page==="review"    && <ReviewQueueView onSelect={setSelected} onRefresh={()=>setStatsKey(k=>k+1)}/>}
              {page==="audit"     && <AuditLogView/>}
              {page==="vendors"   && <VendorsView/>}
            </div>
            {selected && (
              <DetailPanel item={selected} onClose={()=>setSelected(null)} onRefresh={()=>setStatsKey(k=>k+1)}/>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}