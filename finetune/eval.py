#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate receipt classifier fine-tune.")
    parser.add_argument("--base_model", required=True, help="Base model id/path")
    parser.add_argument("--adapter_path", required=True, help="LoRA adapter path")
    parser.add_argument("--val_file", default="finetune/data/val.jsonl")
    parser.add_argument("--max_new_tokens", type=int, default=80)
    return parser.parse_args()


def safe_json_parse(raw: str):
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start : end + 1])
    return {}


def extract_prompt(text: str):
    marker = "### Response:\n"
    if marker in text:
        return text.split(marker, 1)[0] + marker
    return text


def generate_json(model, tokenizer, prompt, max_new_tokens):
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0], skip_special_tokens=True)
    completion = text[len(prompt) :] if text.startswith(prompt) else text
    return safe_json_parse(completion)


def main():
    args = parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base = AutoModelForCausalLM.from_pretrained(args.base_model, device_map="auto")
    model = PeftModel.from_pretrained(base, args.adapter_path)
    model.eval()

    rows = []
    with Path(args.val_file).open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    if not rows:
        print("No validation rows found.")
        return

    cat_correct = 0
    subcat_correct = 0

    for row in rows:
        pred = generate_json(model, tokenizer, extract_prompt(row["text"]), args.max_new_tokens)
        pred_cat = str(pred.get("category", "")).strip()
        pred_sub = str(pred.get("subcategory", "")).strip()
        gold_cat = str(row.get("target_category", "")).strip()
        gold_sub = str(row.get("target_subcategory", "")).strip()

        if pred_cat.lower() == gold_cat.lower():
            cat_correct += 1
        if pred_sub.lower() == gold_sub.lower():
            subcat_correct += 1

    total = len(rows)
    print(f"Rows: {total}")
    print(f"Category accuracy:    {cat_correct / total:.3f}")
    print(f"Subcategory accuracy: {subcat_correct / total:.3f}")


if __name__ == "__main__":
    main()
