"""
Saves InvoiceResult to a JSON file in the outputs/ directory.
"""

from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path

from config.settings import OUTPUT_DIR
from core.models import InvoiceResult


def save_result_json(result: InvoiceResult) -> Path:
    """Serialize InvoiceResult to JSON and save. Returns output path."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = Path(result.file_name).stem
    out_path = OUTPUT_DIR / f"{stem}_{timestamp}_result.json"

    data = _result_to_dict(result)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_path


def _result_to_dict(r: InvoiceResult) -> dict:
    inv = r.invoice
    return {
        "meta": {
            "file_name"       : r.file_name,
            "file_path"       : r.file_name,   # store filename only, not full Windows path
            "processed_at"    : r.processed_at,
            "extraction_model": r.extraction_model,
            "attempts_taken"  : r.attempts_taken,
            "status"          : r.status.value,
        },
        "routing": {
            "route"        : r.route.value,
            "route_reason" : r.route_reason,
        },
        "confidence": {
            "overall"          : r.overall_confidence,
            "completeness"     : r.completeness_score,
            "arithmetic_ok"    : r.arithmetic_ok,
            "arithmetic_detail": r.arithmetic_detail,
            "per_field"        : [
                {
                    "field" : fc.field_name,
                    "score" : fc.score,
                    "label" : fc.label,
                    "reason": fc.reason,
                }
                for fc in r.field_confidences
            ],
        },
        "validation": {
            "passed"        : r.validation_passed,
            "duplicate_flag": r.duplicate_flag,
            "errors"        : r.validation_errors,
            "warnings"      : r.validation_warnings,
        },
        "invoice": {
            "vendor_name"   : inv.vendor_name    if inv else None,
            "vendor_address": inv.vendor_address if inv else None,
            "vendor_tax_id" : inv.vendor_tax_id  if inv else None,
            "invoice_number": inv.invoice_number if inv else None,
            "invoice_date"  : inv.invoice_date   if inv else None,
            "due_date"      : inv.due_date        if inv else None,
            "po_number"     : inv.po_number       if inv else None,
            "payment_terms" : inv.payment_terms   if inv else None,
            "subtotal"      : inv.subtotal        if inv else None,
            "tax_amount"    : inv.tax_amount      if inv else None,
            "tax_rate"      : inv.tax_rate        if inv else None,
            "discount"      : inv.discount        if inv else None,
            "total_amount"  : inv.total_amount    if inv else None,
            "currency"      : inv.currency        if inv else None,
            "line_items"    : [
                {
                    "description": li.description,
                    "quantity"   : li.quantity,
                    "unit_price" : li.unit_price,
                    "amount"     : li.amount,
                }
                for li in (inv.line_items if inv else [])
            ],
        } if inv else None,
        "error": r.error_message or None,
    }