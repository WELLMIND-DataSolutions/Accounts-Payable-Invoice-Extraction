"""
Run this ONCE to populate the vendor registry from your known vendors.
After this, vendor confidence will jump from 65% → 90% for matched vendors.

Usage:
    python setup_vendor_registry.py

Add more vendors to the KNOWN_VENDORS list below as your system grows.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.validator import register_vendor

KNOWN_VENDORS = [
    # ── From test phases ──────────────────────────────────────────────────────
    "TechNova Solutions Pvt Ltd",  # Phase 1 new vendor
    "Datastream Technologies",     # Phase 2 new vendor
    "Rainbow Office Supplies",     # Phase 3 new vendor
    "Nexus Procurement Services",  # Phase 4 new vendor
    "Al-Hashmi Trading LLC",       # Phase 5
    "Al Rashid Trading LLC",       # Phase 5 OCR variant
    "Rehman Hardware Store",       # Phase 6
    # ── Legacy test vendors ───────────────────────────────────────────────────
    "ABC Electronics Ltd",
    "Al-Faisal Trading Est.",
    "Global Trading Company",
    "TechSupply Corp.",
    "Pakistan Electronics Store",
    "Mega Procurement Services",
    "Office Supplies Hub",
    # ── Add your real production vendors below ────────────────────────────────
    # "Your Vendor Name Here",
]

print("Registering vendors...\n")
for vendor in KNOWN_VENDORS:
    register_vendor(vendor)
    print(f"  ✓  {vendor}")

print(f"\nDone — {len(KNOWN_VENDORS)} vendors registered.")
print("Vendor confidence will now be 90% for matched invoices.")
print("Registry saved to: outputs/invoice_store.json")