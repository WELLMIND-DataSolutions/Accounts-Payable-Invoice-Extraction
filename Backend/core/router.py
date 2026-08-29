"""
Step 5 — Confidence Routing
Routes processed invoices to: AUTO_POST / SOFT_REVIEW / MANUAL_REVIEW
based on overall confidence threshold.
"""

from __future__ import annotations
import logging

from config.settings import CONFIDENCE_AUTO_POST, CONFIDENCE_SOFT_REVIEW
from core.models import ConfidenceRoute, InvoiceResult

log = logging.getLogger(__name__)


def route_invoice(result: InvoiceResult) -> InvoiceResult:
    """
    Sets result.route and result.route_reason based on confidence + validation.
    Any hard validation errors → force MANUAL_REVIEW regardless of score.
    """
    conf = result.overall_confidence

    # Hard errors always force manual review
    if result.validation_errors:
        result.route = ConfidenceRoute.MANUAL_REVIEW
        result.route_reason = (
            f"Forced MANUAL_REVIEW due to {len(result.validation_errors)} validation "
            f"error(s): {result.validation_errors[0]}"
        )
        log.info(f"[Router] → MANUAL_REVIEW (validation errors)")
        return result

    if conf >= CONFIDENCE_AUTO_POST:
        result.route = ConfidenceRoute.AUTO_POST
        result.route_reason = (
            f"Confidence {conf:.1%} ≥ {CONFIDENCE_AUTO_POST:.0%} threshold. "
            "Safe to auto-post to ERP."
        )
        log.info(f"[Router] → AUTO_POST ({conf:.1%})")

    elif conf >= CONFIDENCE_SOFT_REVIEW:
        result.route = ConfidenceRoute.SOFT_REVIEW
        result.route_reason = (
            f"Confidence {conf:.1%} is between {CONFIDENCE_SOFT_REVIEW:.0%}–"
            f"{CONFIDENCE_AUTO_POST:.0%}. Quick human review recommended."
        )
        log.info(f"[Router] → SOFT_REVIEW ({conf:.1%})")

    else:
        result.route = ConfidenceRoute.MANUAL_REVIEW
        result.route_reason = (
            f"Confidence {conf:.1%} < {CONFIDENCE_SOFT_REVIEW:.0%} threshold. "
            "Full manual review required (HITL)."
        )
        log.info(f"[Router] → MANUAL_REVIEW ({conf:.1%})")

    return result
