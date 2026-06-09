"""
Step 6 — Feedback Loop
Saves HITL corrections to a JSONL file for future fine-tuning.
Each correction = original extraction + human-corrected values.
"""

from __future__ import annotations
import json
import logging
from datetime import datetime
from pathlib import Path

from config.settings import OUTPUT_DIR
from core.models import ExtractedInvoice

log = logging.getLogger(__name__)

FEEDBACK_FILE = OUTPUT_DIR / "hitl_corrections.jsonl"


def save_hitl_correction(
    original: ExtractedInvoice,
    corrected_data: dict,
    invoice_file: str,
    corrected_by: str = "human",
) -> None:
    """
    Append a HITL correction record to the feedback JSONL file.
    corrected_data should be a flat dict of {field_name: corrected_value}.
    """
    record = {
        "timestamp"     : datetime.now().isoformat(),
        "invoice_file"  : invoice_file,
        "corrected_by"  : corrected_by,
        "original"      : _invoice_to_dict(original),
        "corrections"   : corrected_data,
        "model_used"    : original.extraction_model,
    }

    with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    log.info(f"[Feedback] Saved HITL correction for '{invoice_file}' → {FEEDBACK_FILE}")


def load_corrections_summary() -> dict:
    """Return a summary of corrections made so far."""
    if not FEEDBACK_FILE.exists():
        return {"total_corrections": 0, "records": []}

    records = []
    with open(FEEDBACK_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    # Count most frequently corrected fields
    field_counts: dict[str, int] = {}
    for rec in records:
        for field in rec.get("corrections", {}):
            field_counts[field] = field_counts.get(field, 0) + 1

    return {
        "total_corrections": len(records),
        "most_corrected_fields": sorted(
            field_counts.items(), key=lambda x: x[1], reverse=True
        )[:5],
        "records": records,
    }


def _invoice_to_dict(inv: ExtractedInvoice) -> dict:
    return {
        "vendor_name"   : inv.vendor_name,
        "vendor_address": inv.vendor_address,
        "invoice_number": inv.invoice_number,
        "invoice_date"  : inv.invoice_date,
        "due_date"      : inv.due_date,
        "total_amount"  : inv.total_amount,
        "subtotal"      : inv.subtotal,
        "tax_amount"    : inv.tax_amount,
        "currency"      : inv.currency,
        "line_items"    : [
            {
                "description": li.description,
                "quantity"   : li.quantity,
                "unit_price" : li.unit_price,
                "amount"     : li.amount,
            }
            for li in inv.line_items
        ],
    }
