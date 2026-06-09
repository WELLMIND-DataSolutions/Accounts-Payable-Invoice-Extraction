#!/usr/bin/env python3
"""
Invoice Extraction System — Main CLI Entry Point
================================================
Run this file:
    python main.py

It will:
1. Check for GROQ_API_KEY in .env
2. Prompt you to enter or drag-drop an invoice file path
3. Run the full 6-step pipeline
4. Print colour-coded results to terminal
5. Save a JSON result file to outputs/
"""

import logging
import sys
from pathlib import Path

# ── Make sure project root is on sys.path ────────────────────────────────────
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.text import Text

from config.settings import GROQ_API_KEY, SUPPORTED_FORMATS
from core.pipeline import process_invoice
from utils.printer import print_result
from utils.output_writer import save_result_json

console = Console()

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(ROOT / "outputs" / "pipeline.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


def _print_banner() -> None:
    banner = Text()
    banner.append("\n██╗███╗   ██╗██╗   ██╗ ██████╗ ██╗ ██████╗███████╗\n", style="cyan")
    banner.append("  ██║████╗  ██║██║   ██║██╔═══██╗██║██╔════╝██╔════╝\n", style="cyan")
    banner.append("  ██║██╔██╗ ██║██║   ██║██║   ██║██║██║     █████╗\n",   style="cyan")
    banner.append("  ██║██║╚██╗██║╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝\n",   style="cyan")
    banner.append("  ██║██║ ╚████║ ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗\n", style="cyan")
    banner.append("  ╚═╝╚═╝  ╚═══╝  ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝\n", style="cyan")
    banner.append("\n  Intelligent RPA — Accounts Payable Invoice Extraction\n", style="bold white")
    banner.append("  Powered by Qwen2.5-VL via Groq (free) + Ollama fallback\n", style="dim")
    console.print(banner)


def _check_api_key() -> None:
    if not GROQ_API_KEY:
        console.print(
            Panel(
                "[yellow]⚠  GROQ_API_KEY not found in .env file.\n\n"
                "  Steps to fix:\n"
                "  1. Create a file named [bold].env[/bold] in the same folder as main.py\n"
                "  2. Add this line:  GROQ_API_KEY=your_key_here\n"
                "  3. Get a free key at: https://console.groq.com\n\n"
                "  Continuing with Ollama local fallback only…[/yellow]",
                title="⚠  API Key Missing",
                border_style="yellow",
            )
        )
    else:
        masked = GROQ_API_KEY[:8] + "••••••••" + GROQ_API_KEY[-4:]
        console.print(f"  [green]✓[/green]  Groq API key loaded: [dim]{masked}[/dim]")


def _ask_for_file() -> Path:
    """Interactive file picker — keeps asking until valid file is given."""
    console.print()
    console.print(
        Panel(
            f"  Supported formats: [cyan]{', '.join(sorted(SUPPORTED_FORMATS))}[/cyan]\n\n"
            "  Enter the [bold]full path[/bold] to your invoice file.\n"
            "  (You can drag & drop the file into the terminal on most systems)",
            title="📂 Upload Invoice",
            border_style="blue",
        )
    )

    while True:
        raw = Prompt.ask("\n  [bold cyan]Invoice file path[/bold cyan]").strip().strip('"').strip("'")

        if not raw:
            console.print("  [red]Path cannot be empty. Please try again.[/red]")
            continue

        path = Path(raw)

        if not path.exists():
            console.print(f"  [red]✗  File not found: '{path}'. Please check the path.[/red]")
            continue

        if not path.is_file():
            console.print(f"  [red]✗  '{path}' is a directory, not a file.[/red]")
            continue

        if path.suffix.lower() not in SUPPORTED_FORMATS:
            console.print(
                f"  [red]✗  Format '{path.suffix}' not supported.[/red] "
                f"Supported: [cyan]{', '.join(sorted(SUPPORTED_FORMATS))}[/cyan]"
            )
            continue

        # File size check (warn if > 20MB)
        size_mb = path.stat().st_size / 1_048_576
        if size_mb > 20:
            console.print(
                f"  [yellow]⚠  File is {size_mb:.1f} MB — processing may be slow.[/yellow]"
            )

        console.print(f"\n  [green]✓[/green]  File accepted: [bold]{path.name}[/bold] ({size_mb:.2f} MB)")
        return path


def _run_pipeline(file_path: Path) -> None:
    console.print()
    console.print(
        Panel(
            f"  [cyan]Running 6-step pipeline on:[/cyan] [bold]{file_path.name}[/bold]\n\n"
            "  Step 1 → Invoice ingested\n"
            "  Step 2 → PDF/image preprocessing…\n"
            "  Step 3 → AI extraction (Groq / Ollama)…\n"
            "  Step 4 → Validation & confidence scoring…\n"
            "  Step 5 → Confidence routing…\n"
            "  Step 6 → Feedback loop ready",
            title="⚙  Processing",
            border_style="cyan",
        )
    )

    result = process_invoice(str(file_path))

    # Print rich terminal output
    print_result(result)

    # Save JSON output
    out_path = save_result_json(result)
    console.print(
        f"  [green]✓[/green]  JSON result saved → [bold]{out_path}[/bold]\n"
    )


def _ask_process_another() -> bool:
    answer = Prompt.ask(
        "\n  Process another invoice?",
        choices=["y", "n"],
        default="n",
    )
    return answer.lower() == "y"


def main() -> None:
    _print_banner()
    _check_api_key()

    while True:
        file_path = _ask_for_file()
        _run_pipeline(file_path)

        if not _ask_process_another():
            console.print("\n  [dim]Exiting. Goodbye![/dim]\n")
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n\n  [yellow]Interrupted by user.[/yellow]\n")
        sys.exit(0)
