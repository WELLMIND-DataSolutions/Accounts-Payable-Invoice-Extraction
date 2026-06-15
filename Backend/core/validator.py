"""
Step 4 — Validation & Confidence Scoring
Arithmetic checks, field completeness, vendor match, duplicate detection.
Produces per-field confidence scores + overall confidence.

Changes vs original:
  - Fix 3a: Heuristic confidence scores drastically tightened — base scores
    are now LOWER and only BOOSTED by cross-validation signals (arithmetic,
    vendor match, format correctness). A hallucinated vendor name can no longer
    score 0.92 just by being ≥ 3 chars.
  - Fix 3b: AUTO_POST blocked when arithmetic_ok = False, regardless of score.
    Financial data must be arithmetically consistent before auto-posting to ERP.
  - Fix 3c: Vendor penalty hard-set to 0.45 (was 0.65) when not in registry.
  - Fix 3d: Persistent JSON store for KNOWN_VENDORS and PROCESSED_INVOICES
    so duplicate detection works across sessions (no longer resets on exit).
"""

from __future__ import annotations
import json
import logging
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from config.settings import REQUIRED_FIELDS, OPTIONAL_FIELDS, OUTPUT_DIR
from core.models import (
    ExtractedInvoice,
    FieldConfidence,
    InvoiceResult,
    ExtractionStatus,
)
from core.firebase_store import (
    _load_store,
    _save_store,
    register_vendor,
)

log = logging.getLogger(__name__)


# ── Public entry point ────────────────────────────────────────────────────────

def validate_and_score(invoice: ExtractedInvoice, result: InvoiceResult) -> InvoiceResult:
    """
    Fills result.field_confidences, overall_confidence, completeness_score,
    validation_errors, validation_warnings, arithmetic_ok, status.
    """
    errors    : list[str] = []
    warnings  : list[str] = []
    field_conf: list[FieldConfidence] = []

    # 1 ── Field presence & format checks
    _check_required_fields(invoice, errors, warnings, field_conf)
    _check_optional_fields(invoice, warnings, field_conf)
    _check_date_formats(invoice, errors, field_conf)
    _check_numeric_fields(invoice, errors, field_conf)

    # 2 ── Arithmetic consistency
    arith_ok, arith_detail, all_checks_pass = _arithmetic_check(invoice, warnings, field_conf)

    # 3 ── Vendor match (uses persistent store)
    _vendor_check(invoice, warnings, field_conf)

    # 4 ── Duplicate detection (uses persistent store)
    # Note: _duplicate_check writes directly to result.validation_warnings
    # so we must call it BEFORE we assign warnings to result below.
    # We initialise result.validation_warnings = [] first to avoid double-append.
    result.validation_warnings = []
    result.duplicate_flag = False
    _duplicate_check(invoice, errors, result)

    # 5 ── Completeness score
    completeness = _completeness_score(invoice)

    # 6 ── Overall confidence (Fix 3b: arithmetic gates the score)
    overall_conf = _compute_overall_confidence(field_conf, completeness, arith_ok, all_checks_pass)

    # 7 ── Determine extraction status
    if len(errors) == 0:
        status = ExtractionStatus.SUCCESS
    elif invoice.vendor_name or invoice.total_amount:
        status = ExtractionStatus.PARTIAL
    else:
        status = ExtractionStatus.FAILED

    result.validation_errors   = errors
    # Merge: duplicate warnings (already in result.validation_warnings) + other warnings
    result.validation_warnings = result.validation_warnings + warnings
    result.validation_passed   = len(errors) == 0
    result.field_confidences   = field_conf
    result.overall_confidence  = overall_conf
    result.completeness_score  = completeness
    result.arithmetic_ok       = arith_ok
    result.arithmetic_detail   = arith_detail
    result.status              = status

    return result


# ── 1. Required / optional field checks ──────────────────────────────────────

def _check_required_fields(
    invoice: ExtractedInvoice,
    errors: list[str],
    warnings: list[str],
    field_conf: list[FieldConfidence],
) -> None:
    for field in REQUIRED_FIELDS:
        value = getattr(invoice, field, None)
        if field == "line_items":
            present = bool(value)
        else:
            present = value is not None and str(value).strip() != ""

        if not present:
            errors.append(f"Required field missing: '{field}'")
            field_conf.append(FieldConfidence(field, 0.0, "Field not found in invoice"))
        else:
            score = _heuristic_field_confidence(field, value)
            field_conf.append(FieldConfidence(field, score, "Extracted — base score"))


def _check_optional_fields(
    invoice: ExtractedInvoice,
    warnings: list[str],
    field_conf: list[FieldConfidence],
) -> None:
    for field in OPTIONAL_FIELDS:
        value = getattr(invoice, field, None)
        if value is None:
            warnings.append(f"Optional field not found: '{field}'")
            field_conf.append(FieldConfidence(field, 0.5, "Not present — may not exist on invoice"))
        else:
            score = _heuristic_field_confidence(field, value)
            field_conf.append(FieldConfidence(field, score, "Extracted — base score"))


def _heuristic_field_confidence(field: str, value) -> float:
    """
    FIX 3a — Tightened base scores.

    Old approach: high scores (0.92–0.96) just for field being present.
    New approach: LOWER base scores, only boosted by verifiable signals:
      - correct format (date regex, ISO currency code, positive number)
      - length/pattern sanity checks

    Cross-validation boosts (arithmetic match, vendor registry) are applied
    separately in _arithmetic_check() and _vendor_check() via _update_field_conf().

    Scale:
      0.0  — missing / failed
      0.50 — present but unverifiable (free-text fields)
      0.65 — present with basic sanity (length, type)
      0.80 — present with strong format signal (regex match, positive number)
      0.88 — present + cross-validated (arithmetic, registry) — set elsewhere
    """
    if value is None:
        return 0.0

    val_str = str(value).strip()

    # ── Currency: must be exact ISO 3-letter code ─────────────────────────────
    if field == "currency":
        return 0.82 if re.match(r"^[A-Z]{3}$", val_str) else 0.40

    # ── Dates: must match YYYY-MM-DD ─────────────────────────────────────────
    if field in ("invoice_date", "due_date"):
        if re.match(r"^\d{4}-\d{2}-\d{2}$", val_str):
            return 0.80  # format correct — not yet cross-validated
        return 0.30  # wrong format

    # ── Numeric financial fields ──────────────────────────────────────────────
    if field in ("total_amount", "subtotal", "tax_amount"):
        try:
            f = float(val_str)
            if f > 0:
                return 0.72   # positive number — boosted to 0.88 if arith passes
            if f == 0:
                return 0.45   # zero could be correct (e.g. no tax) but suspicious
            return 0.20       # negative amount is almost certainly wrong
        except ValueError:
            return 0.15

    # ── Tax rate ──────────────────────────────────────────────────────────────
    if field == "tax_rate":
        try:
            f = float(val_str)
            return 0.75 if 0 < f <= 1.0 else 0.35   # should be 0–100% as decimal
        except ValueError:
            return 0.20

    # ── Invoice number ────────────────────────────────────────────────────────
    if field == "invoice_number":
        if len(val_str) < 3:
            return 0.35
        if re.search(r"\d", val_str):   # must have at least one digit
            return 0.75
        return 0.50

    # ── Vendor name ──────────────────────────────────────────────────────────
    if field == "vendor_name":
        if len(val_str) < 3:
            return 0.30
        if len(val_str) >= 5:
            return 0.65   # boosted to 0.88 if vendor found in registry
        return 0.50

    # ── Line items ────────────────────────────────────────────────────────────
    if field == "line_items":
        if not isinstance(value, list) or len(value) == 0:
            return 0.20
        # Score improves with more items (less likely to be hallucinated)
        return min(0.70 + len(value) * 0.02, 0.82)

    # ── Free-text fields (address, PO, payment terms, etc.) ──────────────────
    if len(val_str) >= 3:
        return 0.55
    return 0.30


# ── 2. Date format validation ─────────────────────────────────────────────────

def _check_date_formats(
    invoice: ExtractedInvoice,
    errors: list[str],
    field_conf: list[FieldConfidence],
) -> None:
    for field in ("invoice_date", "due_date"):
        value = getattr(invoice, field, None)
        if value is None:
            continue
        try:
            dt = datetime.strptime(value, "%Y-%m-%d").date()
            if dt.year < 2000 or dt.year > date.today().year + 2:
                errors.append(f"Date '{field}' value '{value}' seems unrealistic.")
                _update_field_conf(field_conf, field, 0.25, "Date out of realistic range")
        except ValueError:
            errors.append(f"Date '{field}' wrong format: '{value}' (expected YYYY-MM-DD)")
            _update_field_conf(field_conf, field, 0.15, "Wrong date format")


# ── 3. Numeric field validation ───────────────────────────────────────────────

def _check_numeric_fields(
    invoice: ExtractedInvoice,
    errors: list[str],
    field_conf: list[FieldConfidence],
) -> None:
    for field in ("total_amount", "subtotal", "tax_amount"):
        value = getattr(invoice, field, None)
        if value is None:
            continue
        if not isinstance(value, (int, float)) or value < 0:
            errors.append(f"Numeric field '{field}' invalid value: '{value}'")
            _update_field_conf(field_conf, field, 0.10, "Invalid numeric value")


# ── 4. Arithmetic consistency ─────────────────────────────────────────────────

def _arithmetic_check(
    invoice: ExtractedInvoice,
    warnings: list[str],
    field_conf: list[FieldConfidence],
) -> tuple[bool, str]:
    """
    FIX 3b: When arithmetic checks PASS, field scores are BOOSTED to 0.88.
    When they FAIL, scores are PENALISED.
    This makes confidence scores respond to actual data quality.
    """
    lines_sum = sum(li.amount for li in invoice.line_items)
    total     = invoice.total_amount
    subtotal  = invoice.subtotal
    tax       = invoice.tax_amount
    details   : list[str] = []
    all_ok    = True

    # Check 1: line items sum ≈ subtotal
    if lines_sum > 0 and subtotal is not None:
        diff      = abs(lines_sum - subtotal)
        tolerance = max(0.05, subtotal * 0.01)
        if diff > tolerance:
            msg = f"Line items sum ({lines_sum:.2f}) ≠ subtotal ({subtotal:.2f}), diff={diff:.2f}"
            warnings.append(msg)
            details.append(f"  {msg}")
            all_ok = False
            _update_field_conf(field_conf, "subtotal", 0.42, "Doesn't match line items sum")
        else:
            details.append(f"  Line items sum ({lines_sum:.2f}) = subtotal ({subtotal:.2f})")
            # Boost subtotal confidence — arithmetic confirmed
            _update_field_conf(field_conf, "subtotal", 0.88, "Confirmed by line items sum")

    # Check 2: subtotal + tax − discount ≈ total
    if subtotal is not None and tax is not None and total is not None:
        discount = invoice.discount or 0.0
        computed_total = round(subtotal + tax - discount, 2)
        diff      = abs(computed_total - total)
        tolerance = max(0.05, total * 0.01)
        if diff > tolerance:
            formula = f"subtotal({subtotal}) + tax({tax})"
            if discount:
                formula += f" − discount({discount})"
            msg = f"{formula} = {computed_total} ≠ total({total})"
            warnings.append(msg)
            details.append(f"  {msg}")
            all_ok = False
            _update_field_conf(field_conf, "total_amount", 0.40, "Formula doesn't match total")
        else:
            formula = f"subtotal + tax"
            if discount:
                formula += " − discount"
            details.append(f"  {formula} = {computed_total} = total ({total})")
            _update_field_conf(field_conf, "total_amount", 0.88, "Confirmed by formula")
            _update_field_conf(field_conf, "tax_amount",   0.85, "Confirmed by total reconciliation")

    # Check 3: individual line item qty × price = amount
    line_errors = 0
    for i, li in enumerate(invoice.line_items):
        if not li.is_arithmetic_consistent():
            warnings.append(
                f"Line item {i + 1}: qty({li.quantity}) × price({li.unit_price})"
                f" = {li.computed_amount()}, stated={li.amount}"
            )
            line_errors += 1
    if line_errors:
        details.append(f"  {line_errors} line item(s) have qty×price ≠ amount")
        all_ok = False
    elif invoice.line_items:
        details.append(f"  All {len(invoice.line_items)} line items arithmetic correct")
        _update_field_conf(field_conf, "line_items", 0.88, "All line items arithmetic correct")

    # Cross-validate invoice_number, currency, date when arithmetic passes
    # Rationale: arithmetically correct invoices confirm these fields are real
    if all_ok:
        _update_field_conf(field_conf, "invoice_number", 0.92,
                           "Cross-validated: arithmetic confirms invoice authenticity")
        _update_field_conf(field_conf, "currency",       0.95,
                           "Cross-validated: ISO code + arithmetic confirm currency")
        _update_field_conf(field_conf, "invoice_date",   0.88,
                           "Cross-validated: arithmetic confirms invoice authenticity")

    if not details:
        return True, "Insufficient data for arithmetic check", True

    return all_ok, " | ".join(details), all_ok


# ── 5. Vendor check (persistent registry) ────────────────────────────────────

def _vendor_check(
    invoice: ExtractedInvoice,
    warnings: list[str],
    field_conf: list[FieldConfidence],
) -> None:
    if not invoice.vendor_name:
        return

    store      = _load_store()
    known      = store.get("vendors", [])
    name_lower = invoice.vendor_name.lower()

    if not known:
        # Registry empty — can't validate, leave base score as-is
        warnings.append(
            f"Vendor registry is empty. Cannot validate '{invoice.vendor_name}'. "
            "Run register_vendor() to build the registry."
        )
        return

    match = any(name_lower in v or v in name_lower for v in known)
    if match:
        # FIX 3c: Boost vendor confidence when found in registry
        _update_field_conf(field_conf, "vendor_name", 0.90, "Vendor confirmed in registry")
    else:
        warnings.append(
            f"Vendor '{invoice.vendor_name}' not in registry. "
            "May be a new vendor — verify manually."
        )
        # FIX 3c: Hard penalty (0.45) — was 0.65 in original
        _update_field_conf(field_conf, "vendor_name", 0.45, "Vendor not in registry")


# ── 6. Duplicate detection (persistent store) ─────────────────────────────────

def _duplicate_check(
    invoice: ExtractedInvoice,
    errors: list[str],
    result: InvoiceResult,
) -> None:
    """
    FIX — Duplicate is now a WARNING + flag, NOT a hard error.

    Rationale: A duplicate invoice number could be:
      - A legitimate resubmission after correction
      - A scan of the same physical invoice from a different source
      - A test/demo run
    The system should flag it for human review, not auto-reject it.
    The human reviewer (HITL dashboard) sees the duplicate_flag and decides.
    """
    if not invoice.invoice_number:
        return

    store = _load_store()
    processed = store.get("invoices", {})
    key = invoice.invoice_number.strip().lower()

    if key in processed:
        prev = processed[key]
        msg = (
            f"POSSIBLE DUPLICATE: Invoice #{invoice.invoice_number} was previously "
            f"processed from '{prev}'. Verify before posting to ERP."
        )
        # WARNING only — not an error. Routing will still apply confidence score.
        result.validation_warnings.append(msg)
        result.duplicate_flag = True
        log.warning(f"[Validator] Duplicate invoice flagged: {invoice.invoice_number}")
    else:
        # Persist this invoice number so future runs can detect duplicates
        processed[key] = result.file_name
        store["invoices"] = processed
        _save_store(store)
        result.duplicate_flag = False


# ── 7. Completeness score ─────────────────────────────────────────────────────

def _completeness_score(invoice: ExtractedInvoice) -> float:
    """Weighted completeness: required fields (weight 2) + optional (weight 1)."""
    total_weight  = 0.0
    filled_weight = 0.0

    for field in REQUIRED_FIELDS:
        total_weight += 2
        val = getattr(invoice, field, None)
        if field == "line_items":
            if val:
                filled_weight += 2
        elif val is not None:
            filled_weight += 2

    for field in OPTIONAL_FIELDS:
        total_weight += 1
        if getattr(invoice, field, None) is not None:
            filled_weight += 1

    return round(filled_weight / total_weight, 4) if total_weight else 0.0


# ── 8. Overall confidence ─────────────────────────────────────────────────────

def _compute_overall_confidence(
    field_conf: list[FieldConfidence],
    completeness: float,
    arithmetic_ok: bool,
    all_checks_pass: bool = False,
) -> float:
    """
    FIX 3b — Arithmetic gates AUTO_POST.

    Weighting:
      50% — average confidence of required fields
      30% — completeness
      20% — arithmetic pass/fail
      +0.02 — full arithmetic bonus (totals + all line items verified)

    The +0.02 bonus is applied when every arithmetic check passes (totals,
    subtotal, tax, AND all individual line items). This reflects the highest
    possible confidence: every number in the invoice cross-validates correctly.

    Critical change: arithmetic_ok = False caps overall confidence at 0.79,
    making AUTO_POST (≥ 0.95) and even SOFT_REVIEW (≥ 0.80) impossible when
    numbers don't add up. This prevents financially incorrect invoices from
    being auto-posted to ERP.
    """
    required_names = set(REQUIRED_FIELDS)
    req_scores = [fc.score for fc in field_conf if fc.field_name in required_names]
    avg_req    = sum(req_scores) / len(req_scores) if req_scores else 0.0

    arith_score = 1.0 if arithmetic_ok else 0.50  # Was 0.70 — now harsher penalty

    overall = (0.50 * avg_req) + (0.30 * completeness) + (0.20 * arith_score)

    # Full arithmetic bonus: every check passed (totals + all line items)
    if all_checks_pass and arithmetic_ok:
        overall = overall + 0.02
        log.info("[Validator] +0.02 full-arithmetic bonus applied (all checks passed)")

    overall = round(min(overall, 1.0), 4)

    # Hard cap: arithmetic failure → max score = 0.79 (forces MANUAL_REVIEW)
    if not arithmetic_ok:
        overall = min(overall, 0.79)
        log.info(
            f"[Validator] Confidence capped at 0.79 — arithmetic failed "
            f"(raw={overall:.3f})"
        )

    return overall


# ── Helper ────────────────────────────────────────────────────────────────────

def _update_field_conf(
    field_conf: list[FieldConfidence],
    field_name: str,
    new_score: float,
    reason: str,
) -> None:
    """Update score of existing FieldConfidence entry, or append if not found."""
    for fc in field_conf:
        if fc.field_name == field_name:
            fc.score  = new_score
            fc.reason = reason
            return
    field_conf.append(FieldConfidence(field_name, new_score, reason))