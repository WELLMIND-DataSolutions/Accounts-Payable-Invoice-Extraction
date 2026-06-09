"""
Data models for the invoice extraction pipeline.
All structured outputs are typed dataclasses for safety and IDE support.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


# ── Enums ────────────────────────────────────────────────────────────────────

class ConfidenceRoute(str, Enum):
    AUTO_POST    = "AUTO_POST"      # >= 95% → straight to ERP
    SOFT_REVIEW  = "SOFT_REVIEW"    # 80–95% → quick human glance
    MANUAL_REVIEW = "MANUAL_REVIEW" # < 80%  → full HITL


class ExtractionStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"   # some fields missing
    FAILED  = "FAILED"    # JSON parse failed even after retries


# ── Sub-models ────────────────────────────────────────────────────────────────

@dataclass
class LineItem:
    description : str
    quantity    : float
    unit_price  : float
    amount      : float

    def computed_amount(self) -> float:
        return round(self.quantity * self.unit_price, 2)

    def is_arithmetic_consistent(self) -> bool:
        return abs(self.computed_amount() - self.amount) < 0.02


@dataclass
class FieldConfidence:
    """Per-field confidence score with a human-readable reason."""
    field_name  : str
    score       : float          # 0.0 – 1.0
    reason      : str = ""

    @property
    def label(self) -> str:
        if self.score >= 0.95:
            return "HIGH"
        elif self.score >= 0.80:
            return "MEDIUM"
        else:
            return "LOW"


# ── Main extracted invoice ─────────────────────────────────────────────────

@dataclass
class ExtractedInvoice:
    # Core fields
    vendor_name     : Optional[str]   = None
    vendor_address  : Optional[str]   = None
    vendor_tax_id   : Optional[str]   = None

    invoice_number  : Optional[str]   = None
    invoice_date    : Optional[str]   = None
    due_date        : Optional[str]   = None
    po_number       : Optional[str]   = None
    payment_terms   : Optional[str]   = None

    subtotal        : Optional[float] = None
    tax_amount      : Optional[float] = None
    tax_rate        : Optional[float] = None
    discount        : Optional[float] = None   # discount amount (positive number)
    total_amount    : Optional[float] = None
    currency        : Optional[str]   = None

    line_items      : list[LineItem]  = field(default_factory=list)

    # Meta
    raw_json        : dict            = field(default_factory=dict)
    extraction_model: str             = ""
    attempts_taken  : int             = 1


# ── Final pipeline result ─────────────────────────────────────────────────

@dataclass
class InvoiceResult:
    # Input
    file_path           : str
    file_name           : str
    processed_at        : str = field(default_factory=lambda: datetime.now().isoformat())

    # Extraction
    status              : ExtractionStatus = ExtractionStatus.FAILED
    invoice             : Optional[ExtractedInvoice] = None
    extraction_model    : str = ""
    attempts_taken      : int = 1

    # Validation
    validation_passed   : bool = False
    validation_errors   : list[str] = field(default_factory=list)
    validation_warnings : list[str] = field(default_factory=list)

    # Confidence
    field_confidences   : list[FieldConfidence] = field(default_factory=list)
    overall_confidence  : float = 0.0
    completeness_score  : float = 0.0

    # Routing
    route               : ConfidenceRoute = ConfidenceRoute.MANUAL_REVIEW
    route_reason        : str = ""

    # Arithmetic checks
    arithmetic_ok       : bool = False
    arithmetic_detail   : str = ""

    # Duplicate detection
    duplicate_flag      : bool = False   # True = same invoice# seen before (warning only)

    # Error
    error_message       : str = ""