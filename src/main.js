import { DEFAULT_MODEL } from "./config.js";
import { classifyItems } from "./classification.js";
import { extractTextOnDevice } from "./ocr.js";
import {
  assessReceiptReadability,
  detectReceipt,
  extractReceiptDate,
  getReceiptRejectionHint,
  parseItemsAndAmountsWithAI
} from "./receipt.js";
import { answerSpendQuestion, getCategoryTotalsForMonth } from "./spending.js";
import { loadReceipts, saveReceipts } from "./storage.js";
import { clearOutput, renderItems, renderMonthlyGraph, setStatus } from "./ui.js";
import { fileToDataUrl, generateId } from "./utils.js";

const fileInput = document.getElementById("fileInput");
const startCameraBtn = document.getElementById("startCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const resetBtn = document.getElementById("resetBtn");
const previewImage = document.getElementById("previewImage");
const cameraFeed = document.getElementById("cameraFeed");
const statusEl = document.getElementById("status");
const ocrOutput = document.getElementById("ocrOutput");
const itemsBody = document.getElementById("itemsBody");
const receiptDateMeta = document.getElementById("receiptDateMeta");
const graphRows = document.getElementById("graphRows");
const queryInput = document.getElementById("queryInput");
const queryBtn = document.getElementById("queryBtn");
const queryAnswer = document.getElementById("queryAnswer");
const aiModelInput = document.getElementById("aiModelInput");
const exportJsonlBtn = document.getElementById("exportJsonlBtn");

let mediaStream = null;
let receipts = migrateLegacyCategories(loadReceipts());

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await processImageFile(file);
  fileInput.value = "";
});

startCameraBtn.addEventListener("click", startCamera);
captureBtn.addEventListener("click", captureImageFromCamera);
stopCameraBtn.addEventListener("click", stopCamera);
resetBtn.addEventListener("click", resetScanner);
queryBtn.addEventListener("click", onAskQuery);
exportJsonlBtn.addEventListener("click", exportFineTuneJsonl);
queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void onAskQuery();
});

drawGraph();

async function processImageFile(file) {
  clearOutput({ ocrOutput, itemsBody, receiptDateMeta, statusEl });
  if (!isValidImageFile(file)) {
    setStatus(statusEl, "Please upload an image file (JPG, PNG, or HEIC).", "error");
    return;
  }

  const dataUrl = await fileToDataUrl(file);
  previewImage.src = dataUrl;
  previewImage.classList.remove("hidden");
  cameraFeed.classList.add("hidden");
  await processImageElement(previewImage, new Date());
}

async function processImageElement(imgEl, uploadedAt = new Date()) {
  try {
    // Stage 1: OCR
    setStatus(statusEl, "Running on-device OCR...", "");
    const { text, engine } = await extractTextOnDevice(imgEl, (msg, type) => setStatus(statusEl, msg, type));
    if (!text.trim()) {
      setStatus(statusEl, "I couldn't read any text. Please retake the photo with better lighting and focus.", "error");
      return;
    }

    ocrOutput.textContent = text;

    // Stage 2: OCR readability / occlusion guard
    const readability = assessReceiptReadability(text);
    if (!readability.readable) {
      renderItems(itemsBody, []);
      setStatus(
        statusEl,
        "This receipt looks blocked or blurry. Please retake it with the full receipt visible.",
        "error"
      );
      return;
    }

    // Stage 3: Receipt validation
    const modelName = (aiModelInput.value || DEFAULT_MODEL).trim();
    const receiptCheck = await detectReceipt(text, modelName);
    if (!receiptCheck.isReceipt) {
      renderItems(itemsBody, []);
      const hint = getReceiptRejectionHint(text, receiptCheck.reason || "");
      if (hint.canConfirm) {
        const proceed = window.confirm(
          `${hint.message}\n\nIf this is a receipt, tap OK and I will continue.`
        );
        if (!proceed) {
          setStatus(statusEl, hint.message, "error");
          return;
        }
      } else {
        setStatus(statusEl, hint.message, "error");
        return;
      }
    }

    // Stage 4: Item extraction
    const dateInfo = extractReceiptDate(text, uploadedAt);
    const parsedRows = await parseItemsAndAmountsWithAI(text, modelName);
    if (parsedRows.length === 0) {
      renderItems(itemsBody, []);
      setStatus(
        statusEl,
        "I can see this is a receipt, but I can't clearly read item names and prices yet. Please retake it flat, with better light, and keep your hand away from the text.",
        "error"
      );
      return;
    }

    // Stage 5: Classification
    const classifiedItems = await classifyItems(parsedRows, text, modelName, (msg, type) => setStatus(statusEl, msg, type));

    renderItems(itemsBody, classifiedItems);
    receiptDateMeta.textContent = dateInfo.inferred
      ? `Receipt date: ${dateInfo.display} (I couldn't find the date on the receipt, so I used the upload date.)`
      : `Receipt date: ${dateInfo.display}`;

    const savedReceipt = {
      id: generateId(),
      receiptDate: dateInfo.iso,
      items: classifiedItems,
      createdAt: new Date().toISOString()
    };
    if (isDuplicateReceipt(receipts, savedReceipt)) {
      setStatus(statusEl, "This receipt looks already saved, so I skipped adding a duplicate.", "error");
      return;
    }
    receipts.push(savedReceipt);
    saveReceipts(receipts);
    drawGraph();

    if (dateInfo.inferred) {
      setStatus(
        statusEl,
        "I extracted and saved items and amounts. I couldn't find the receipt date, so I used the upload date.",
        "success"
      );
    } else {
      setStatus(statusEl, "Done. I extracted and saved item names, amounts, and date.", "success");
    }
  } catch (error) {
    setStatus(statusEl, error.message || "Something went wrong while reading this image. Please try again.", "error");
  }
}

function isValidImageFile(file) {
  return Boolean(file && file.type && file.type.startsWith("image/"));
}

async function startCamera() {
  clearOutput({ ocrOutput, itemsBody, receiptDateMeta, statusEl });
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    cameraFeed.srcObject = mediaStream;
    cameraFeed.classList.remove("hidden");
    previewImage.classList.add("hidden");
    captureBtn.classList.remove("hidden");
    stopCameraBtn.classList.remove("hidden");
    setStatus(statusEl, "Camera active. Capture a receipt image.", "");
  } catch {
    setStatus(statusEl, "Camera access is blocked. Please allow camera permission and try again.", "error");
  }
}

async function captureImageFromCamera() {
  if (!mediaStream) {
    setStatus(statusEl, "Camera is not active yet. Please start the camera first.", "error");
    return;
  }

  const track = mediaStream.getVideoTracks()[0];
  const settings = track.getSettings();
  const width = settings.width || 1280;
  const height = settings.height || 720;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(cameraFeed, 0, 0, width, height);

  previewImage.src = canvas.toDataURL("image/jpeg", 0.92);
  previewImage.classList.remove("hidden");
  cameraFeed.classList.add("hidden");
  await processImageElement(previewImage, new Date());
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  cameraFeed.srcObject = null;
  cameraFeed.classList.add("hidden");
  captureBtn.classList.add("hidden");
  stopCameraBtn.classList.add("hidden");
  setStatus(statusEl, "Camera stopped.", "");
}

function resetScanner() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  cameraFeed.srcObject = null;
  cameraFeed.classList.add("hidden");
  captureBtn.classList.add("hidden");
  stopCameraBtn.classList.add("hidden");

  previewImage.src = "";
  previewImage.classList.add("hidden");
  fileInput.value = "";

  clearOutput({ ocrOutput, itemsBody, receiptDateMeta, statusEl });
}

function drawGraph() {
  const totals = getCategoryTotalsForMonth(receipts, new Date());
  renderMonthlyGraph(graphRows, totals);
}

async function onAskQuery() {
  const question = queryInput.value.trim();
  if (!question) {
    queryAnswer.textContent = "Type a question first.";
    return;
  }

  queryAnswer.textContent = "Checking your saved receipts...";
  try {
    const modelName = (aiModelInput.value || DEFAULT_MODEL).trim();
    const answer = await answerSpendQuestion(receipts, question, new Date(), modelName);
    if (!answer) {
      queryAnswer.textContent = "Try asking like: How much did I spend on vegetables last week?";
      return;
    }
    if (answer.needsClarification) {
      queryAnswer.textContent = `${answer.message} Try: ${answer.suggestedQuery}`;
      if (answer.suggestedQuery) queryInput.value = answer.suggestedQuery;
      return;
    }
    queryAnswer.textContent = `Intent: ${answer.interpretedIntent}. Query: ${answer.suggestedQuery}. You spent $${answer.amount.toFixed(
      2
    )} on ${answer.targetLabel} in ${answer.rangeLabel}.`;
  } catch {
    queryAnswer.textContent = "I couldn't process that question right now. Please try again.";
  }
}

function exportFineTuneJsonl() {
  if (!receipts.length) {
    setStatus(statusEl, "No saved receipts yet. Add at least one receipt before exporting.", "error");
    return;
  }

  const lines = [];
  for (const receipt of receipts) {
    for (const item of receipt.items || []) {
      lines.push(
        JSON.stringify({
          instruction:
            "Classify the receipt item into one of: Groceries, Dining, Gas & Fuel, Health, Home, Shopping, Other. Also provide a short subcategory.",
          input: `Item: ${item.item}\nAmount: ${Number(item.amount || 0).toFixed(2)}\nReceiptDate: ${receipt.receiptDate}`,
          output: {
            category: item.category || "Other",
            subcategory: item.subcategory || "General"
          }
        })
      );
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "application/jsonl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-finetune-${new Date().toISOString().slice(0, 10)}.jsonl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus(statusEl, `Exported ${lines.length} training rows as JSONL.`, "success");
}

function migrateLegacyCategories(rows) {
  return (rows || []).map((receipt) => ({
    ...receipt,
    items: (receipt.items || []).map((item) => ({
      ...item,
      category: normalizeCategoryName(item.category, item.subcategory)
    }))
  }));
}

function normalizeCategoryName(value, subcategory) {
  const v = String(value || "").trim();
  const sub = String(subcategory || "").toLowerCase();
  if (v === "Food/Restaurants/Coffee") return "Dining";
  if (v === "Gas") return "Gas & Fuel";
  if (v === "Health") return "Health";
  if (v === "Other" && sub.includes("pharmacy")) return "Health";
  if (
    v === "Other" &&
    ["clothing", "footwear", "apparel", "fashion", "accessories", "baby apparel", "general shopping"].some((k) =>
      sub.includes(k)
    )
  ) {
    return "Shopping";
  }
  if (
    v === "Other" &&
    ["hardware", "tools", "electrical", "plumbing", "paint", "garden", "household"].some((k) => sub.includes(k))
  ) {
    return "Home";
  }
  return v || "Other";
}

function isDuplicateReceipt(existingReceipts, candidate) {
  const candidateFp = buildReceiptFingerprint(candidate);
  return (existingReceipts || []).some((receipt) => buildReceiptFingerprint(receipt) === candidateFp);
}

function buildReceiptFingerprint(receipt) {
  const date = String(receipt?.receiptDate || "").slice(0, 10);
  const itemParts = (receipt?.items || [])
    .map((item) => {
      const name = String(item?.item || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const amount = Number(item?.amount || 0).toFixed(2);
      return `${name}:${amount}`;
    })
    .filter(Boolean)
    .sort();
  return `${date}|${itemParts.join("|")}`;
}
