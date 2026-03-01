import { STORAGE_KEY } from "./config.js";

export function loadReceipts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveReceipts(receipts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
}
