"""
Invoice Processing Pipeline — Orchestrator
Ties Steps 1–6 together. Call process_invoice() with a file path.
"""

from __future__ import annotations
import logging
from pathlib import Path

from config.settings import SUPPORTED_FORMATS
from core.models import ExtractedInvoice, ExtractionStatus, InvoiceResult
from core.preprocessor import prepare_image
from core.extractor import extract_invoice
from core.validator import validate_and_score
from core.router import route_invoice

log = logging.getLogger(__name__)


def process_invoice(file_path: str) -> InvoiceResult:
    """
    Full pipeline: ingest → preprocess → extract → validate → route.

    Parameters
    ----------
    file_path : str   Path to invoice file (PDF, PNG, JPG, etc.)

    Returns
    -------
    InvoiceResult with all fields populated.
    """
    path = Path(file_path)
    result = InvoiceResult(
        file_path=str(path.resolve()),
        file_name=path.name,
    )

    # ── Guard: file exists? ──────────────────────────────────────────────────
    if not path.exists():
        result.error_message = f"File not found: {file_path}"
        result.status = ExtractionStatus.FAILED
        log.error(result.error_message)
        return result

    # ── Guard: supported format? ─────────────────────────────────────────────
    if path.suffix.lower() not in SUPPORTED_FORMATS:
        result.error_message = (
            f"Unsupported file format '{path.suffix}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_FORMATS))}"
        )
        result.status = ExtractionStatus.FAILED
        log.error(result.error_message)
        return result

    # ── STEP 2: Preprocess ───────────────────────────────────────────────────
    log.info(f"[Pipeline] Step 2 — Preprocessing '{path.name}'…")
    try:
        base64_image, media_type = prepare_image(str(path))
    except Exception as e:
        result.error_message = f"Preprocessing failed: {e}"
        result.status = ExtractionStatus.FAILED
        log.error(result.error_message, exc_info=True)
        return result

    # ── STEP 3: Extract ──────────────────────────────────────────────────────
    log.info(f"[Pipeline] Step 3 — Extracting invoice data via AI…")
    try:
        invoice: ExtractedInvoice = extract_invoice(base64_image, media_type)
        result.invoice          = invoice
        result.extraction_model = invoice.extraction_model
        result.attempts_taken   = invoice.attempts_taken
    except Exception as e:
        result.error_message = f"Extraction failed: {e}"
        result.status = ExtractionStatus.FAILED
        log.error(result.error_message, exc_info=True)
        return result

    # ── STEP 3b: Fallback compute for missing totals (Fix — Phase 6) ─────────
    # If the AI could not extract total_amount but line items exist, compute it.
    # This handles handwritten invoices where "Balance Due" is missed by the model.
    if invoice.line_items:
        items_sum = round(sum(li.amount for li in invoice.line_items), 2)

        if invoice.subtotal is None and items_sum > 0:
            invoice.subtotal = items_sum
            log.info(f"[Pipeline] Auto-computed subtotal from line items: {items_sum}")

        if invoice.total_amount is None and invoice.subtotal is not None:
            tax = invoice.tax_amount or 0.0
            # If tax_amount missing but tax_rate exists, compute tax_amount too
            if tax == 0.0 and invoice.tax_rate and invoice.tax_rate > 0:
                tax = round(invoice.subtotal * invoice.tax_rate, 2)
                invoice.tax_amount = tax
                log.info(f"[Pipeline] Auto-computed tax_amount: {tax}")
            discount = invoice.discount or 0.0
            invoice.total_amount = round(invoice.subtotal + tax - discount, 2)
            log.info(f"[Pipeline] Auto-computed total_amount: {invoice.total_amount} (subtotal={invoice.subtotal}, tax={tax}, discount={discount})")

    # ── STEP 4: Validate + Confidence Score ──────────────────────────────────
    log.info("[Pipeline] Step 4 — Validating & scoring confidence…")
    try:
        result = validate_and_score(invoice, result)
    except Exception as e:
        result.error_message = f"Validation failed: {e}"
        log.error(result.error_message, exc_info=True)

    # ── STEP 5: Route ────────────────────────────────────────────────────────
    log.info("[Pipeline] Step 5 — Routing based on confidence…")
    try:
        result = route_invoice(result)
    except Exception as e:
        log.error(f"Routing error: {e}", exc_info=True)

    log.info(
        f"[Pipeline] ✓ Done — status={result.status.value}, "
        f"confidence={result.overall_confidence:.1%}, "
        f"route={result.route.value}"
    )
    return result