"""
core/audit_logger.py — Structured Audit Log Writer & Reader
============================================================
Doc reference: §10 Security Architecture — Audit Logging

Every write action in the system appends a JSON record to:
    outputs/audit_log.jsonl

Each record stores:
    timestamp, action, invoice_id, actor, details

Actions tracked:
    invoice_uploaded    — new invoice processed
    invoice_corrected   — HITL field correction applied
    invoice_approved    — reviewer approved invoice
    invoice_rejected    — reviewer rejected invoice
    invoice_deleted     — invoice result deleted
    erp_submission      — posted to ERP system
    vendor_registered   — new vendor added to registry

Usage:
    from core.audit_logger import log_action, get_audit_logs

    log_action("invoice_approved", invoice_id="abc_result", actor="john")
    logs = get_audit_logs()
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from config.settings import OUTPUT_DIR

log = logging.getLogger(__name__)

AUDIT_LOG_FILE = OUTPUT_DIR / "audit_log.jsonl"


def log_action(
    action:     str,
    invoice_id: Optional[str] = None,
    actor:      str = "system",
    details:    Optional[dict] = None,
) -> None:
    """
    Append one audit record to audit_log.jsonl.
    
    Parameters
    ----------
    action     : Action identifier (e.g. "invoice_uploaded")
    invoice_id : ID of the affected invoice result (stem of JSON filename)
    actor      : Who triggered the action ("system", "api", or a username)
    details    : Optional dict with action-specific context
    """
    record = {
        "timestamp":  datetime.now().isoformat(),
        "action":     action,
        "invoice_id": invoice_id,
        "actor":      actor,
        "details":    details or {},
    }

    try:
        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        log.debug(f"[Audit] {action} — invoice={invoice_id} actor={actor}")
    except Exception as e:
        # Audit failure must NEVER crash the main flow
        log.error(f"[Audit] Failed to write log: {e}")


def get_audit_logs(last_n: Optional[int] = None) -> list[dict]:
    """
    Read all audit records from audit_log.jsonl.
    
    Parameters
    ----------
    last_n : If set, return only the last N records (before filtering in the API)

    Returns
    -------
    List of audit record dicts, oldest first.
    """
    if not AUDIT_LOG_FILE.exists():
        return []

    records = []
    try:
        with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError as e:
                        log.warning(f"[Audit] Skipping malformed log line: {e}")
    except Exception as e:
        log.error(f"[Audit] Failed to read log file: {e}")
        return []

    if last_n is not None:
        return records[-last_n:]
    return records


def get_audit_logs_for_invoice(invoice_id: str) -> list[dict]:
    """Return all audit records for a specific invoice ID."""
    return [r for r in get_audit_logs() if r.get("invoice_id") == invoice_id]


def get_audit_summary() -> dict:
    """Return a summary of audit activity."""
    records = get_audit_logs()

    action_counts: dict[str, int] = {}
    actor_counts:  dict[str, int] = {}

    for r in records:
        action = r.get("action", "unknown")
        actor  = r.get("actor",  "unknown")
        action_counts[action] = action_counts.get(action, 0) + 1
        actor_counts[actor]   = actor_counts.get(actor,  0) + 1

    return {
        "total_events":     len(records),
        "action_breakdown": action_counts,
        "actor_breakdown":  actor_counts,
        "oldest_event":     records[0].get("timestamp")  if records else None,
        "newest_event":     records[-1].get("timestamp") if records else None,
    }