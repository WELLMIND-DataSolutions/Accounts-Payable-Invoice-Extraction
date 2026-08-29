"""
Rich terminal output — prints the full InvoiceResult in a beautiful,
colour-coded format for CLI use.
"""

from __future__ import annotations
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich import box
from rich.rule import Rule
from rich.columns import Columns

from core.models import (
    ConfidenceRoute,
    ExtractionStatus,
    InvoiceResult,
    FieldConfidence,
)

console = Console()


# ── Colour helpers ────────────────────────────────────────────────────────────

def _route_style(route: ConfidenceRoute) -> tuple[str, str]:
    """Returns (icon, rich_style)"""
    return {
        ConfidenceRoute.AUTO_POST    : ("✅", "bold green"),
        ConfidenceRoute.SOFT_REVIEW  : ("⚠️ ", "bold yellow"),
        ConfidenceRoute.MANUAL_REVIEW: ("🔴", "bold red"),
    }[route]


def _status_style(status: ExtractionStatus) -> str:
    return {
        ExtractionStatus.SUCCESS: "green",
        ExtractionStatus.PARTIAL: "yellow",
        ExtractionStatus.FAILED : "red",
    }[status]


def _conf_style(score: float) -> str:
    if score >= 0.95:
        return "green"
    elif score >= 0.80:
        return "yellow"
    else:
        return "red"


def _pct(val: float) -> str:
    return f"{val:.1%}"


def _val(v) -> str:
    return str(v) if v is not None else "[dim]—[/dim]"


# ── Main print function ───────────────────────────────────────────────────────

def print_result(result: InvoiceResult) -> None:
    console.print()
    console.rule("[bold cyan]INVOICE EXTRACTION RESULT[/bold cyan]", style="cyan")

    # ── Header panel ─────────────────────────────────────────────────────────
    route_icon, route_style = _route_style(result.route)
    status_color = _status_style(result.status)

    header_text = Text()
    header_text.append(f"  File        : {result.file_name}\n")
    header_text.append(f"  Processed   : {result.processed_at}\n")
    header_text.append(f"  Model       : {result.extraction_model}  ")
    header_text.append(f"(attempts: {result.attempts_taken})\n")
    header_text.append(f"  Status      : ", style="bold")
    header_text.append(f"{result.status.value}\n", style=status_color)
    header_text.append(f"  Route       : ", style="bold")
    header_text.append(f"{route_icon} {result.route.value}\n", style=route_style)
    header_text.append(f"  Reason      : {result.route_reason}\n", style="dim")

    console.print(Panel(header_text, title="📄 Overview", border_style="cyan"))

    if result.error_message:
        console.print(
            Panel(f"[red]{result.error_message}[/red]",
                  title="❌ Error", border_style="red")
        )
        return

    inv = result.invoice
    if not inv:
        console.print("[red]No invoice data extracted.[/red]")
        return

    # ── Extracted fields ─────────────────────────────────────────────────────
    fields_table = Table(
        box=box.ROUNDED, show_header=True, header_style="bold magenta",
        border_style="bright_black", expand=True,
    )
    fields_table.add_column("Field",         style="bold", width=22)
    fields_table.add_column("Extracted Value", width=38)
    fields_table.add_column("Confidence",    width=12, justify="center")
    fields_table.add_column("Level",         width=8,  justify="center")

    conf_map = {fc.field_name: fc for fc in result.field_confidences}

    invoice_fields = [
        ("vendor_name",     "Vendor Name"),
        ("vendor_address",  "Vendor Address"),
        ("vendor_tax_id",   "Vendor Tax ID"),
        ("invoice_number",  "Invoice Number"),
        ("invoice_date",    "Invoice Date"),
        ("due_date",        "Due Date"),
        ("po_number",       "PO Number"),
        ("payment_terms",   "Payment Terms"),
        ("currency",        "Currency"),
        ("subtotal",        "Subtotal"),
        ("tax_rate",        "Tax Rate"),
        ("tax_amount",      "Tax Amount"),
        ("total_amount",    "Total Amount"),
    ]

    for attr, label in invoice_fields:
        value = getattr(inv, attr, None)
        fc: FieldConfidence | None = conf_map.get(attr)
        score_str = _pct(fc.score) if fc else "—"
        level_str = fc.label if fc else "—"
        score_val = fc.score if fc else 0.0
        style = _conf_style(score_val)

        display_val = _val(value)
        if attr in ("subtotal", "tax_amount", "total_amount") and value is not None:
            display_val = f"{inv.currency or ''} {value:,.2f}".strip()
        if attr == "tax_rate" and value is not None:
            display_val = f"{value:.1%}"

        fields_table.add_row(
            label,
            display_val,
            f"[{style}]{score_str}[/{style}]",
            f"[{style}]{level_str}[/{style}]",
        )

    console.print(Panel(fields_table, title="🔍 Extracted Fields", border_style="magenta"))

    # ── Line items ────────────────────────────────────────────────────────────
    if inv.line_items:
        items_table = Table(
            box=box.SIMPLE_HEAVY, show_header=True, header_style="bold blue",
            border_style="bright_black", expand=True,
        )
        items_table.add_column("#",            width=4,  justify="right")
        items_table.add_column("Description",  width=34)
        items_table.add_column("Qty",          width=8,  justify="right")
        items_table.add_column("Unit Price",   width=12, justify="right")
        items_table.add_column("Amount",       width=12, justify="right")
        items_table.add_column("Arith ✓",      width=8,  justify="center")

        cur = inv.currency or ""
        for i, li in enumerate(inv.line_items, 1):
            arith_ok = li.is_arithmetic_consistent()
            arith_sym = "[green]✓[/green]" if arith_ok else "[red]✗[/red]"
            items_table.add_row(
                str(i),
                li.description,
                str(li.quantity),
                f"{cur} {li.unit_price:,.2f}",
                f"{cur} {li.amount:,.2f}",
                arith_sym,
            )

        console.print(Panel(items_table, title="📦 Line Items", border_style="blue"))

    # ── Arithmetic summary ────────────────────────────────────────────────────
    arith_color = "green" if result.arithmetic_ok else "yellow"
    arith_icon  = "✓" if result.arithmetic_ok else "⚠"
    console.print(
        Panel(
            f"[{arith_color}]{arith_icon} {result.arithmetic_detail}[/{arith_color}]",
            title="🧮 Arithmetic Check",
            border_style=arith_color,
        )
    )

    # ── Confidence summary ────────────────────────────────────────────────────
    conf_color = _conf_style(result.overall_confidence)
    comp_color = _conf_style(result.completeness_score)

    conf_text = (
        f"  Overall Confidence   : [{conf_color}]{_pct(result.overall_confidence)}[/{conf_color}]\n"
        f"  Completeness Score   : [{comp_color}]{_pct(result.completeness_score)}[/{comp_color}]\n"
        f"  Arithmetic OK        : {'[green]Yes[/green]' if result.arithmetic_ok else '[red]No[/red]'}"
    )
    console.print(Panel(conf_text, title="📊 Confidence Summary", border_style="cyan"))

    # ── Validation errors ─────────────────────────────────────────────────────
    if result.validation_errors:
        err_text = "\n".join(f"  ✗ {e}" for e in result.validation_errors)
        console.print(Panel(f"[red]{err_text}[/red]", title="❌ Validation Errors", border_style="red"))

    # ── Validation warnings ───────────────────────────────────────────────────
    if result.validation_warnings:
        warn_text = "\n".join(f"  ⚠  {w}" for w in result.validation_warnings)
        console.print(Panel(f"[yellow]{warn_text}[/yellow]", title="⚠️  Warnings", border_style="yellow"))

    # ── Final routing decision ────────────────────────────────────────────────
    route_icon, route_style = _route_style(result.route)
    console.print(
        Panel(
            f"[{route_style}]  {route_icon}  {result.route.value}\n\n"
            f"  {result.route_reason}[/{route_style}]",
            title="🚦 Routing Decision",
            border_style=route_style.replace("bold ", ""),
        )
    )

    console.rule(style="bright_black")
    console.print()
