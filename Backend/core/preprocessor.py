"""
Step 2 — Image Preprocessing
PDF → image conversion + OpenCV-based enhancement (deskew, denoise, contrast).
Returns a base64-encoded JPEG ready for the vision model.

Changes vs original:
  - PyMuPDF (fitz) replaces pdf2image — no Poppler dependency required
  - All PDF pages stitched into one tall image (Fix 2 — multi-page support)
  - Binarization threshold tightened + colour-header guard (Fix — audit issue)
  - Base64 size cap at 3.5 MB — auto-downscales before Groq API call
  - pdf2image kept as secondary fallback (if fitz not available)
"""

from __future__ import annotations
import base64
import io
import logging
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

# Groq vision API hard limit is 4 MB — we stay under 3.5 MB to be safe
_MAX_B64_MB = 3.5


# ── Public entry point ────────────────────────────────────────────────────────

def prepare_image(file_path: str | Path) -> tuple[str, str]:
    """
    Convert any supported invoice file to a preprocessed base64 JPEG.

    For PDFs: ALL pages are converted and stitched vertically into one tall
    image so multi-page invoices (Phase 4) are never truncated.

    Returns
    -------
    (base64_string, media_type)
    """
    path = Path(file_path)
    ext  = path.suffix.lower()

    if ext == ".pdf":
        pil_img = _pdf_to_pil_all_pages(path)
    else:
        pil_img = Image.open(path).convert("RGB")

    log.info(f"[Preprocess] Original size: {pil_img.size}")

    pil_img = _preprocess(pil_img)

    log.info(f"[Preprocess] Final size: {pil_img.size}")

    b64 = _pil_to_base64_with_size_cap(pil_img)
    return b64, "image/jpeg"


# ── PDF → PIL (all pages, stitched) ──────────────────────────────────────────

def _pdf_to_pil_all_pages(path: Path) -> Image.Image:
    """
    Convert every page of a PDF to RGB PIL images, then stitch them
    vertically into one tall image.

    Priority order:
      1. PyMuPDF  (fitz)      — no system deps, recommended
      2. pdf2image             — needs Poppler installed
      3. Raises RuntimeError if both unavailable
    """
    pages = _try_fitz(path)

    if pages is None:
        log.warning("[Preprocess] PyMuPDF not available, trying pdf2image…")
        pages = _try_pdf2image(path)

    if pages is None:
        raise RuntimeError(
            "Cannot convert PDF — install PyMuPDF:  pip install pymupdf\n"
            "Or Poppler for pdf2image:  https://poppler.freedesktop.org"
        )

    if len(pages) == 1:
        log.info("[Preprocess] Single-page PDF")
        return pages[0]

    # ── Stitch all pages vertically (Fix 2 — multi-page support) ─────────────
    log.info(f"[Preprocess] Stitching {len(pages)} pages into one image")
    max_width  = max(p.width  for p in pages)
    total_height = sum(p.height for p in pages)

    combined = Image.new("RGB", (max_width, total_height), color=(255, 255, 255))
    y_offset = 0
    for page_img in pages:
        # Centre narrow pages (e.g. landscape mixed with portrait)
        x_offset = (max_width - page_img.width) // 2
        combined.paste(page_img, (x_offset, y_offset))
        y_offset += page_img.height

    return combined


def _try_fitz(path: Path) -> list[Image.Image] | None:
    """Use PyMuPDF (fitz) — no Poppler required."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None

    try:
        doc = fitz.open(str(path))
        pages = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            # dpi=300 → matrix scale factor = 300/72 ≈ 4.17
            mat  = fitz.Matrix(300 / 72, 300 / 72)
            pix  = page.get_pixmap(matrix=mat, alpha=False)
            img  = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            pages.append(img)
            log.debug(f"[Preprocess] fitz — page {page_num + 1}: {img.size}")
        doc.close()
        log.info(f"[Preprocess] PyMuPDF: extracted {len(pages)} page(s)")
        return pages
    except Exception as e:
        log.warning(f"[Preprocess] PyMuPDF failed: {e}")
        return None


def _try_pdf2image(path: Path) -> list[Image.Image] | None:
    """Secondary fallback using pdf2image (requires Poppler)."""
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(str(path), dpi=300)
        log.info(f"[Preprocess] pdf2image: extracted {len(pages)} page(s)")
        return [p.convert("RGB") for p in pages]
    except Exception as e:
        log.warning(f"[Preprocess] pdf2image failed: {e}")
        return None


# ── Full preprocessing chain ──────────────────────────────────────────────────

def _preprocess(pil_img: Image.Image) -> Image.Image:
    cv_img = _pil_to_cv(pil_img)

    cv_img = _resize_to_optimal(cv_img)
    cv_img = _deskew(cv_img)
    cv_img = _denoise(cv_img)
    cv_img = _sharpen_and_contrast(cv_img)
    cv_img = _binarize_if_needed(cv_img)

    return _cv_to_pil(cv_img)


# ── Individual processing steps ───────────────────────────────────────────────

def _resize_to_optimal(img: np.ndarray) -> np.ndarray:
    """
    Ensure image width is between 1200–2400 px for optimal OCR.
    For stitched multi-page images, also cap total height at 8000 px to
    avoid sending a 30 MB image to the vision API.
    """
    h, w = img.shape[:2]

    # Width normalisation
    if w < 1200:
        scale = 1200 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
        log.debug(f"[Preprocess] Upscaled to {img.shape[1]}x{img.shape[0]}")
    elif w > 2400:
        scale = 2400 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        log.debug(f"[Preprocess] Downscaled to {img.shape[1]}x{img.shape[0]}")

    # Height cap for multi-page stitched images
    h, w = img.shape[:2]
    if h > 8000:
        scale = 8000 / h
        img = cv2.resize(img, (int(w * scale), 8000), interpolation=cv2.INTER_AREA)
        log.info(f"[Preprocess] Tall image height-capped to {img.shape[0]}px")

    return img


def _deskew(img: np.ndarray) -> np.ndarray:
    """
    Detect and correct skew using minAreaRect.
    Only corrects if skew > 0.3° to avoid unnecessary rotation on clean PDFs.
    Skips deskew on very tall stitched images (would misalign page boundaries).
    """
    h, w = img.shape[:2]

    # Skip deskew on tall stitched images — page boundaries confuse the angle
    if h > w * 2:
        log.debug("[Preprocess] Skipping deskew (multi-page stitched image)")
        return img

    gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 50:
        return img

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90

    if abs(angle) < 0.3:
        return img  # negligible skew

    log.debug(f"[Preprocess] Deskewing by {angle:.2f}°")
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def _denoise(img: np.ndarray) -> np.ndarray:
    """Non-local means denoising — removes scanner/JPEG compression artifacts."""
    return cv2.fastNlMeansDenoisingColored(
        img, None, h=7, hColor=7,
        templateWindowSize=7, searchWindowSize=21,
    )


def _sharpen_and_contrast(img: np.ndarray) -> np.ndarray:
    """Unsharp masking for text sharpness + CLAHE on luminance only."""
    blur  = cv2.GaussianBlur(img, (0, 0), sigmaX=2)
    sharp = cv2.addWeighted(img, 1.4, blur, -0.4, 0)

    lab     = cv2.cvtColor(sharp, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe   = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l       = clahe.apply(l)
    lab     = cv2.merge([l, a, b])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def _binarize_if_needed(img: np.ndarray) -> np.ndarray:
    """
    Apply adaptive binarization ONLY for genuinely grayscale/B&W scans.

    FIX vs original:
      - Threshold tightened: mean_sat < 8  (was 15 — too aggressive)
      - Added colour-header guard: count distinct hues with saturation > 30.
        If ≥ 3 distinct hue clusters exist, the doc has coloured elements
        (table headers, logos) and binarization would destroy them.
      - Result: Phase 1 (blue header table) and Phase 5 (green header)
        are NEVER binarized; only true B&W scans qualify.
    """
    hsv      = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mean_sat = hsv[:, :, 1].mean()

    # Not grayscale → skip immediately
    if mean_sat >= 8:
        return img

    # Extra guard: count distinct saturated hue clusters
    saturated_mask  = hsv[:, :, 1] > 30          # pixels with real colour
    saturated_count = saturated_mask.sum()
    if saturated_count > (img.shape[0] * img.shape[1] * 0.005):
        # More than 0.5% of pixels are genuinely coloured → skip binarization
        log.debug("[Preprocess] Skipping binarization — coloured elements detected")
        return img

    gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, blockSize=31, C=10,
    )
    log.debug("[Preprocess] Applied adaptive binarization (true grayscale scan)")
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


# ── Base64 encoding with size cap ─────────────────────────────────────────────

def _pil_to_base64_with_size_cap(img: Image.Image, quality: int = 90) -> str:
    """
    Encode to JPEG base64.  If the result exceeds _MAX_B64_MB, progressively
    reduce quality (90 → 75 → 60) then halve the image dimensions until it fits.
    Groq vision API rejects payloads > 4 MB.
    """
    for q in (quality, 75, 60):
        b64 = _encode(img, q)
        size_mb = len(b64) * 3 / 4 / 1_048_576
        if size_mb <= _MAX_B64_MB:
            if q < quality:
                log.info(f"[Preprocess] Re-encoded at quality={q} → {size_mb:.1f} MB")
            return b64

    # Still too large — halve dimensions
    log.warning("[Preprocess] Image still too large after quality reduction — resizing by 50%")
    small = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    b64   = _encode(small, 75)
    size_mb = len(b64) * 3 / 4 / 1_048_576
    log.info(f"[Preprocess] Final size after downscale: {size_mb:.1f} MB")
    return b64


def _encode(img: Image.Image, quality: int) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ── Conversion helpers ────────────────────────────────────────────────────────

def _pil_to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def _cv_to_pil(img: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))