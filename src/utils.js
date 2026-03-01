export function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const objStart = raw.indexOf("{");
    const objEnd = raw.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      return JSON.parse(raw.slice(objStart, objEnd + 1));
    }
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("I couldn't understand the local AI response. Please try again.");
  }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeYear(year) {
  if (year < 100) return 2000 + year;
  return year;
}

export function toISODate(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
