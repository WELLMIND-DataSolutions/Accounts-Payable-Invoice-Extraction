"""
core/erp_integration.py — ERP Integration Service
===================================================
Doc reference: §3.4 ERP Integration Service, §8 ERP Integration Strategy

Supported ERP systems:
  mock        — Simulated response (always used in demo/dev mode)
  odoo        — Odoo REST API (requires ODOO_URL + ODOO_API_KEY in .env)
  quickbooks  — QuickBooks Online API (requires QB credentials in .env)
  sap         — SAP stub (placeholder — not yet implemented)

Usage:
    from core.erp_integration import submit_to_erp, get_erp_status

    result = submit_to_erp("mock", invoice_data={...}, invoice_id="abc_result")
    # result = {
    #     "status":     "SUCCESS",
    #     "erp_ref_id": "MOCK-20260612-0001",
    #     "message":    "Invoice posted successfully (mock)"
    # }

Environment Variables (.env):
    # Odoo
    ODOO_URL=https://mycompany.odoo.com
    ODOO_DB=mycompany
    ODOO_USERNAME=admin
    ODOO_API_KEY=your_odoo_api_key

    # QuickBooks
    QB_CLIENT_ID=...
    QB_CLIENT_SECRET=...
    QB_REFRESH_TOKEN=...
    QB_REALM_ID=...
"""

from __future__ import annotations

import logging
import os
import random
import string
from datetime import datetime
from typing import Optional

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC INTERFACE
# ══════════════════════════════════════════════════════════════════════════════

def submit_to_erp(
    erp_system:   str,
    invoice_data: dict,
    invoice_id:   str,
) -> dict:
    """
    Route the invoice to the appropriate ERP integration.
    
    Parameters
    ----------
    erp_system    : "mock" | "odoo" | "quickbooks" | "sap"
    invoice_data  : The invoice dict from the result JSON (result["invoice"])
    invoice_id    : The result ID (used for logging / idempotency)
    
    Returns
    -------
    dict with keys:
        status      : "SUCCESS" | "FAILED" | "PENDING"
        erp_ref_id  : ERP-assigned reference number (if successful)
        message     : Human-readable result message
        raw_response: Full response from the ERP API (if applicable)
    """
    erp = erp_system.lower().strip()
    log.info(f"[ERP] Submitting invoice '{invoice_id}' to '{erp}'")

    dispatchers = {
        "mock":       _submit_mock,
        "odoo":       _submit_odoo,
        "quickbooks": _submit_quickbooks,
        "sap":        _submit_sap,
    }

    dispatcher = dispatchers.get(erp)
    if not dispatcher:
        return {
            "status":  "FAILED",
            "message": f"Unsupported ERP system: '{erp}'. "
                       f"Supported: {', '.join(dispatchers.keys())}",
        }

    try:
        return dispatcher(invoice_data, invoice_id)
    except Exception as e:
        log.error(f"[ERP] Submission error for '{erp}': {e}", exc_info=True)
        return {
            "status":  "FAILED",
            "message": f"ERP submission failed: {str(e)}",
        }


def get_erp_status(erp_system: str, erp_ref_id: str) -> dict:
    """
    Check the live status of a previously submitted invoice in the ERP.
    Currently returns a mock status — real implementations would call
    the ERP API to check the bill/vendor_bill/PO status.
    """
    return {
        "erp_ref_id": erp_ref_id,
        "erp_system": erp_system,
        "status":     "POSTED",
        "checked_at": datetime.now().isoformat(),
        "note":       "Live ERP status check not yet implemented for this system.",
    }


# ══════════════════════════════════════════════════════════════════════════════
# MOCK (Demo / Dev mode)
# ══════════════════════════════════════════════════════════════════════════════

def _submit_mock(invoice_data: dict, invoice_id: str) -> dict:
    """
    Simulate an ERP submission with a realistic mock response.
    Always succeeds — useful for dashboard demonstrations.
    
    Generates a mock ERP reference ID in format: MOCK-YYYYMMDD-XXXX
    """
    date_str  = datetime.now().strftime("%Y%m%d")
    random_id = "".join(random.choices(string.digits, k=4))
    ref_id    = f"MOCK-{date_str}-{random_id}"

    vendor = invoice_data.get("vendor_name", "Unknown Vendor")
    amount = invoice_data.get("total_amount", 0)
    currency = invoice_data.get("currency", "PKR")

    log.info(f"[ERP-Mock] Invoice accepted — ref={ref_id}, vendor={vendor}, amount={currency} {amount}")

    return {
        "status":       "SUCCESS",
        "erp_ref_id":   ref_id,
        "erp_system":   "mock",
        "message":      f"Invoice posted successfully to Mock ERP (ref: {ref_id}). "
                        f"Vendor: {vendor} | Amount: {currency} {amount}",
        "raw_response": {
            "ref_id":     ref_id,
            "vendor":     vendor,
            "amount":     amount,
            "currency":   currency,
            "posted_at":  datetime.now().isoformat(),
            "bill_state": "posted",
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# ODOO (REST API — xmlrpc or JSON-RPC)
# ══════════════════════════════════════════════════════════════════════════════

def _submit_odoo(invoice_data: dict, invoice_id: str) -> dict:
    """
    Post a vendor bill to Odoo using XML-RPC.
    
    Requires environment variables:
        ODOO_URL        e.g. https://mycompany.odoo.com
        ODOO_DB         e.g. mycompany
        ODOO_USERNAME   e.g. admin
        ODOO_API_KEY    Odoo API key (Settings → Users → API Keys)
    
    Doc reference: §3.4 ERP Integration Service — Odoo
    """
    odoo_url  = os.getenv("ODOO_URL", "")
    odoo_db   = os.getenv("ODOO_DB",  "")
    odoo_user = os.getenv("ODOO_USERNAME", "")
    odoo_key  = os.getenv("ODOO_API_KEY", "")

    if not all([odoo_url, odoo_db, odoo_user, odoo_key]):
        return {
            "status":  "FAILED",
            "message": "Odoo not configured. Set ODOO_URL, ODOO_DB, ODOO_USERNAME, "
                       "ODOO_API_KEY in .env file.",
        }

    try:
        import xmlrpc.client

        # ── 1. Authenticate ───────────────────────────────────────────────────
        common  = xmlrpc.client.ServerProxy(f"{odoo_url}/xmlrpc/2/common")
        uid     = common.authenticate(odoo_db, odoo_user, odoo_key, {})
        if not uid:
            return {"status": "FAILED", "message": "Odoo authentication failed."}

        models = xmlrpc.client.ServerProxy(f"{odoo_url}/xmlrpc/2/object")

        # ── 2. Resolve or create vendor (res.partner) ─────────────────────────
        vendor_name = invoice_data.get("vendor_name", "Unknown")
        vendor_ids  = models.execute_kw(
            odoo_db, uid, odoo_key,
            "res.partner", "search",
            [[["name", "ilike", vendor_name]]], {"limit": 1}
        )
        if vendor_ids:
            partner_id = vendor_ids[0]
        else:
            # Create new partner
            partner_id = models.execute_kw(
                odoo_db, uid, odoo_key,
                "res.partner", "create",
                [{"name": vendor_name, "supplier_rank": 1}]
            )

        # ── 3. Build line items ───────────────────────────────────────────────
        line_ids = []
        for li in invoice_data.get("line_items", []):
            line_ids.append((0, 0, {
                "name":      li.get("description", "Service"),
                "quantity":  li.get("quantity",   1),
                "price_unit": li.get("unit_price", 0),
                "account_id": 1,  # Default account — configure per company
            }))

        # Fallback if no line items: create one from total_amount
        if not line_ids:
            line_ids.append((0, 0, {
                "name":       f"Invoice {invoice_data.get('invoice_number', '')}",
                "quantity":   1,
                "price_unit": invoice_data.get("total_amount", 0),
                "account_id": 1,
            }))

        # ── 4. Create vendor bill (account.move) ──────────────────────────────
        bill_vals = {
            "move_type":       "in_invoice",   # Vendor Bill
            "partner_id":      partner_id,
            "invoice_date":    invoice_data.get("invoice_date"),
            "invoice_date_due": invoice_data.get("due_date"),
            "ref":             invoice_data.get("invoice_number"),
            "invoice_line_ids": line_ids,
        }

        bill_id = models.execute_kw(
            odoo_db, uid, odoo_key,
            "account.move", "create", [bill_vals]
        )

        # ── 5. Confirm (post) the bill ────────────────────────────────────────
        models.execute_kw(
            odoo_db, uid, odoo_key,
            "account.move", "action_post", [[bill_id]]
        )

        ref_id = f"ODOO-BILL-{bill_id}"
        log.info(f"[ERP-Odoo] Vendor bill created: id={bill_id}, ref={ref_id}")

        return {
            "status":       "SUCCESS",
            "erp_ref_id":   ref_id,
            "erp_system":   "odoo",
            "message":      f"Vendor bill posted to Odoo (id={bill_id})",
            "raw_response": {"bill_id": bill_id, "partner_id": partner_id},
        }

    except ImportError:
        return {
            "status":  "FAILED",
            "message": "xmlrpc.client is required for Odoo integration (part of Python stdlib).",
        }
    except Exception as e:
        log.error(f"[ERP-Odoo] Error: {e}", exc_info=True)
        return {"status": "FAILED", "message": f"Odoo error: {str(e)}"}


# ══════════════════════════════════════════════════════════════════════════════
# QUICKBOOKS (OAuth2 REST API)
# ══════════════════════════════════════════════════════════════════════════════

def _submit_quickbooks(invoice_data: dict, invoice_id: str) -> dict:
    """
    Create a vendor bill in QuickBooks Online using the QBO REST API.
    
    Requires environment variables:
        QB_CLIENT_ID       App client ID from Intuit Developer
        QB_CLIENT_SECRET   App client secret
        QB_REFRESH_TOKEN   OAuth2 refresh token (long-lived)
        QB_REALM_ID        Company ID from QBO URL
    
    Uses python-quickbooks library if available, otherwise raw requests.
    Doc reference: §3.4 ERP Integration Service — QuickBooks
    """
    client_id    = os.getenv("QB_CLIENT_ID", "")
    client_secret = os.getenv("QB_CLIENT_SECRET", "")
    refresh_token = os.getenv("QB_REFRESH_TOKEN", "")
    realm_id     = os.getenv("QB_REALM_ID", "")

    if not all([client_id, client_secret, refresh_token, realm_id]):
        return {
            "status":  "FAILED",
            "message": "QuickBooks not configured. Set QB_CLIENT_ID, QB_CLIENT_SECRET, "
                       "QB_REFRESH_TOKEN, QB_REALM_ID in .env file.",
        }

    try:
        import requests

        # ── 1. Refresh access token ───────────────────────────────────────────
        token_resp = requests.post(
            "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
            auth=(client_id, client_secret),
            data={
                "grant_type":    "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=15,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        base_url = f"https://quickbooks.api.intuit.com/v3/company/{realm_id}"
        headers  = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        }

        # ── 2. Create Bill object ─────────────────────────────────────────────
        line_items = []
        for li in invoice_data.get("line_items", []):
            line_items.append({
                "DetailType":     "AccountBasedExpenseLineDetail",
                "Amount":         li.get("amount", 0),
                "Description":    li.get("description", ""),
                "AccountBasedExpenseLineDetail": {
                    "AccountRef": {"value": "1"},  # Default expense account
                }
            })

        if not line_items:
            line_items.append({
                "DetailType": "AccountBasedExpenseLineDetail",
                "Amount":     invoice_data.get("total_amount", 0),
                "Description": f"Invoice {invoice_data.get('invoice_number', '')}",
                "AccountBasedExpenseLineDetail": {
                    "AccountRef": {"value": "1"}
                }
            })

        bill_payload = {
            "VendorRef": {"name": invoice_data.get("vendor_name", "Unknown")},
            "TxnDate":   invoice_data.get("invoice_date"),
            "DueDate":   invoice_data.get("due_date"),
            "DocNumber": invoice_data.get("invoice_number"),
            "Line":      line_items,
        }

        bill_resp = requests.post(
            f"{base_url}/bill",
            json={"Bill": bill_payload},
            headers=headers,
            timeout=20,
        )
        bill_resp.raise_for_status()
        bill_data = bill_resp.json()

        bill_id = bill_data.get("Bill", {}).get("Id", "unknown")
        ref_id  = f"QB-BILL-{realm_id}-{bill_id}"

        log.info(f"[ERP-QuickBooks] Bill created: id={bill_id}, ref={ref_id}")

        return {
            "status":       "SUCCESS",
            "erp_ref_id":   ref_id,
            "erp_system":   "quickbooks",
            "message":      f"Bill created in QuickBooks Online (id={bill_id})",
            "raw_response": bill_data,
        }

    except Exception as e:
        log.error(f"[ERP-QuickBooks] Error: {e}", exc_info=True)
        return {"status": "FAILED", "message": f"QuickBooks error: {str(e)}"}


# ══════════════════════════════════════════════════════════════════════════════
# SAP (Stub — not yet implemented)
# ══════════════════════════════════════════════════════════════════════════════

def _submit_sap(invoice_data: dict, invoice_id: str) -> dict:
    """
    SAP integration stub.
    
    Full implementation would use SAP S/4HANA OData APIs or BAPIs via
    pyrfc (SAP RFC connector) or SAP Business Technology Platform APIs.
    
    Requires SOAP/RFC setup which is highly environment-specific.
    Returns PENDING status to indicate the stub is active but not complete.
    """
    log.warning(f"[ERP-SAP] SAP integration not yet implemented for invoice '{invoice_id}'")
    return {
        "status":     "PENDING",
        "erp_ref_id": None,
        "erp_system": "sap",
        "message":    "SAP integration is not yet implemented. "
                      "The invoice has been flagged for manual SAP entry. "
                      "Configure SAP RFC credentials and implement _submit_sap() "
                      "in core/erp_integration.py to enable automatic SAP posting.",
    }