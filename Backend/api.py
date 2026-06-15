"""
FastAPI REST API — Invoice RPA Dashboard Backend  (v3 — Full Feature Implementation)
=====================================================================================
CHANGES vs v2:
  NEW ENDPOINTS:
    GET  /api/invoice/{id}/pdf         — Serve original uploaded PDF/image file
    GET  /api/review/pending           — HITL review queue (SOFT_REVIEW + MANUAL_REVIEW)
    POST /api/invoice/{id}/approve     — Approve a reviewed invoice → marks APPROVED
    POST /api/invoice/{id}/reject      — Reject with a reason → marks REJECTED
    POST /api/erp/post/{id}            — Submit invoice to ERP (mock + real stub)
    GET  /api/erp/status/{id}          — Check ERP submission status
    GET  /api/audit-logs               — Paginated audit log viewer
    GET  /api/feedback/summary         — HITL corrections summary from .jsonl
    GET  /api/health/detailed          — Extended health check (disk, Firebase, Groq)

  NEW MODULES (alongside this file):
    core/erp_integration.py            — ERP submission service (mock + Odoo stub)
    core/audit_logger.py               — Structured audit log writer / reader

Run with:
    pip install fastapi uvicorn python-multipart
    uvicorn api_updated:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.settings import OUTPUT_DIR, SUPPORTED_FORMATS
from core.pipeline import process_invoice
from core.validator import register_vendor, _load_store
from utils.output_writer import save_result_json
from core.firebase_store import (
    save_result_firestore,
    get_result_firestore,
    list_results_firestore,
    delete_result_firestore,
    update_result_firestore,
)
from core.audit_logger import log_action, get_audit_logs      # NEW
from core.erp_integration import submit_to_erp, get_erp_status # NEW
from core.feedback import load_corrections_summary              # NEW

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Invoice RPA API",
    description="Intelligent Accounts Payable Invoice Extraction — v3",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = ROOT / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _list_results() -> list[dict]:
    results = []
    for f in sorted(OUTPUT_DIR.glob("*_result.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data["_id"] = f.stem
            results.append(data)
        except Exception:
            pass
    return results


def _get_result(result_id: str) -> dict:
    path = OUTPUT_DIR / f"{result_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Result '{result_id}' not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    data["_id"] = path.stem
    return data


def _save_result(result_id: str, data: dict) -> None:
    """Persist updated result dict back to disk + Firebase."""
    path = OUTPUT_DIR / f"{result_id}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        update_result_firestore(result_id, data)
    except Exception as fb_err:
        log.warning(f"Firebase sync failed: {fb_err}")


# ══════════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ══════════════════════════════════════════════════════════════════════════════

class CorrectionRequest(BaseModel):
    vendor_name:     Optional[str]   = None
    vendor_address:  Optional[str]   = None
    invoice_number:  Optional[str]   = None
    invoice_date:    Optional[str]   = None
    due_date:        Optional[str]   = None
    po_number:       Optional[str]   = None
    subtotal:        Optional[float] = None
    tax_amount:      Optional[float] = None
    tax_rate:        Optional[float] = None
    discount:        Optional[float] = None
    total_amount:    Optional[float] = None
    currency:        Optional[str]   = None
    corrected_by:    Optional[str]   = "human_reviewer"
    notes:           Optional[str]   = None


class ApproveRequest(BaseModel):
    approved_by: Optional[str] = "human_reviewer"
    notes:       Optional[str] = None


class RejectRequest(BaseModel):
    rejected_by: Optional[str] = "human_reviewer"
    reason:      str                          # rejection reason is required


class ERPSubmitRequest(BaseModel):
    erp_system:  str = "mock"       # "mock" | "odoo" | "quickbooks" | "sap"
    submitted_by: Optional[str] = "system"
    notes:       Optional[str] = None


class VendorRequest(BaseModel):
    name: str


# ══════════════════════════════════════════════════════════════════════════════
# ── EXISTING ROUTES (kept identical) ──────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/invoice/process")
async def process_invoice_endpoint(file: UploadFile = File(...)):
    """Upload and process an invoice file through the full 6-step pipeline."""
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}"
        )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{Path(file.filename).stem}_{timestamp}{suffix}"
    upload_path = UPLOADS_DIR / safe_name

    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size_mb = upload_path.stat().st_size / 1_048_576
    if size_mb > 50:
        upload_path.unlink()
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    try:
        result = process_invoice(str(upload_path))
        out_path = save_result_json(result)

        data = json.loads(out_path.read_text(encoding="utf-8"))
        data["_id"] = out_path.stem
        data["_upload_file"] = safe_name

        # ── NEW: Write audit log ──────────────────────────────────────────────
        log_action(
            action="invoice_uploaded",
            invoice_id=out_path.stem,
            actor="api",
            details={
                "file_name": safe_name,
                "route": data.get("routing", {}).get("route"),
                "confidence": data.get("confidence", {}).get("overall"),
                "status": data.get("meta", {}).get("status"),
            }
        )

        try:
            save_result_firestore(data, out_path.stem)
        except Exception as fb_err:
            log.warning(f"Firebase sync failed (local save OK): {fb_err}")

        return JSONResponse(content=data)

    except Exception as e:
        log.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/invoices")
async def list_invoices(
    route:  Optional[str] = None,
    status: Optional[str] = None,
    limit:  int = 50,
    offset: int = 0,
):
    results = _list_results()
    if route:
        results = [r for r in results if r.get("routing", {}).get("route") == route.upper()]
    if status:
        results = [r for r in results if r.get("meta", {}).get("status") == status.upper()]
    total = len(results)
    return {"total": total, "items": results[offset: offset + limit]}


@app.get("/api/invoice/{result_id}")
async def get_invoice(result_id: str):
    return _get_result(result_id)


@app.delete("/api/invoice/{result_id}")
async def delete_invoice(result_id: str):
    path = OUTPUT_DIR / f"{result_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    path.unlink()
    try:
        delete_result_firestore(result_id)
    except Exception as fb_err:
        log.warning(f"Firebase delete failed: {fb_err}")
    log_action("invoice_deleted", invoice_id=result_id, actor="api")
    return {"deleted": result_id}


@app.post("/api/invoice/{result_id}/correct")
async def correct_invoice(result_id: str, correction: CorrectionRequest):
    """Submit HITL field-level correction."""
    data = _get_result(result_id)

    inv = data.get("invoice") or {}
    corrections_applied = {}
    num_fields = {"subtotal", "tax_amount", "tax_rate", "discount", "total_amount"}

    for field, value in correction.dict(exclude_none=True).items():
        if field not in ("corrected_by", "notes") and value is not None:
            inv[field] = value
            corrections_applied[field] = value

    data["invoice"] = inv
    data["routing"]["route"] = "CORRECTED"
    data["routing"]["route_reason"] = f"Manually corrected by {correction.corrected_by}"
    data["_correction"] = {
        "corrected_at":  datetime.now().isoformat(),
        "corrected_by":  correction.corrected_by,
        "fields_changed": corrections_applied,
        "notes":         correction.notes,
    }

    _save_result(result_id, data)

    if correction.vendor_name:
        register_vendor(correction.vendor_name)

    # ── Audit log ─────────────────────────────────────────────────────────────
    log_action(
        action="invoice_corrected",
        invoice_id=result_id,
        actor=correction.corrected_by or "human_reviewer",
        details={"fields_changed": corrections_applied, "notes": correction.notes}
    )

    return data


@app.get("/api/stats")
async def get_stats():
    results = _list_results()
    total = len(results)
    if total == 0:
        return {
            "total": 0, "auto_post": 0, "soft_review": 0, "manual_review": 0,
            "corrected": 0, "approved": 0, "rejected": 0,
            "avg_confidence": 0, "success_rate": 0,
            "arithmetic_pass_rate": 0, "recent_7_days": 0,
        }

    route_counts = {"AUTO_POST": 0, "SOFT_REVIEW": 0, "MANUAL_REVIEW": 0, "CORRECTED": 0, "APPROVED": 0, "REJECTED": 0}
    confidence_sum = 0.0
    success_count = 0
    arith_pass = 0
    recent = 0
    now = datetime.now()

    for r in results:
        route = r.get("routing", {}).get("route", "MANUAL_REVIEW")
        route_counts[route] = route_counts.get(route, 0) + 1
        confidence_sum += r.get("confidence", {}).get("overall", 0)
        if r.get("meta", {}).get("status") == "SUCCESS":
            success_count += 1
        if r.get("confidence", {}).get("arithmetic_ok"):
            arith_pass += 1
        try:
            proc_at = datetime.fromisoformat(r.get("meta", {}).get("processed_at", ""))
            if (now - proc_at).days < 7:
                recent += 1
        except Exception:
            pass

    return {
        "total":               total,
        "auto_post":           route_counts["AUTO_POST"],
        "soft_review":         route_counts["SOFT_REVIEW"],
        "manual_review":       route_counts["MANUAL_REVIEW"],
        "corrected":           route_counts.get("CORRECTED", 0),
        "approved":            route_counts.get("APPROVED", 0),
        "rejected":            route_counts.get("REJECTED", 0),
        "avg_confidence":      round(confidence_sum / total, 4),
        "success_rate":        round(success_count / total, 4),
        "arithmetic_pass_rate": round(arith_pass / total, 4),
        "recent_7_days":       recent,
    }


@app.post("/api/vendor/register")
async def register_vendor_endpoint(req: VendorRequest):
    register_vendor(req.name)
    log_action("vendor_registered", actor="api", details={"name": req.name})
    return {"registered": req.name}


@app.get("/api/vendors")
async def list_vendors():
    store = _load_store()
    return {"vendors": store.get("vendors", [])}


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 1: Serve original uploaded file ─────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/invoice/{result_id}/pdf")
async def serve_invoice_file(result_id: str):
    """
    Serve the original uploaded invoice file (PDF, PNG, JPG, etc.).
    
    The result JSON stores the upload filename in data['_upload_file'].
    Falls back to glob-searching uploads/ by timestamp embedded in result_id.
    
    Used by the HITL dashboard to show side-by-side PDF viewer.
    """
    data = _get_result(result_id)

    # ── Try exact filename stored in result ───────────────────────────────────
    upload_file = data.get("_upload_file") or data.get("meta", {}).get("file_name")
    if upload_file:
        exact = UPLOADS_DIR / upload_file
        if exact.exists():
            media = _guess_media_type(exact.suffix)
            return FileResponse(str(exact), media_type=media, filename=upload_file)

    # ── Fallback: match by timestamp suffix in result_id ─────────────────────
    # result_id format: <stem>_result  (e.g. invoice_20260612_165615_result)
    # upload filename:  <stem>_20260612_165615.pdf
    parts = result_id.replace("_result", "")
    candidates = list(UPLOADS_DIR.glob(f"*{parts[-15:]}*"))  # last 15 chars = timestamp
    if candidates:
        f = candidates[0]
        return FileResponse(str(f), media_type=_guess_media_type(f.suffix), filename=f.name)

    raise HTTPException(status_code=404, detail="Original file not found in uploads/")


def _guess_media_type(suffix: str) -> str:
    return {
        ".pdf":  "application/pdf",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tiff": "image/tiff",
        ".bmp":  "image/bmp",
        ".webp": "image/webp",
    }.get(suffix.lower(), "application/octet-stream")


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 2: Review Queue ─────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/review/pending")
async def review_queue(
    priority: Optional[str] = None,   # "soft" | "manual" | None (both)
    limit:    int = 20,
    offset:   int = 0,
):
    """
    Returns paginated list of invoices awaiting human review.
    
    Includes SOFT_REVIEW and MANUAL_REVIEW routes.
    Priority filter: ?priority=soft → only SOFT_REVIEW, ?priority=manual → only MANUAL_REVIEW
    
    Each item includes:
      - Full invoice result
      - review_priority: "HIGH" (manual) or "NORMAL" (soft)
      - waiting_since: time since processing
    
    Doc reference: §3.5 Human-in-the-Loop Dashboard, §7 HITL Workflow, §14 Review Queue API
    """
    all_results = _list_results()

    # Filter to pending review routes only
    pending_routes = {"SOFT_REVIEW", "MANUAL_REVIEW"}
    if priority == "soft":
        pending_routes = {"SOFT_REVIEW"}
    elif priority == "manual":
        pending_routes = {"MANUAL_REVIEW"}

    pending = [
        r for r in all_results
        if r.get("routing", {}).get("route") in pending_routes
    ]

    # Sort: MANUAL_REVIEW first (higher priority), then by age (oldest first)
    def sort_key(r):
        route_priority = 0 if r.get("routing", {}).get("route") == "MANUAL_REVIEW" else 1
        try:
            age = datetime.fromisoformat(r.get("meta", {}).get("processed_at", datetime.now().isoformat()))
        except Exception:
            age = datetime.now()
        return (route_priority, age)

    pending.sort(key=sort_key)

    # Enrich each item with review metadata
    now = datetime.now()
    enriched = []
    for r in pending:
        item = dict(r)
        route = r.get("routing", {}).get("route", "MANUAL_REVIEW")
        item["review_priority"] = "HIGH" if route == "MANUAL_REVIEW" else "NORMAL"

        # Calculate waiting time
        try:
            processed_at = datetime.fromisoformat(r.get("meta", {}).get("processed_at", ""))
            diff = now - processed_at
            hours = int(diff.total_seconds() // 3600)
            minutes = int((diff.total_seconds() % 3600) // 60)
            item["waiting_since"] = f"{hours}h {minutes}m" if hours else f"{minutes}m"
            item["waiting_seconds"] = int(diff.total_seconds())
        except Exception:
            item["waiting_since"] = "unknown"
            item["waiting_seconds"] = 0

        # Highlight duplicate flag
        item["is_duplicate"] = r.get("validation", {}).get("duplicate_flag", False)
        enriched.append(item)

    total = len(enriched)
    return {
        "total":        total,
        "pending_high": sum(1 for e in enriched if e["review_priority"] == "HIGH"),
        "pending_normal": sum(1 for e in enriched if e["review_priority"] == "NORMAL"),
        "items":        enriched[offset: offset + limit],
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 3: Approve / Reject ─────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/invoice/{result_id}/approve")
async def approve_invoice(result_id: str, req: ApproveRequest):
    """
    Mark a reviewed invoice as APPROVED.
    
    Transitions the invoice from SOFT_REVIEW / MANUAL_REVIEW → APPROVED.
    After approval the invoice is ready for ERP submission.
    Records the approval in audit log.
    
    Doc reference: §7 Human-in-the-Loop Workflow — Approval Workflow
    """
    data = _get_result(result_id)

    current_route = data.get("routing", {}).get("route", "")
    if current_route not in ("SOFT_REVIEW", "MANUAL_REVIEW", "CORRECTED"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve invoice with route '{current_route}'. "
                   "Only SOFT_REVIEW, MANUAL_REVIEW, or CORRECTED invoices can be approved."
        )

    data["routing"]["route"]        = "APPROVED"
    data["routing"]["route_reason"] = f"Manually approved by {req.approved_by}"
    data["_approval"] = {
        "approved_at":  datetime.now().isoformat(),
        "approved_by":  req.approved_by,
        "previous_route": current_route,
        "notes":        req.notes,
    }

    _save_result(result_id, data)

    log_action(
        action="invoice_approved",
        invoice_id=result_id,
        actor=req.approved_by or "human_reviewer",
        details={"previous_route": current_route, "notes": req.notes}
    )

    return data


@app.post("/api/invoice/{result_id}/reject")
async def reject_invoice(result_id: str, req: RejectRequest):
    """
    Reject an invoice with a reason.
    
    Marks the invoice as REJECTED. Rejected invoices are not posted to ERP.
    Reason is required and stored in audit trail.
    
    Doc reference: §7 Human-in-the-Loop Workflow — Approval Workflow
    """
    data = _get_result(result_id)

    data["routing"]["route"]        = "REJECTED"
    data["routing"]["route_reason"] = f"Rejected by {req.rejected_by}: {req.reason}"
    data["_rejection"] = {
        "rejected_at":  datetime.now().isoformat(),
        "rejected_by":  req.rejected_by,
        "reason":       req.reason,
    }

    _save_result(result_id, data)

    log_action(
        action="invoice_rejected",
        invoice_id=result_id,
        actor=req.rejected_by or "human_reviewer",
        details={"reason": req.reason}
    )

    return data


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 4: ERP Submission ───────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/erp/post/{result_id}")
async def post_to_erp(result_id: str, req: ERPSubmitRequest):
    """
    Submit an approved invoice to an ERP system.
    
    Supported ERP systems (doc §3.4):
      - "mock"        → Simulated response for dashboard testing (no real API call)
      - "odoo"        → Odoo REST API stub (requires ODOO_URL + ODOO_API_KEY in .env)
      - "quickbooks"  → QuickBooks OAuth2 stub (requires QB credentials in .env)
      - "sap"         → SAP stub (placeholder)
    
    Only invoices with route AUTO_POST or APPROVED can be submitted.
    ERP submission result is stored in the invoice result JSON under _erp_submission.
    
    Doc reference: §3.4 ERP Integration Service, §8 ERP Integration Strategy, §14 API Design
    """
    data = _get_result(result_id)

    current_route = data.get("routing", {}).get("route", "")
    if current_route not in ("AUTO_POST", "APPROVED"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot post invoice with route '{current_route}' to ERP. "
                   "Only AUTO_POST or APPROVED invoices can be submitted. "
                   "Review and approve the invoice first."
        )

    # ── Prevent double submission ─────────────────────────────────────────────
    existing_erp = data.get("_erp_submission", {})
    if existing_erp.get("status") == "SUCCESS":
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Invoice already submitted to ERP.",
                "erp_submission": existing_erp,
            }
        )

    # ── Call ERP integration module ───────────────────────────────────────────
    inv = data.get("invoice", {})
    erp_result = submit_to_erp(
        erp_system=req.erp_system,
        invoice_data=inv,
        invoice_id=result_id,
    )

    # ── Store ERP result in invoice JSON ──────────────────────────────────────
    data["_erp_submission"] = {
        "submitted_at": datetime.now().isoformat(),
        "submitted_by": req.submitted_by,
        "erp_system":   req.erp_system,
        "status":       erp_result.get("status", "UNKNOWN"),
        "erp_ref_id":   erp_result.get("erp_ref_id"),
        "message":      erp_result.get("message"),
        "notes":        req.notes,
        "raw_response": erp_result,
    }

    if erp_result.get("status") == "SUCCESS":
        data["routing"]["route"] = "ERP_POSTED"
        data["routing"]["route_reason"] = (
            f"Successfully posted to {req.erp_system.upper()} ERP "
            f"(ref: {erp_result.get('erp_ref_id')})"
        )

    _save_result(result_id, data)

    log_action(
        action="erp_submission",
        invoice_id=result_id,
        actor=req.submitted_by or "system",
        details={
            "erp_system":  req.erp_system,
            "erp_status":  erp_result.get("status"),
            "erp_ref_id":  erp_result.get("erp_ref_id"),
        }
    )

    return {
        "invoice_id":    result_id,
        "erp_system":    req.erp_system,
        "erp_status":    erp_result.get("status"),
        "erp_ref_id":    erp_result.get("erp_ref_id"),
        "message":       erp_result.get("message"),
        "invoice_route": data["routing"]["route"],
    }


@app.get("/api/erp/status/{result_id}")
async def erp_status(result_id: str):
    """
    Check the ERP submission status for a specific invoice.
    Returns the stored _erp_submission block from the invoice result.
    """
    data = _get_result(result_id)
    erp_sub = data.get("_erp_submission")
    if not erp_sub:
        return {
            "invoice_id": result_id,
            "erp_status": "NOT_SUBMITTED",
            "message":    "This invoice has not been submitted to ERP yet.",
        }
    return {
        "invoice_id":  result_id,
        "erp_status":  erp_sub.get("status"),
        "erp_ref_id":  erp_sub.get("erp_ref_id"),
        "erp_system":  erp_sub.get("erp_system"),
        "submitted_at": erp_sub.get("submitted_at"),
        "submitted_by": erp_sub.get("submitted_by"),
        "message":     erp_sub.get("message"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 5: Audit Logs ───────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/audit-logs")
async def audit_logs(
    invoice_id: Optional[str] = None,
    action:     Optional[str] = None,
    actor:      Optional[str] = None,
    limit:      int = 50,
    offset:     int = 0,
):
    """
    Paginated audit log viewer.
    
    Every write action in the system is recorded:
      - invoice_uploaded, invoice_corrected, invoice_approved, invoice_rejected
      - erp_submission, vendor_registered, invoice_deleted
    
    Filters:
      ?invoice_id=  → logs for a specific invoice
      ?action=      → filter by action type
      ?actor=       → filter by who performed the action
    
    Doc reference: §10 Security Architecture — Audit Logging
    """
    logs = get_audit_logs()

    # Apply filters
    if invoice_id:
        logs = [l for l in logs if l.get("invoice_id") == invoice_id]
    if action:
        logs = [l for l in logs if l.get("action") == action]
    if actor:
        logs = [l for l in logs if l.get("actor") == actor]

    # Newest first
    logs = sorted(logs, key=lambda l: l.get("timestamp", ""), reverse=True)
    total = len(logs)
    return {
        "total":  total,
        "items":  logs[offset: offset + limit],
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 6: Feedback / HITL Corrections Summary ──────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/feedback/summary")
async def feedback_summary():
    """
    Returns a summary of all HITL corrections made via the dashboard.
    
    Uses the hitl_corrections.jsonl file written by core/feedback.py.
    Useful for tracking which fields the AI gets wrong most often,
    which can guide future LayoutLMv3 fine-tuning (doc §3.2, §7 Active Learning).
    
    Returns:
      - total_corrections: how many corrections have been submitted
      - most_corrected_fields: [(field_name, count)] — top 5 frequently corrected
      - recent_corrections: last 10 correction records
    """
    summary = load_corrections_summary()
    return {
        "total_corrections":     summary.get("total_corrections", 0),
        "most_corrected_fields": summary.get("most_corrected_fields", []),
        "recent_corrections":    summary.get("records", [])[-10:],
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── NEW ROUTE 7: Detailed Health Check ───────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health/detailed")
async def health_detailed():
    """
    Extended health check: disk space, Firebase connectivity, Groq API key presence.
    Safe to call from monitoring systems (Prometheus, UptimeRobot, etc.).
    
    Doc reference: §12 Monitoring & Observability
    """
    from config.settings import GROQ_API_KEY

    checks = {}

    # Disk space
    try:
        import shutil as _shutil
        total, used, free = _shutil.disk_usage(str(OUTPUT_DIR))
        checks["disk"] = {
            "status": "ok",
            "free_gb": round(free / 1e9, 2),
            "used_gb": round(used / 1e9, 2),
        }
    except Exception as e:
        checks["disk"] = {"status": "error", "error": str(e)}

    # Groq API key
    checks["groq_api_key"] = {
        "status": "ok" if GROQ_API_KEY else "missing",
        "configured": bool(GROQ_API_KEY),
    }

    # Output dir
    checks["output_dir"] = {
        "status": "ok" if OUTPUT_DIR.exists() else "missing",
        "path":   str(OUTPUT_DIR),
        "invoice_count": len(list(OUTPUT_DIR.glob("*_result.json"))),
    }

    # Uploads dir
    checks["uploads_dir"] = {
        "status": "ok" if UPLOADS_DIR.exists() else "missing",
        "path":   str(UPLOADS_DIR),
        "file_count": len(list(UPLOADS_DIR.iterdir())) if UPLOADS_DIR.exists() else 0,
    }

    # Firebase (quick ping)
    try:
        from core.firebase_store import _get_db
        db = _get_db()
        checks["firebase"] = {"status": "ok" if db else "not_configured"}
    except Exception as e:
        checks["firebase"] = {"status": "error", "error": str(e)}

    overall = "ok" if all(v.get("status") == "ok" for v in checks.values()) else "degraded"
    return {
        "status":    overall,
        "timestamp": datetime.now().isoformat(),
        "checks":    checks,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ── EXISTING FIREBASE ENDPOINTS (unchanged) ────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/firebase/invoices")
async def list_firebase_invoices(limit: int = 50):
    try:
        results = list_results_firestore(limit=limit)
        return {"source": "firebase", "count": len(results), "results": results}
    except Exception as e:
        log.error(f"[API] Firebase list error: {e}")
        raise HTTPException(status_code=500, detail=f"Firebase error: {str(e)}")


@app.get("/api/firebase/invoice/{result_id}")
async def get_firebase_invoice(result_id: str):
    result = get_result_firestore(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Not found in Firestore: {result_id}")
    return result


@app.post("/api/firebase/sync")
async def sync_local_to_firebase():
    synced, skipped, errors = 0, 0, []
    for path in OUTPUT_DIR.glob("*_result.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            doc_id = path.stem
            save_result_firestore(data, doc_id)
            synced += 1
        except Exception as e:
            errors.append({"file": path.name, "error": str(e)})
            skipped += 1
    return {"synced": synced, "skipped": skipped, "errors": errors}


if __name__ == "__main__":
    uvicorn.run("api_updated:app", host="0.0.0.0", port=8000, reload=True)