import { CATEGORIES } from "./config.js";
import { escapeHtml } from "./utils.js";

export function setStatus(statusEl, message, type) {
  statusEl.textContent = message;
  statusEl.classList.remove("error", "success");
  if (type) statusEl.classList.add(type);
}

export function clearOutput({ ocrOutput, itemsBody, receiptDateMeta, statusEl }) {
  ocrOutput.textContent = "No OCR output yet.";
  itemsBody.innerHTML = "<tr><td colspan=\"4\">No parsed items yet.</td></tr>";
  receiptDateMeta.textContent = "Receipt date: Not available yet.";
  setStatus(statusEl, "Waiting for image...", "");
}

export function renderItems(itemsBody, items) {
  if (!items.length) {
    itemsBody.innerHTML = "<tr><td colspan=\"4\">No parsed items found.</td></tr>";
    return;
  }

  itemsBody.innerHTML = items
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.item)}</td><td>$${row.amount.toFixed(2)}</td><td>${escapeHtml(
          row.subcategory || "General"
        )}</td><td>${escapeHtml(row.category)}</td></tr>`
    )
    .join("");
}

export function renderMonthlyGraph(graphRows, totals) {
  const maxValue = Math.max(...Object.values(totals), 0.01);
  graphRows.innerHTML = CATEGORIES.map((category) => {
    const value = totals[category] || 0;
    const percent = Math.min(100, (value / maxValue) * 100);
    return `
      <div class="graph-row">
        <div class="graph-label">${escapeHtml(category)}</div>
        <div class="graph-track"><div class="graph-fill" style="width:${percent}%;"></div></div>
        <div class="graph-value">$${value.toFixed(2)}</div>
      </div>
    `;
  }).join("");
}
