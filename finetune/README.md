# Receipt Model Fine-Tuning (Categories + Subcategories)

This folder gives you a practical LoRA fine-tuning pipeline for your receipt app.

## Goal
Train a local model to output:

```json
{"category":"Groceries","subcategory":"Vegetables"}
```

for each extracted item line.

## 1) Export labeled data from app
In the app UI, click `Export Fine-tune JSONL`.

That file is your labeled source data.

## 2) Prepare train/validation files
```bash
cd /Users/mona/Desktop/Instalili
python3 finetune/prepare_dataset.py \
  --input /path/to/receipt-finetune-YYYY-MM-DD.jsonl \
  --out_dir finetune/data \
  --val_ratio 0.2
```

Output:
- `finetune/data/train.jsonl`
- `finetune/data/val.jsonl`

## 3) Install training deps
Use a virtualenv/conda env with:
- `torch`
- `transformers`
- `datasets`
- `trl`
- `peft`
- `bitsandbytes`
- `accelerate`

## 4) Train LoRA adapter
Example:
```bash
python3 finetune/train_lora.py \
  --model google/gemma-2-2b-it \
  --train_file finetune/data/train.jsonl \
  --val_file finetune/data/val.jsonl \
  --output_dir finetune/out/lora_receipt_cls \
  --epochs 3 \
  --batch_size 4 \
  --grad_accum 4
```

If your setup does not support 4-bit, add:
```bash
--no_4bit
```

## 5) Evaluate
```bash
python3 finetune/eval.py \
  --base_model google/gemma-2-2b-it \
  --adapter_path finetune/out/lora_receipt_cls \
  --val_file finetune/data/val.jsonl
```

## 6) Use in app
After serving your fine-tuned model locally (for example via Ollama/local runtime), put that model name in the app's `Local AI model` field.

## Notes
- Keep categories fixed to: `Groceries`, `Dining`, `Gas & Fuel`, `Health`, `Home`, `Shopping`, `Other`.
- Subcategories can evolve, but keep labels consistent across data.
- Best results come from corrected labels (fix wrong rows before training).
