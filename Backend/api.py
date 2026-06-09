"""
FastAPI REST API — Invoice RPA Dashboard Backend
================================================
Run with:
    pip install fastapi uvicorn python-multipart
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload

Endpoints:
    POST /api/invoice/process       — Upload & process an invoice file
    GET  /api/invoices              — List all processed invoices (from outputs/)
    GET  /api/invoice/{id}          — Get single invoice result by filename stem
    GET  /api/stats                 — Dashboard statistics
    GET  /api/invoice/{id}/pdf      — Serve original uploaded file
    DELETE /api/invoice/{id}        — Delete a result
    POST /api/invoice/{id}/correct  — Submit HITL correction
    POST /api/vendor/register       — Register a new vendor
    GET  /api/vendors               — List all registered vendors
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
from fastapi import FastAPI, File, HTTPException, UploadFile
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

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Invoice RPA API",
    description="Intelligent Accounts Payable Invoice Extraction",
    version="1.0.0",
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


# ── Helpers ───────────────────────────────────────────────────────────────────

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


# ── Pydantic request models ───────────────────────────────────────────────────

class CorrectionRequest(BaseModel):
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    po_number: Optional[str] = None
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    tax_rate: Optional[float] = None
    discount: Optional[float] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    corrected_by: Optional[str] = "human_reviewer"
    notes: Optional[str] = None


class VendorRequest(BaseModel):
    name: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/invoice/process")
async def process_invoice_endpoint(file: UploadFile = File(...)):
    """Upload and process an invoice file through the full 6-step pipeline."""
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}"
        )

    # Save uploaded file
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
        return JSONResponse(content=data)

    except Exception as e:
        log.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/invoices")
async def list_invoices(
    route: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List all processed invoices with optional filters."""
    results = _list_results()

    if route:
        results = [r for r in results if r.get("routing", {}).get("route") == route.upper()]
    if status:
        results = [r for r in results if r.get("meta", {}).get("status") == status.upper()]

    total = len(results)
    return {
        "total": total,
        "items": results[offset: offset + limit],
    }


@app.get("/api/invoice/{result_id}")
async def get_invoice(result_id: str):
    """Get a single invoice result by ID."""
    return _get_result(result_id)


@app.delete("/api/invoice/{result_id}")
async def delete_invoice(result_id: str):
    """Delete an invoice result."""
    path = OUTPUT_DIR / f"{result_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    path.unlink()
    return {"deleted": result_id}


@app.post("/api/invoice/{result_id}/correct")
async def correct_invoice(result_id: str, correction: CorrectionRequest):
    """Submit HITL correction for an invoice."""
    data = _get_result(result_id)

    # Apply corrections to invoice fields
    inv = data.get("invoice") or {}
    corrections_applied = {}
    for field, value in correction.dict(exclude_none=True).items():
        if field not in ("corrected_by", "notes") and value is not None:
            inv[field] = value
            corrections_applied[field] = value

    data["invoice"] = inv
    data["routing"]["route"] = "CORRECTED"
    data["routing"]["route_reason"] = f"Manually corrected by {correction.corrected_by}"
    data["_correction"] = {
        "corrected_at": datetime.now().isoformat(),
        "corrected_by": correction.corrected_by,
        "fields_changed": corrections_applied,
        "notes": correction.notes,
    }

    # Save corrected result
    path = OUTPUT_DIR / f"{result_id}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # If vendor name was corrected, register it
    if correction.vendor_name:
        register_vendor(correction.vendor_name)

    return data


@app.get("/api/stats")
async def get_stats():
    """Dashboard statistics — counts, averages, route distribution."""
    results = _list_results()

    total = len(results)
    if total == 0:
        return {
            "total": 0, "auto_post": 0, "soft_review": 0, "manual_review": 0,
            "corrected": 0, "avg_confidence": 0, "success_rate": 0,
            "arithmetic_pass_rate": 0, "recent_7_days": 0,
        }

    route_counts = {"AUTO_POST": 0, "SOFT_REVIEW": 0, "MANUAL_REVIEW": 0, "CORRECTED": 0}
    confidence_sum = 0.0
    success_count = 0
    arith_pass = 0
    recent = 0
    now = datetime.now()

    for r in results:
        route = r.get("routing", {}).get("route", "MANUAL_REVIEW")
        route_counts[route] = route_counts.get(route, 0) + 1

        conf = r.get("confidence", {}).get("overall", 0)
        confidence_sum += conf

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
        "total": total,
        "auto_post": route_counts["AUTO_POST"],
        "soft_review": route_counts["SOFT_REVIEW"],
        "manual_review": route_counts["MANUAL_REVIEW"],
        "corrected": route_counts.get("CORRECTED", 0),
        "avg_confidence": round(confidence_sum / total, 4) if total else 0,
        "success_rate": round(success_count / total, 4) if total else 0,
        "arithmetic_pass_rate": round(arith_pass / total, 4) if total else 0,
        "recent_7_days": recent,
    }


@app.post("/api/vendor/register")
async def register_vendor_endpoint(req: VendorRequest):
    """Register a new vendor in the registry."""
    register_vendor(req.name)
    return {"registered": req.name}


@app.get("/api/vendors")
async def list_vendors():
    """List all registered vendors."""
    store = _load_store()
    return {"vendors": store.get("vendors", [])}


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)