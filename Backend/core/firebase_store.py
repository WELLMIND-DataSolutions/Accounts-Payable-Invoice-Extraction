"""
Firebase Firestore Store
========================
Drop-in replacement for the local invoice_store.json.
Stores vendors + processed invoices in Firestore.

Collections:
  invoice_rpa/registry → { vendors: [...] }
  invoice_rpa/invoices → { <invoice_number>: <file_name> }
  invoice_results/<doc_id> → full InvoiceResult JSON

Setup:
  1. Place ServiceAccountKey.json in the project root (same folder as api.py).
  2. Add FIREBASE_PROJECT_ID to .env  (optional — auto-read from key file if missing).

All functions mirror the local store API so existing code in validator.py
and api.py works unchanged — just swap the import.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# ── Firestore client (lazy-loaded) ───────────────────────────────────────────
_db = None

def _get_db():
    """Return a Firestore client, initialising once from ServiceAccountKey.json."""
    global _db
    if _db is not None:
        return _db

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        # Look for ServiceAccountKey.json next to api.py / main.py
        key_path = Path(__file__).resolve().parent.parent / "ServiceAccountKey.json"

        if not firebase_admin._apps:
            if key_path.exists():
                cred = credentials.Certificate(str(key_path))
                firebase_admin.initialize_app(cred)
                log.info("[Firebase] Initialised with ServiceAccountKey.json")
            else:
                # Try Application Default Credentials (Cloud Run / GCE)
                firebase_admin.initialize_app()
                log.info("[Firebase] Initialised with Application Default Credentials")

        _db = firestore.client()
        return _db

    except Exception as e:
        log.error(f"[Firebase] Could not initialise Firestore: {e}")
        return None


# ── Collection / document paths ──────────────────────────────────────────────
_COL     = "invoice_rpa"      # top-level collection
_REG_DOC = "registry"         # vendors list
_INV_DOC = "invoices"         # processed invoice numbers
_RESULTS = "invoice_results"  # full result documents


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_store() -> dict:
    """
    Load vendors + processed invoices from Firestore.
    Returns local-style dict: { "vendors": [...], "invoices": {...} }
    Falls back to empty store on any error.
    """
    db = _get_db()
    if db is None:
        return {"vendors": [], "invoices": {}}

    try:
        reg_ref = db.collection(_COL).document(_REG_DOC)
        inv_ref = db.collection(_COL).document(_INV_DOC)

        reg_snap = reg_ref.get()
        inv_snap = inv_ref.get()

        vendors  = reg_snap.to_dict().get("vendors", []) if reg_snap.exists else []
        invoices = inv_snap.to_dict() if inv_snap.exists else {}
        # Firestore document can't have "." in field name — we stored flat keys
        invoices.pop("_exists", None)  # sentinel field cleanup

        return {"vendors": vendors, "invoices": invoices}

    except Exception as e:
        log.error(f"[Firebase] _load_store error: {e}")
        return {"vendors": [], "invoices": {}}


def _save_store(store: dict) -> None:
    """
    Persist vendors + processed invoices to Firestore.
    """
    db = _get_db()
    if db is None:
        log.warning("[Firebase] _save_store skipped — no Firestore connection")
        return

    try:
        db.collection(_COL).document(_REG_DOC).set(
            {"vendors": store.get("vendors", [])}
        )
        inv_data = dict(store.get("invoices", {}))
        if inv_data:
            db.collection(_COL).document(_INV_DOC).set(inv_data)
    except Exception as e:
        log.error(f"[Firebase] _save_store error: {e}")


# ── Vendor registry ───────────────────────────────────────────────────────────

def register_vendor(name: str) -> None:
    """Add a vendor to the persistent Firestore registry."""
    from firebase_admin import firestore as fs
    db = _get_db()
    if db is None:
        log.warning(f"[Firebase] register_vendor skipped — no DB")
        return

    normalized = name.strip().lower()
    try:
        ref = db.collection(_COL).document(_REG_DOC)
        ref.set(
            {"vendors": fs.ArrayUnion([normalized])},
            merge=True,
        )
        log.info(f"[Firebase] Vendor registered: '{name}'")
    except Exception as e:
        log.error(f"[Firebase] register_vendor error: {e}")


# ── Full result storage ───────────────────────────────────────────────────────

def save_result_firestore(result_dict: dict, doc_id: str) -> None:
    """
    Save a full invoice result dict to Firestore invoice_results/<doc_id>.
    Call this AFTER save_result_json() — it's additive, not a replacement.
    """
    db = _get_db()
    if db is None:
        log.warning("[Firebase] save_result_firestore skipped — no DB")
        return

    try:
        db.collection(_RESULTS).document(doc_id).set(result_dict)
        log.info(f"[Firebase] Result saved: invoice_results/{doc_id}")
    except Exception as e:
        log.error(f"[Firebase] save_result_firestore error: {e}")


def get_result_firestore(doc_id: str) -> Optional[dict]:
    """Fetch a single result from Firestore. Returns None if not found."""
    db = _get_db()
    if db is None:
        return None
    try:
        snap = db.collection(_RESULTS).document(doc_id).get()
        if snap.exists:
            return snap.to_dict()
        return None
    except Exception as e:
        log.error(f"[Firebase] get_result_firestore error: {e}")
        return None


def list_results_firestore(limit: int = 50) -> list[dict]:
    """
    List recent invoice results from Firestore (ordered by processed_at desc).
    """
    db = _get_db()
    if db is None:
        return []
    try:
        docs = (
            db.collection(_RESULTS)
            .order_by("meta.processed_at", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        results = []
        for doc in docs:
            d = doc.to_dict()
            d["_id"] = doc.id
            results.append(d)
        return results
    except Exception as e:
        log.error(f"[Firebase] list_results_firestore error: {e}")
        return []


def delete_result_firestore(doc_id: str) -> bool:
    """Delete a result document from Firestore."""
    db = _get_db()
    if db is None:
        return False
    try:
        db.collection(_RESULTS).document(doc_id).delete()
        log.info(f"[Firebase] Deleted: invoice_results/{doc_id}")
        return True
    except Exception as e:
        log.error(f"[Firebase] delete_result_firestore error: {e}")
        return False


def update_result_firestore(doc_id: str, update_dict: dict) -> bool:
    """Partial update (merge) a result in Firestore."""
    db = _get_db()
    if db is None:
        return False
    try:
        db.collection(_RESULTS).document(doc_id).set(update_dict, merge=True)
        log.info(f"[Firebase] Updated: invoice_results/{doc_id}")
        return True
    except Exception as e:
        log.error(f"[Firebase] update_result_firestore error: {e}")
        return False
