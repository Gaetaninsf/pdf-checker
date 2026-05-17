from __future__ import annotations

from pathlib import Path
import re
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
IGNORE_DIRS = {
    ".git",
    ".next",
    ".venv",
    "__pycache__",
    "node_modules",
}
IGNORE_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".ico",
    ".lock",
}
PATTERNS = {
    "openai_key": re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "google_api_key": re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"),
    "slack_token": re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b"),
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "anthropic_key": re.compile(r"\bsk-ant-[a-zA-Z0-9\-_]{20,}\b"),
    "db_connection_string": re.compile(r"postgresql://[^@\s]+:[^@\s]+@"),
}


def should_scan(path: Path) -> bool:
    if any(part in IGNORE_DIRS for part in path.parts):
        return False
    if path.suffix.lower() in IGNORE_SUFFIXES:
        return False
    return path.is_file()


def main() -> int:
    findings: list[str] = []
    for path in REPO_ROOT.rglob("*"):
        if not should_scan(path):
            continue

        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        for line_number, line in enumerate(text.splitlines(), start=1):
            for name, pattern in PATTERNS.items():
                if pattern.search(line):
                    findings.append(f"{path.relative_to(REPO_ROOT)}:{line_number} matched {name}")

    if findings:
        print("Potential secrets detected:")
        for finding in findings:
            print(f"  - {finding}")
        print("")
        print("If any value is real, rotate it immediately and move it into the correct secret store.")
        return 1

    print("No high-signal secret patterns detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
