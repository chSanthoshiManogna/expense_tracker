import { DEFAULT_MODEL, OLLAMA_URL } from "./config.js";
import { normalizeYear, safeJsonParse, toISODate } from "./utils.js";

export async function detectReceipt(text, modelName) {
  const heuristic = isLikelyReceipt(text);
  try {
    const aiResult = await detectReceiptWithLocalAI(text, modelName);
    if (typeof aiResult.isReceipt === "boolean") {
      if (!aiResult.isReceipt && heuristic) {
        return {
          isReceipt: true,
          reason: "AI uncertain, but receipt metadata patterns were detected",
          source: "rules-override"
        };
      }
      return {
        isReceipt: aiResult.isReceipt,
        reason: aiResult.reason || "AI classification",
        source: "ai"
      };
    }
  } catch {
    // Fall back to local heuristic.
  }

  return {
    isReceipt: heuristic,
    reason: heuristic ? "Pattern match suggests receipt" : "No receipt-like totals/dates found",
    source: "rules"
  };
}

export function getReceiptRejectionHint(text, reason) {
  const normalized = normalizeForFuzzyMatch(text || "");
  const metadataScore = scoreReceiptMetadata(text);
  const itemPriceCount = countItemPriceLines(text);
  const hasAmount = hasAmountLike(normalized);
  const hasDate = hasDateLike(normalized);

  // Likely a real receipt but partly obstructed/cropped/blurred.
  if (metadataScore >= 2 && (hasAmount || hasDate) && itemPriceCount <= 1) {
    return {
      likelyObstructed: true,
      canConfirm: true,
      message:
        "This looks like a receipt, but part of the text is blocked or unclear. Please retake with the full receipt visible."
    };
  }

  if (reason && reason.toLowerCase().includes("no receipt-like totals/dates")) {
    return {
      likelyObstructed: false,
      canConfirm: false,
      message: "This doesn't look like a receipt. Please upload a clear receipt photo."
    };
  }

  return {
    likelyObstructed: false,
    canConfirm: false,
    message: "I couldn't confirm this as a receipt. Please upload a clearer receipt photo."
  };
}

export function assessReceiptReadability(text) {
  const normalized = (text || "").trim();
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const alnumChars = (normalized.match(/[a-z0-9]/gi) || []).length;
  const noisyChars = (normalized.match(/[^a-z0-9\s$.,:/\-]/gi) || []).length;
  const totalChars = Math.max(normalized.length, 1);
  const noiseRatio = noisyChars / totalChars;
  const itemPriceCount = countItemPriceLines(normalized);

  if (itemPriceCount >= 2) return { readable: true, reason: "enough item-price lines detected" };
  if (alnumChars < 25 && lines.length < 4) {
    return { readable: false, reason: "very little readable text detected" };
  }
  if (noiseRatio > 0.45 && itemPriceCount === 0) {
    return { readable: false, reason: "text appears too noisy/garbled" };
  }
  return { readable: true, reason: "text quality appears acceptable" };
}

function isLikelyReceipt(text) {
  const normalized = normalizeForFuzzyMatch(text);
  const receiptKeywords = ["total", "subtotal", "tax", "receipt", "cash", "visa", "mastercard", "thank you"];
  const hasKeyword = receiptKeywords.some((k) => normalized.includes(k));
  const hasAmount = hasAmountLike(normalized);
  const hasDate = hasDateLike(normalized);
  const itemPriceCount = countItemPriceLines(text);
  const metadataScore = scoreReceiptMetadata(text);

  // Base signal: multiple "item + price" lines should pass even if store name is missing.
  if (itemPriceCount >= 2) return true;
  if (metadataScore >= 4) return true;
  if (metadataScore >= 3 && (hasAmount || hasDate)) return true;
  return (hasKeyword && hasAmount) || (hasAmount && hasDate && itemPriceCount >= 1);
}

async function detectReceiptWithLocalAI(text, modelName) {
  const model = (modelName || DEFAULT_MODEL).trim();
  const payload = {
    model,
    stream: false,
    format: "json",
    prompt: `Decide whether OCR text is from a shopping/transaction receipt.
Return ONLY JSON object:
{"is_receipt": boolean, "confidence": number, "reason": string}
Confidence is 0..1.

Core rule:
- A valid receipt usually has multiple lines that look like "item name + price".
- Store name can be missing and it can still be a receipt.

Positive examples:
1) "BANANA 1.32
MILK 3.49
TOTAL 4.81"
2) "GRAPES GREEN $7.03
PEAS SNOW $3.21
SUBTOTAL 10.24"
3) "Subtotal: 18.91
Total: 18.91
Date: 6/17/2025
Invoice No: 01-06172025
Cashier: Cashier1
Thank You"

Negative examples:
1) "Vacation photo at beach sunset"
2) "Meeting notes for project timeline"
3) "Random product poster with one price but no itemized lines"

OCR text:
${text.slice(0, 3000)}`
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("I couldn't reach the local AI model to verify this receipt.");
    const data = await response.json();
    const parsed = safeJsonParse(data?.response || "{}");
    return {
      isReceipt: Boolean(parsed.is_receipt),
      confidence: Number(parsed.confidence || 0),
      reason: typeof parsed.reason === "string" ? parsed.reason : ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

function countItemPriceLines(text) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let count = 0;
  for (const line of lines) {
    const hasPrice = /(?:\$|usd\s*)?-?\d{1,4}[.,]\d{2}\b/i.test(line);
    const hasLetters = /[a-z]/i.test(line);
    const isSummary = /^(sub)?total|tax|change|cash|card|balance/i.test(line.toLowerCase());
    if (hasPrice && hasLetters && !isSummary) count += 1;
  }
  return count;
}

function scoreReceiptMetadata(text) {
  const normalized = normalizeForFuzzyMatch(text || "");
  const signals = [
    "invoice",
    "order no",
    "cashier",
    "paid",
    "thank you",
    "subtotal",
    "total items",
    "date"
  ];
  return signals.reduce((acc, key) => (normalized.includes(key) ? acc + 1 : acc), 0);
}

function normalizeForFuzzyMatch(text) {
  return String(text)
    .toLowerCase()
    .replaceAll("0", "o")
    .replaceAll("1", "l")
    .replaceAll("5", "s");
}

function hasAmountLike(normalizedText) {
  // Accept one or two decimals, with or without currency symbol.
  if (/(?:\$|usd)?\s?-?\d{1,4}[.,]\d{1,2}\b/i.test(normalizedText)) return true;
  // Also accept totals like "1891" when OCR drops decimal.
  if (/\b(?:total|subtotal|tax)\b[^0-9]{0,6}\d{2,5}\b/i.test(normalizedText)) return true;
  return false;
}

function hasDateLike(normalizedText) {
  return /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/.test(normalizedText);
}

export function parseItemsAndAmounts(text) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/^[|/\\[\]{}()]+/, "").trim();
    if (shouldIgnoreLine(line)) continue;

    const amountInfo = getTrailingAmount(line);
    if (!amountInfo) continue;
    if (amountInfo.value <= 0) continue;

    let item = line.slice(0, amountInfo.index).trim();
    item = item.replace(/[^\w\s&/-]/g, "").replace(/\s{2,}/g, " ");
    if (!item || item.length < 2) continue;
    if (/^\d+([.,]\d+)?\s?(kg|g|lb|ka)$/i.test(item)) continue;
    if (/^(sub)?total|tax|balance|change|card|cash|db subtotal/i.test(item)) continue;
    if (/^special$/i.test(item)) continue;

    parsed.push({ item, amount: amountInfo.value });
  }

  const seen = new Set();
  return parsed.filter((row) => {
    const key = `${row.item.toLowerCase()}|${row.amount.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function parseItemsAndAmountsWithAI(text, modelName) {
  try {
    const aiItems = await extractItemsWithLocalAI(text, modelName);
    if (aiItems.length > 0) return aiItems;
  } catch {
    // Fallback handled below.
  }
  return parseItemsAndAmounts(text);
}

function shouldIgnoreLine(line) {
  const lower = line.toLowerCase();
  if (!line) return true;
  if (lower.includes(" net ") || lower.includes("/kg") || lower.includes("/ka") || lower.includes("/lb")) {
    return true;
  }
  if (lower.includes("loyalty")) return true;
  if (lower.includes("subtotal") || lower.startsWith("total") || lower.startsWith("tax")) return true;
  if (lower === "special") return true;
  return false;
}

function getTrailingAmount(line) {
  const matches = [...line.matchAll(/(?:\$|usd\s*)?-?\d{1,4}[.,]\d{2}\b/gi)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const numeric = last[0].replace(/[^\d,.-]/g, "").replace(",", ".");
  const value = Number.parseFloat(numeric);
  if (Number.isNaN(value)) return null;
  return { value, index: last.index };
}

async function extractItemsWithLocalAI(text, modelName) {
  const model = (modelName || DEFAULT_MODEL).trim();
  const payload = {
    model,
    stream: false,
    format: "json",
    prompt: `Extract ONLY purchased item lines from this receipt OCR text.
Ignore non-item lines such as: subtotal, total, tax, loyalty, discount, coupon, payment, card, cash, change, invoice, order, cashier, thank you, barcode, IDs.
Return ONLY JSON.

Output schema:
[
  {"item":"string","amount":number,"confidence":0.0}
]

Rules:
- amount must be positive
- do not include summary/payment/footer lines
- if unsure, skip the line

OCR text:
${text.slice(0, 5000)}`
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("I couldn't reach the local AI model to extract item lines.");
    const data = await response.json();
    const parsed = safeJsonParse(data?.response || "[]");

    if (Array.isArray(parsed)) return normalizeAiItems(parsed);
    if (parsed && Array.isArray(parsed.items)) return normalizeAiItems(parsed.items);
    throw new Error("I couldn't understand the local AI response for item extraction.");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAiItems(rows) {
  const out = [];
  const seen = new Set();

  for (const row of rows || []) {
    const rawItem = String(row?.item || row?.name || row?.item_name || "").trim();
    const item = rawItem.replace(/[^\w\s&/-]/g, "").replace(/\s{2,}/g, " ").trim();
    if (!item || item.length < 2) continue;
    if (shouldIgnoreLine(item)) continue;
    if (/^(sub)?total|tax|balance|change|card|cash|db subtotal/i.test(item)) continue;
    if (/^special$/i.test(item)) continue;

    const amountValue = parseAmountValue(row?.amount ?? row?.price);
    if (!Number.isFinite(amountValue) || amountValue <= 0) continue;

    const key = `${item.toLowerCase()}|${amountValue.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ item, amount: amountValue });
  }

  return out;
}

function parseAmountValue(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? NaN : parsed;
}

export function extractReceiptDate(text, fallbackDate = new Date()) {
  const uploadDate = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  const patterns = [/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/, /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let year;
    let month;
    let day;

    if (pattern === patterns[0]) {
      year = Number.parseInt(match[1], 10);
      month = Number.parseInt(match[2], 10);
      day = Number.parseInt(match[3], 10);
    } else {
      const a = Number.parseInt(match[1], 10);
      const b = Number.parseInt(match[2], 10);
      year = normalizeYear(Number.parseInt(match[3], 10));
      if (a > 12) {
        day = a;
        month = b;
      } else {
        month = a;
        day = b;
      }
    }

    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) break;
    return {
      iso: toISODate(parsed),
      display: parsed.toLocaleDateString(),
      inferred: false
    };
  }

  return {
    iso: toISODate(uploadDate),
    display: uploadDate.toLocaleDateString(),
    inferred: true
  };
}
