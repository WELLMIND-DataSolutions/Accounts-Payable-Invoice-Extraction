"""
Step 3 — AI Extraction Engine
Image + schema prompt → structured JSON via Groq API (primary) or Ollama (fallback).
Handles retries, JSON repair, and model switching automatically.
"""

from __future__ import annotations
import json
import logging
import re
import time
from typing import Optional

from config.settings import (
    GROQ_API_KEY,
    GROQ_VISION_MODEL,
    GROQ_FALLBACK_MODEL,
    OLLAMA_MODEL,
    MAX_GROQ_RETRIES,
    RETRY_DELAY_SEC,
)
from core.models import ExtractedInvoice, LineItem

log = logging.getLogger(__name__)

# ── Schema prompt sent to the model ──────────────────────────────────────────

EXTRACTION_PROMPT = """You are a precise invoice data extraction AI.
Analyze the invoice image carefully and extract ALL visible fields.

Return ONLY a valid JSON object — no markdown, no explanation, no extra text.

JSON schema to follow exactly:
{
  "vendor_name":    "string or null",
  "vendor_address": "string or null",
  "vendor_tax_id":  "string or null",
  "invoice_number": "string or null",
  "invoice_date":   "YYYY-MM-DD or null",
  "due_date":       "YYYY-MM-DD or null",
  "po_number":      "string or null",
  "payment_terms":  "string or null",
  "subtotal":       "number or null",
  "tax_amount":     "number or null",
  "tax_rate":       "number or null (percentage as decimal e.g. 0.17 for 17%)",
  "discount":       "number or null (discount as positive number e.g. 50000, NOT negative)",
  "total_amount":   "number or null",
  "currency":       "3-letter ISO code e.g. PKR, USD, SAR or null",
  "line_items": [
    {
      "description": "string",
      "quantity":    "number",
      "unit_price":  "number",
      "amount":      "number"
    }
  ]
}

=== STRICT EXTRACTION RULES ===

GENERAL:
- All numeric values must be plain numbers (no commas, no currency symbols).
- Dates must be in YYYY-MM-DD format. If year is ambiguous use current year.
- If a field is not visible or not applicable, set it to null.
- line_items must be a list even if there is only one item.
- Do NOT include any text outside the JSON object.

CURRENCY (critical — Phase 5 fix):
- Read the currency code EXACTLY as printed on the invoice (SAR, PKR, USD, AED, etc.).
- Do NOT infer currency from the country or language of the document.
- If the invoice shows "SAR" or "ريال" → use "SAR". If it shows "PKR" → use "PKR".
- Never substitute a different currency based on assumption.

ARABIC / RTL / FOREIGN LANGUAGE invoices (critical — Phase 5 fix):
- The invoice may contain Arabic, Urdu, or other RTL text mixed with English.
- Read vendor name carefully from BOTH the Arabic script AND any Latin transliteration.
- If the vendor name is written in Arabic only, transliterate it carefully to English.
- Arabic stylized fonts can distort letters — read each character individually.
- Do NOT skip fields just because they are in Arabic or another language.
- Bilingual labels (e.g. "Invoice No / رقم الفاتورة") refer to the same field — extract once.

LINE ITEMS — hallucination prevention (critical — Phase 6 fix):
- Only extract rows that are clearly product/service entries with a price.
- A valid line item MUST have: a product description AND a unit_price > 0.
- SKIP any row where the description matches an address, city, country, or company header.
  Examples of rows to SKIP: "Metro Supplies Co.", "Hyderabad, Sindh", "Karachi, Pakistan",
  "Bill To:", "Vendor:", "Page 1 of 2", any row with unit_price = 0 and amount = 0.
- If a row has a product description but unit_price is blank/illegible, set unit_price to null
  and amount to null — do NOT default them to 0.
- unit_price must be the PER-UNIT price, NOT the row total. Verify: qty × unit_price ≈ amount.

HANDWRITTEN INVOICES (Phase 6 fix):
- Fields may be filled in pen/ink on a printed template.
- Written values near underlines or blank boxes are the field values.
- "Balance Due" or "Amount Due" fields should be mapped to total_amount.
- Ignore printed watermarks, guidelines, and decorative borders.
- If a handwritten amount is partially illegible, extract what is readable.

TOTALS SECTION:
- subtotal = sum of line items BEFORE tax and BEFORE discount.
- tax_amount = the actual tax value in currency units (NOT the percentage).
- discount = any discount shown (e.g. "Discount: −50,000" → discount = 50000 as positive number).
- total_amount = final amount due = subtotal + tax_amount − discount.
- Formula to verify: subtotal + tax - discount = total_amount.
- If the invoice shows "BALANCE DUE" or "NET PAYABLE" use that as total_amount.
- Do NOT leave total_amount null if a final payable amount is visible anywhere on the invoice.

MULTI-PAGE INVOICES (critical — Phase 4 fix):
- The image may contain multiple pages stitched vertically into one tall image.
- Extract line items from ALL pages — do not stop at the first page boundary.
- GRAND TOTAL rule: ALWAYS use the final grand total from the LAST page.
  Ignore any "Page 1 Subtotal", "Page 1 Total", or intermediate totals.
- Look for: "Grand Total", "GRAND TOTAL", "Total Amount Due", "Combined Subtotal",
  "TOTAL AMOUNT DUE", "Net Payable" — these appear at the bottom of the last page.
- The correct subtotal = sum of ALL line items across ALL pages combined.
- The correct total_amount = grand subtotal + tax from the last page.
- If you see two different "Total" values, always pick the LARGER one at the
  bottom of the image — that is the grand total, never the page-1-only total.
"""


# ── Public entry point ────────────────────────────────────────────────────────

def extract_invoice(base64_image: str, media_type: str = "image/jpeg") -> ExtractedInvoice:
    """
    Try Groq (with retries) → Groq fallback model → Ollama local.
    Returns an ExtractedInvoice dataclass (may be partial on failure).
    """
    # Primary: Groq with main model
    if GROQ_API_KEY:
        result = _try_groq(base64_image, GROQ_VISION_MODEL, media_type)
        if result:
            result.extraction_model = GROQ_VISION_MODEL
            return result

        log.warning("[Extractor] Primary Groq model failed. Trying fallback model…")
        result = _try_groq(base64_image, GROQ_FALLBACK_MODEL, media_type)
        if result:
            result.extraction_model = GROQ_FALLBACK_MODEL
            return result
    else:
        log.warning("[Extractor] No GROQ_API_KEY found. Skipping Groq, using Ollama.")

    # Final fallback: local Ollama
    log.warning("[Extractor] Falling back to local Ollama…")
    result = _try_ollama(base64_image)
    if result:
        result.extraction_model = OLLAMA_MODEL
        return result

    # Complete failure — return empty invoice
    log.error("[Extractor] All extraction attempts failed.")
    inv = ExtractedInvoice()
    inv.extraction_model = "FAILED"
    return inv


# ── Groq extractor ────────────────────────────────────────────────────────────

def _try_groq(base64_image: str, model: str, media_type: str) -> Optional[ExtractedInvoice]:
    try:
        from groq import Groq
    except ImportError:
        log.error("[Extractor] groq package not installed. Run: pip install groq")
        return None

    client = Groq(api_key=GROQ_API_KEY)

    for attempt in range(1, MAX_GROQ_RETRIES + 1):
        try:
            log.info(f"[Extractor] Groq attempt {attempt}/{MAX_GROQ_RETRIES} — model: {model}")

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{base64_image}"
                                },
                            },
                            {
                                "type": "text",
                                "text": EXTRACTION_PROMPT,
                            },
                        ],
                    }
                ],
                max_tokens=2000,
                temperature=0.0,  # deterministic extraction
            )

            raw_text = response.choices[0].message.content.strip()
            log.debug(f"[Extractor] Raw response:\n{raw_text[:500]}")

            invoice = _parse_json_response(raw_text, attempt)
            if invoice:
                invoice.attempts_taken = attempt
                return invoice

        except Exception as e:
            err_str = str(e).lower()
            log.warning(f"[Extractor] Groq attempt {attempt} error: {e}")
            if attempt < MAX_GROQ_RETRIES:
                # Exponential backoff for rate limits (429) — Groq free tier needs 60s+
                if "429" in str(e) or "rate_limit" in err_str or "rate limit" in err_str:
                    wait = 60 * attempt   # 60s, 120s, 180s
                    log.warning(f"[Extractor] Rate limit hit — waiting {wait}s (attempt {attempt})")
                else:
                    wait = RETRY_DELAY_SEC
                log.info(f"[Extractor] Waiting {wait}s before retry…")
                time.sleep(wait)

    return None


# ── Ollama extractor ──────────────────────────────────────────────────────────

def _try_ollama(base64_image: str) -> Optional[ExtractedInvoice]:
    try:
        import requests
    except ImportError:
        log.error("[Extractor] requests package not installed.")
        return None

    for attempt in range(1, MAX_GROQ_RETRIES + 1):
        try:
            log.info(f"[Extractor] Ollama attempt {attempt}/{MAX_GROQ_RETRIES} — model: {OLLAMA_MODEL}")

            payload = {
                "model": OLLAMA_MODEL,
                "prompt": EXTRACTION_PROMPT,
                "images": [base64_image],
                "stream": False,
                "options": {"temperature": 0.0},
            }

            resp = requests.post(
                "http://localhost:11434/api/generate",
                json=payload,
                timeout=120,
            )
            resp.raise_for_status()
            raw_text = resp.json().get("response", "").strip()

            invoice = _parse_json_response(raw_text, attempt)
            if invoice:
                invoice.attempts_taken = attempt
                return invoice

        except Exception as e:
            log.warning(f"[Extractor] Ollama attempt {attempt} error: {e}")
            if attempt < MAX_GROQ_RETRIES:
                time.sleep(RETRY_DELAY_SEC)

    return None


# ── JSON parsing & repair ─────────────────────────────────────────────────────

def _parse_json_response(raw_text: str, attempt: int) -> Optional[ExtractedInvoice]:
    """
    Parse raw model output into ExtractedInvoice.
    Applies progressive repair strategies before giving up.
    """
    cleaned = _clean_json_string(raw_text)

    # Strategy 1: direct parse
    data = _try_json_parse(cleaned)

    # Strategy 2: extract JSON block from surrounding text
    if data is None:
        extracted = _extract_json_block(raw_text)
        if extracted:
            data = _try_json_parse(extracted)

    # Strategy 3: fix common model errors (trailing commas, single quotes)
    if data is None:
        repaired = _repair_json(cleaned)
        data = _try_json_parse(repaired)

    if data is None:
        log.warning(f"[Parser] Attempt {attempt}: Could not parse JSON from response.")
        return None

    return _dict_to_invoice(data)


def _clean_json_string(text: str) -> str:
    """Strip markdown fences and leading/trailing whitespace."""
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    return text.strip()


def _try_json_parse(text: str) -> Optional[dict]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _extract_json_block(text: str) -> Optional[str]:
    """Find the first {...} block in arbitrary text."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return match.group(0) if match else None


def _repair_json(text: str) -> str:
    """Fix the most common model JSON mistakes."""
    # trailing commas before } or ]
    text = re.sub(r",\s*([}\]])", r"\1", text)
    # single quotes → double quotes (naive but handles simple cases)
    text = re.sub(r"(?<![\\])'", '"', text)
    # Python None/True/False → JSON null/true/false
    text = re.sub(r"\bNone\b",  "null",  text)
    text = re.sub(r"\bTrue\b",  "true",  text)
    text = re.sub(r"\bFalse\b", "false", text)
    return text


# ── Dict → dataclass ──────────────────────────────────────────────────────────

def _dict_to_invoice(data: dict) -> ExtractedInvoice:
    """Map raw JSON dict to typed ExtractedInvoice dataclass."""

    def _float(val) -> Optional[float]:
        if val is None:
            return None
        try:
            # Remove commas, currency symbols, spaces
            cleaned = re.sub(r"[^\d.\-]", "", str(val))
            return float(cleaned) if cleaned else None
        except (ValueError, TypeError):
            return None

    def _str(val) -> Optional[str]:
        if val is None or str(val).strip().lower() in ("null", "none", "n/a", ""):
            return None
        return str(val).strip()

    # Parse line items
    raw_items = data.get("line_items") or []
    line_items = []

    # Patterns that indicate a hallucinated / non-product row
    _SKIP_PATTERNS = re.compile(
        r"""(
            \bbill\s*to\b | \bship\s*to\b | \bvendor\b | \bsold\s*to\b |
            \bpage\s*\d+\b | \bsubtotal\b | \btotal\b | \btax\b |
            # city / country names commonly misread as line items
            \bkarachi\b | \blahore\b | \bislamabad\b | \brawalpindi\b |
            \bfaisalabad\b | \bpeshawar\b | \bquetta\b | \bsialkot\b |
            \bhyderabad\b | \bsindh\b | \bpunjab\b | \bpakistan\b |
            \bdubai\b | \babu\s*dhabi\b | \briyadh\b | \bjeddah\b |
            \bksa\b | \buae\b | \bindia\b |
            # address indicators
            \bstreet\b | \bplot\b | \bfloor\b | \bbuilding\b | \bsector\b |
            \bphase\b | \bblock\b | \btown\b | \bindustrial\s*area\b
        )""",
        re.IGNORECASE | re.VERBOSE,
    )

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        desc = _str(item.get("description")) or ""
        qty = _float(item.get("quantity")) or 1.0
        unit_price = _float(item.get("unit_price"))
        amount = _float(item.get("amount"))

        # Skip rows that look like address / header text
        if _SKIP_PATTERNS.search(desc):
            log.debug(f"[Parser] Skipping hallucinated line item: '{desc}'")
            continue

        # Skip rows with no real price data (unit_price=0 AND amount=0)
        if (unit_price is None or unit_price == 0.0) and (amount is None or amount == 0.0):
            log.debug(f"[Parser] Skipping zero-price line item: '{desc}'")
            continue

        li = LineItem(
            description=desc or "—",
            quantity=qty,
            unit_price=unit_price or 0.0,
            amount=amount or 0.0,
        )
        line_items.append(li)

    return ExtractedInvoice(
        vendor_name    = _str(data.get("vendor_name")),
        vendor_address = _str(data.get("vendor_address")),
        vendor_tax_id  = _str(data.get("vendor_tax_id")),
        invoice_number = _str(data.get("invoice_number")),
        invoice_date   = _str(data.get("invoice_date")),
        due_date       = _str(data.get("due_date")),
        po_number      = _str(data.get("po_number")),
        payment_terms  = _str(data.get("payment_terms")),
        subtotal       = _float(data.get("subtotal")),
        tax_amount     = _float(data.get("tax_amount")),
        tax_rate       = _float(data.get("tax_rate")),
        discount       = _float(data.get("discount")),
        total_amount   = _float(data.get("total_amount")),
        currency       = _str(data.get("currency")),
        line_items     = line_items,
        raw_json       = data,
    )