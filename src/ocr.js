export async function extractTextOnDevice(imageSource, setStatus) {
  if ("TextDetector" in window) {
    const detector = new window.TextDetector();
    const blocks = await detector.detect(imageSource);
    const text = blocks.map((b) => b.rawValue || "").join("\n").trim();
    return { text, engine: "TextDetector" };
  }

  if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
    throw new Error("I can't read receipts in this browser right now. Please try Chrome or Edge.");
  }

  setStatus("Using backup text reader...", "");
  const result = await window.Tesseract.recognize(imageSource, "eng", {});
  const text = result?.data?.text?.trim() || "";
  return { text, engine: "Tesseract" };
}
