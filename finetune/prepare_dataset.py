#!/usr/bin/env python3
import argparse
import json
import random
from pathlib import Path


SYSTEM_PROMPT = (
    "You classify receipt items. "
    "Return JSON only with keys: category, subcategory. "
    "Use only allowed labels."
)


CATEGORY_ALIASES = {
    "food/restaurants/coffee": "Dining",
    "gas": "Gas & Fuel",
}

HOME_SUBCATEGORY_NAMES = {
    "hardware",
    "tools",
    "electrical",
    "plumbing",
    "paint",
    "garden",
    "household",
    "general home",
}

SHOPPING_SUBCATEGORY_NAMES = {
    "clothing",
    "baby apparel",
    "footwear",
    "accessories",
    "general shopping",
}


def normalize_category(value: str, subcategory: str = "") -> str:
    v = (value or "").strip()
    mapped = CATEGORY_ALIASES.get(v.lower(), v)
    sub = (subcategory or "").strip().lower()
    if mapped.lower() == "other" and sub in HOME_SUBCATEGORY_NAMES:
        return "Home"
    if mapped.lower() == "other" and sub in SHOPPING_SUBCATEGORY_NAMES:
        return "Shopping"
    return mapped


def make_text(instruction: str, input_text: str, target_json: str) -> str:
    return (
        f"### System:\n{SYSTEM_PROMPT}\n\n"
        f"### Instruction:\n{instruction.strip()}\n\n"
        f"### Input:\n{input_text.strip()}\n\n"
        f"### Response:\n{target_json}"
    )


def load_rows(path: Path):
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON at line {line_num}: {e}") from e

            instruction = str(obj.get("instruction", "")).strip()
            input_text = str(obj.get("input", "")).strip()
            output = obj.get("output", {})
            if not isinstance(output, dict):
                continue

            subcategory = str(output.get("subcategory", "")).strip()
            category = normalize_category(str(output.get("category", "")).strip(), subcategory)
            if not category or not subcategory:
                continue

            target = {"category": category, "subcategory": subcategory}
            target_json = json.dumps(target, ensure_ascii=False)
            rows.append(
                {
                    "text": make_text(instruction, input_text, target_json),
                    "instruction": instruction,
                    "input": input_text,
                    "target_category": category,
                    "target_subcategory": subcategory,
                    "target_json": target_json,
                }
            )
    return rows


def write_jsonl(path: Path, rows):
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Prepare train/val data for receipt classifier LoRA fine-tuning.")
    parser.add_argument("--input", required=True, help="Path to exported JSONL from app")
    parser.add_argument("--out_dir", default="finetune/data", help="Output directory")
    parser.add_argument("--val_ratio", type=float, default=0.2, help="Validation split ratio")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    in_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = load_rows(in_path)
    if len(rows) < 20:
        print(f"Warning: only {len(rows)} rows found. Accuracy may be unstable.")

    random.seed(args.seed)
    random.shuffle(rows)

    val_size = max(1, int(len(rows) * args.val_ratio))
    val_rows = rows[:val_size]
    train_rows = rows[val_size:]

    write_jsonl(out_dir / "train.jsonl", train_rows)
    write_jsonl(out_dir / "val.jsonl", val_rows)

    print(f"Prepared dataset in {out_dir}")
    print(f"Train rows: {len(train_rows)}")
    print(f"Val rows:   {len(val_rows)}")


if __name__ == "__main__":
    main()
