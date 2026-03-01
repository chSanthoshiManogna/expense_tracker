# PrivateSpend AI

On-device receipt intelligence app for extracting item-level expenses, classifying spend, and answering natural-language spend queries while keeping data local.

## Problem
Manual expense tracking is slow and error-prone. Most apps also send sensitive purchase data to the cloud.

## Solution
PrivateSpend AI scans receipts on-device, extracts item + amount, classifies spend into practical categories/subcategories, stores data locally, and answers questions like:
- `How much did I spend on groceries this month?`
- `How much did I spend on shopping till date?`
- `How much did I spend on vegetables or health, excluding diapers?`

## Tech Stack
- Frontend: HTML, CSS, Vanilla JavaScript (modular `src/*.js`)
- OCR: Browser `TextDetector` with `Tesseract.js` fallback
- Local AI: Ollama-compatible local model endpoint (`http://127.0.0.1:11434/api/generate`)
- Storage: Browser `localStorage`
- Visualization: Custom JS/CSS spend graph

## Core Features
- Image upload + camera capture
- Receipt validation and readability checks
- OCR text extraction on-device
- Item + amount parsing
- Category/subcategory classification (AI-first + rules fallback)
- Duplicate receipt detection
- Auto-save and live spend updates
- Natural-language spend Q&A with typo tolerance, multi-target, exclusion filters, and flexible date ranges

## System Design

### High-Level Architecture
1. `Input Layer`
- Upload image or capture via camera
- Validate image type and basic quality

2. `Document Intelligence Layer`
- Run OCR on-device
- Detect if content is likely a receipt
- Extract candidate item lines and amounts

3. `Classification Layer`
- Use on-device LLM for category/subcategory classification
- Apply deterministic fallback rules for robustness
- Learn from confident predictions via local memory

4. `Persistence Layer`
- Save normalized receipts locally with unique IDs
- Prevent duplicate receipt inserts

5. `Analytics + Query Layer`
- Build live spend totals by category
- Parse user questions (intent/targets/time range/exclusions)
- Return computed totals from local data

### Data Flow
`Image -> OCR -> Receipt Check -> Item/Amount Extraction -> Classification -> Save Local -> Graph + Q&A`

### Data Model (Stored Locally)
Each saved receipt contains:
- `id`
- `receiptDate`
- `items[]`:
  - `item`
  - `amount`
  - `category`
  - `subcategory`
- `createdAt`

### Category Design
Top-level categories:
- Groceries
- Dining
- Gas & Fuel
- Health
- Home
- Shopping
- Other

Example shopping subcategories:
- Clothing
- Baby Apparel
- Footwear
- Accessories
- General Shopping

## Privacy and Offline
- Designed for local-first execution
- OCR and classification run on-device/local endpoint
- Receipt data remains in browser storage unless user exports it
- Works offline once required local model/assets are available

## Future Improvements
- Human-in-the-loop correction UI for low-confidence items
- Confidence score visualization per extracted item
- Lightweight SQLite/WebAssembly storage option
- Optional model fine-tuning workflow with corrected user labels
