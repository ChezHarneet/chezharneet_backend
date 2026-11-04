#!/usr/bin/env python3
"""Extract the structured scenario sections from the source PDF into an import bundle.
Requires poppler's pdftotext command.
"""
import json
import re
import subprocess
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "A88Il dort.pdf"
OUTPUT = ROOT / "backend/prisma/imports/a88-il-dort.json"
text = subprocess.check_output(["pdftotext", "-layout", str(SOURCE), "-"], text=True)
pages = text.split("\f")


def clean(value: str) -> str:
    value = value.replace("\u200b", "").replace("\u2060", "")
    value = re.sub(r"[\t ]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def flat(value: str) -> str:
    return re.sub(r"\s+", " ", clean(value)).strip()

# Each scenario begins with a guillemet prompt. Some pages finish one scenario
# and begin another, so identify the prompt inside each page rather than treating
# every page as a single record.
page_lines = [[clean(line) for line in page.splitlines() if clean(line)] for page in pages]
flat_lines = []
page_offsets = []
for lines in page_lines:
    page_offsets.append(len(flat_lines))
    flat_lines.extend(lines)

starts = []
seen_prompts_by_page = {}
for page_index, lines in enumerate(page_lines):
    for line_index, line in enumerate(lines):
        if "«" not in line:
            continue
        prompt = flat("\n".join(lines[line_index:line_index + 16]))
        if not re.search(r"(?:(?:vous\s+me\s+)?posez|posez-moi)\s+des questions|vous\s+l'interrogez", prompt, re.I):
            continue
        prompt_match = re.search(r"«\s*(.*?)\s*»", prompt)
        prompt_key = flat(prompt_match.group(1)).casefold() if prompt_match else prompt.casefold()
        page_seen = seen_prompts_by_page.setdefault(page_index, set())
        if prompt_key in page_seen:
            continue
        title_index = line_index - 1
        title_page = page_index
        if title_index < 0:
            title_page -= 1
            if title_page < 0 or not page_lines[title_page]:
                continue
            title_index = len(page_lines[title_page]) - 1
        title = re.sub(r"^(?:\d+\.\s*)", "", page_lines[title_page][title_index]).strip(" ➡​")
        # Reject text-table continuations that happen to precede a quoted sample.
        if not title or len(title) > 150 or title.lower().startswith(("exam ", "lexical", "grammar", "coherence", "cohesion", "interaction", "register", "task ")):
            continue
        absolute_start = page_offsets[title_page] + title_index
        starts.append((absolute_start, title, page_index + 1))
        page_seen.add(prompt_key)

# Remove accidental repeated matches in the same prompt (if a prompt wraps).
starts = sorted({entry[0]: entry for entry in starts}.values())
if not starts:
    raise SystemExit("Could not identify the document's scenario sections")

records = []
for ordinal, (start_line, title, source_page) in enumerate(starts):
    end_line = starts[ordinal + 1][0] if ordinal + 1 < len(starts) else len(flat_lines)
    section = clean("\n".join(flat_lines[start_line:end_line]))

    vocab_at = re.search(r"About the topic\s*[–-]\s*Vocab", section, re.I)
    if not vocab_at:
        vocab_at = re.search(r"About the topic", section, re.I)
    content = section[vocab_at.start():].strip() if vocab_at else ""
    question = section[:vocab_at.start()].strip() if vocab_at else section
    # Keep the original questions and dialogue while stripping repeated title,
    # prompt, and worksheet labels before the actual exercise begins.
    quoted_matches = list(re.finditer(r"«\s*(.*?)\s*»", question, flags=re.S))
    situation = flat(quoted_matches[0].group(1)) if quoted_matches else ""
    if quoted_matches:
        prompt_end = quoted_matches[0].end()
        if len(quoted_matches) > 1 and flat(quoted_matches[1].group(1)).casefold() == flat(quoted_matches[0].group(1)).casefold():
            prompt_end = quoted_matches[1].end()
        question = question[prompt_end:].strip()
    question = re.sub(r"^(?:Page\s*\d+\s*[—-]\s*Questions\s*)?(?:Sujet\s*)?", "", question, flags=re.I).strip()
    slug = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")[:170] or f"scenario-{ordinal + 1}"
    records.append({
        "slug": f"{ordinal + 1:02d}-{slug}",
        "title": title[:300],
        "situation": situation or None,
        "question": question or None,
        "extraInformation": content or None,
        "sourcePages": [source_page],
    })

    if len(situation) > 12000 or len(question) > 12000 or len(content) > 12000:
        raise SystemExit(f"Content exceeds a CMS field limit for scenario: {title}")

# The introductory vocabulary page precedes the first full scenario prompt.
records[0]["extraInformation"] = clean(pages[0]) + "\n\n" + (records[0]["extraInformation"] or "")

bundle = {
    "source": "A88Il dort.pdf",
    "courseSlug": "french-exam",
    "moduleSkill": "SPEAKING",
    "taskType": "TASK2",
    "theme": {"slug": "a88-il-dort-scenarios", "name": "A88 Il dort — scénarios"},
    "topics": records,
}
OUTPUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(records)} scenario records to {OUTPUT}")
print(f"All extracted scenario text: {sum(len(r['question'] or '') + len(r['extraInformation'] or '') for r in records):,} characters")
