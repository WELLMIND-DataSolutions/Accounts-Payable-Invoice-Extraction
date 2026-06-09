"""
Central configuration for the Invoice Extraction System.
All thresholds, model names, and environment settings live here.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ── Load .env from project root (same dir as main.py) ──────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# ── API Keys ────────────────────────────────────────────────────────────────
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

# ── Model Config ─────────────────────────────────────────────────────────────
GROQ_VISION_MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct"  # primary
GROQ_FALLBACK_MODEL = "llama-3.2-11b-vision-preview"               # groq fallback
OLLAMA_MODEL        = "qwen2.5vl:2b"                               # local fallback

# ── Confidence Routing Thresholds ───────────────────────────────────────────
CONFIDENCE_AUTO_POST    = 0.95   # >= 95%  → Auto post to ERP
CONFIDENCE_SOFT_REVIEW  = 0.80   # 80–95% → Soft review
# below 80% → Manual HITL review

# ── Extraction Retry Policy ─────────────────────────────────────────────────
MAX_GROQ_RETRIES   = 3
RETRY_DELAY_SEC    = 1.5

# ── Image Preprocessing ─────────────────────────────────────────────────────
IMAGE_MAX_DPI      = 300
IMAGE_MIN_DPI      = 150
SUPPORTED_FORMATS  = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}

# ── Output ───────────────────────────────────────────────────────────────────
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# ── Required invoice fields (for completeness scoring) ───────────────────────
REQUIRED_FIELDS = [
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "total_amount",
    "currency",
    "line_items",
]

OPTIONAL_FIELDS = [
    "vendor_address",
    "vendor_tax_id",
    "due_date",
    "subtotal",
    "tax_amount",
    "tax_rate",
    "po_number",
    "payment_terms",
]
