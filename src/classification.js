import { CATEGORIES, CATEGORY_KEYWORDS, DEFAULT_MODEL, OLLAMA_URL } from "./config.js";
import { safeJsonParse } from "./utils.js";

const CUSTOM_SUBCATEGORY_KEY = "instalili_custom_subcategories_v1";
const ITEM_MEMORY_KEY = "instalili_item_category_memory_v1";

const SUBCATEGORIES_BY_CATEGORY = {
  Groceries: ["Vegetables", "Fruits", "Dairy", "Bakery", "Raw Materials", "Baby Care", "Beverages", "General Grocery"],
  Dining: ["Restaurant Meals", "Coffee"],
  "Gas & Fuel": ["Fuel"],
  Health: ["Medical Bills", "Pharmacy", "Insurance", "Diagnostics", "General Health"],
  Home: ["Hardware", "Tools", "Electrical", "Plumbing", "Paint", "Garden", "Household", "General Home"],
  Shopping: ["Clothing", "Baby Apparel", "Footwear", "Accessories", "General Shopping"],
  Other: ["Electronics", "Office", "Personal Care", "Household Other", "Misc", "General"]
};

const GROCERY_KEYWORD_MAP = [
  // Vegetables
  { key: "carrot", subcategory: "Vegetables" },
  { key: "beet", subcategory: "Vegetables" },
  { key: "broccoli", subcategory: "Vegetables" },
  { key: "lettuce", subcategory: "Vegetables" },
  { key: "tomato", subcategory: "Vegetables" },
  { key: "potato", subcategory: "Vegetables" },
  { key: "onion", subcategory: "Vegetables" },
  { key: "cucumber", subcategory: "Vegetables" },
  { key: "pepper", subcategory: "Vegetables" },
  { key: "spinach", subcategory: "Vegetables" },
  { key: "cabbage", subcategory: "Vegetables" },
  { key: "peas", subcategory: "Vegetables" },
  { key: "sprout", subcategory: "Vegetables" },
  // Fruits
  { key: "apple", subcategory: "Fruits" },
  { key: "banana", subcategory: "Fruits" },
  { key: "grape", subcategory: "Fruits" },
  { key: "orange", subcategory: "Fruits" },
  { key: "mango", subcategory: "Fruits" },
  { key: "berry", subcategory: "Fruits" },
  { key: "avocado", subcategory: "Fruits" },
  { key: "cavendish", subcategory: "Fruits" },
  // Others
  { key: "milk", subcategory: "Dairy" },
  { key: "cheese", subcategory: "Dairy" },
  { key: "yogurt", subcategory: "Dairy" },
  { key: "egg", subcategory: "Dairy" },
  { key: "bread", subcategory: "Bakery" },
  { key: "flour", subcategory: "Raw Materials" },
  { key: "rice", subcategory: "Raw Materials" },
  { key: "lentil", subcategory: "Raw Materials" },
  { key: "hummus", subcategory: "General Grocery" },
  { key: "chickpea dip", subcategory: "General Grocery" },
  { key: "soup", subcategory: "General Grocery" },
  { key: "broth", subcategory: "General Grocery" },
  { key: "amys", subcategory: "General Grocery" },
  { key: "diaper", subcategory: "Baby Care" },
  { key: "pampers", subcategory: "Baby Care" },
  { key: "wipes", subcategory: "Baby Care" },
  { key: "gatorade", subcategory: "Beverages" },
  { key: "juice", subcategory: "Beverages" },
  { key: "soda", subcategory: "Beverages" },
  { key: "cola", subcategory: "Beverages" },
  { key: "sparkling water", subcategory: "Beverages" },
  { key: "energy drink", subcategory: "Beverages" }
];

const HOME_KEYWORD_MAP = [
  { key: "push pin", subcategory: "Hardware" },
  { key: "push pins", subcategory: "Hardware" },
  { key: "thumb tack", subcategory: "Hardware" },
  { key: "thumbtack", subcategory: "Hardware" },
  { key: "towel", subcategory: "Household" },
  { key: "hand towel", subcategory: "Household" },
  { key: "paper towel", subcategory: "Household" },
  { key: "dish towel", subcategory: "Household" },
  { key: "screw", subcategory: "Hardware" },
  { key: "bolt", subcategory: "Hardware" },
  { key: "nut", subcategory: "Hardware" },
  { key: "anchor", subcategory: "Hardware" },
  { key: "bracket", subcategory: "Hardware" },
  { key: "drill", subcategory: "Tools" },
  { key: "hammer", subcategory: "Tools" },
  { key: "wrench", subcategory: "Tools" },
  { key: "saw", subcategory: "Tools" },
  { key: "tool", subcategory: "Tools" },
  { key: "wire", subcategory: "Electrical" },
  { key: "outlet", subcategory: "Electrical" },
  { key: "switch", subcategory: "Electrical" },
  { key: "breaker", subcategory: "Electrical" },
  { key: "light bulb", subcategory: "Electrical" },
  { key: "pvc", subcategory: "Plumbing" },
  { key: "faucet", subcategory: "Plumbing" },
  { key: "pipe", subcategory: "Plumbing" },
  { key: "valve", subcategory: "Plumbing" },
  { key: "caulk", subcategory: "Plumbing" },
  { key: "paint", subcategory: "Paint" },
  { key: "primer", subcategory: "Paint" },
  { key: "roller", subcategory: "Paint" },
  { key: "brush", subcategory: "Paint" },
  { key: "mulch", subcategory: "Garden" },
  { key: "soil", subcategory: "Garden" },
  { key: "plant", subcategory: "Garden" },
  { key: "fertilizer", subcategory: "Garden" },
  { key: "seed", subcategory: "Garden" }
];

const HEALTH_KEYWORD_MAP = [
  { key: "hospital", subcategory: "Medical Bills" },
  { key: "clinic", subcategory: "Medical Bills" },
  { key: "doctor", subcategory: "Medical Bills" },
  { key: "physician", subcategory: "Medical Bills" },
  { key: "urgent care", subcategory: "Medical Bills" },
  { key: "pharmacy", subcategory: "Pharmacy" },
  { key: "rx", subcategory: "Pharmacy" },
  { key: "prescription", subcategory: "Pharmacy" },
  { key: "copay", subcategory: "Insurance" },
  { key: "insurance", subcategory: "Insurance" },
  { key: "diagnostic", subcategory: "Diagnostics" },
  { key: "lab test", subcategory: "Diagnostics" },
  { key: "x-ray", subcategory: "Diagnostics" },
  { key: "mri", subcategory: "Diagnostics" },
  { key: "ct scan", subcategory: "Diagnostics" }
];

const OTHER_KEYWORD_MAP = [
  { key: "dress", subcategory: "Clothing" },
  { key: "dresses", subcategory: "Clothing" },
  { key: "drs", subcategory: "Clothing" },
  { key: "sweater", subcategory: "Clothing" },
  { key: "swtr", subcategory: "Clothing" },
  { key: "jacket", subcategory: "Clothing" },
  { key: "jk", subcategory: "Clothing" },
  { key: "knitwear", subcategory: "Clothing" },
  { key: "shirt", subcategory: "Clothing" },
  { key: "t-shirt", subcategory: "Clothing" },
  { key: "hoodie", subcategory: "Clothing" },
  { key: "jeans", subcategory: "Clothing" },
  { key: "pant", subcategory: "Clothing" },
  { key: "ladies", subcategory: "Clothing" },
  { key: "jr", subcategory: "Clothing" },
  { key: "footwear", subcategory: "Footwear" },
  { key: "ftwr", subcategory: "Footwear" },
  { key: "shoe", subcategory: "Footwear" },
  { key: "sandal", subcategory: "Footwear" },
  { key: "sneaker", subcategory: "Footwear" },
  { key: "notebook", subcategory: "Office" },
  { key: "pen", subcategory: "Office" },
  { key: "printer", subcategory: "Office" },
  { key: "usb", subcategory: "Electronics" },
  { key: "headphone", subcategory: "Electronics" },
  { key: "charger", subcategory: "Electronics" },
  { key: "soap", subcategory: "Personal Care" },
  { key: "shampoo", subcategory: "Personal Care" },
  { key: "toothpaste", subcategory: "Personal Care" }
];

const WORD_CORRECTIONS = {
  tovel: "towel",
  towvel: "towel",
  towal: "towel",
  gatorad: "gatorade",
  gatorde: "gatorade",
  puch: "push",
  pinz: "pins",
  tshirt: "t-shirt",
  ftwr: "footwear",
  swtr: "sweater",
  drs: "dress",
  jk: "jacket",
  humms: "hummus",
  humus: "hummus",
  hummas: "hummus",
  hummos: "hummus",
  jsph: "soup"
};

const TOKEN_CATEGORY_HINTS = {
  Groceries: ["fruit", "vegetable", "milk", "bread", "rice", "juice", "soda", "snack"],
  Dining: ["coffee", "latte", "cafe", "restaurant", "meal", "burger", "pizza"],
  "Gas & Fuel": ["gas", "fuel", "diesel", "petrol"],
  Health: ["hospital", "clinic", "pharmacy", "rx", "doctor", "medical", "lab"],
  Home: ["hardware", "tool", "screw", "bolt", "pin", "tack", "paint", "garden", "plumb", "electr", "towel"],
  Shopping: ["dress", "shirt", "pant", "jacket", "coat", "wear", "footwear", "shoe", "sandal", "knitwear", "apparel"]
};

export async function classifyItems(parsedItems, receiptText, modelName, setStatus) {
  if (!parsedItems.length) return [];

  const itemMemory = loadItemMemory();
  const learnedMappings = {};

  try {
    const aiRows = await classifyItemsWithLocalAI(parsedItems, receiptText, modelName);
    const results = parsedItems.map((row, idx) => {
      const memoryKey = toItemMemoryKey(row.item);
      const memoryHit = itemMemory[memoryKey];
      if (memoryHit && CATEGORIES.includes(memoryHit.category)) {
        return {
          ...row,
          category: memoryHit.category,
          subcategory: memoryHit.subcategory || "General",
          confidence: Number(memoryHit.confidence || 0.95),
          source: "memory"
        };
      }

      const ai = aiRows[idx];
      if (!ai) return { ...row, ...classifyByRules(row.item) };
      if (!CATEGORIES.includes(ai.category)) return { ...row, ...classifyByRules(row.item) };
      const normalized = {
        ...row,
        category: ai.category,
        subcategory: ai.subcategory || "General",
        confidence: Number(ai.confidence || 0.7),
        source: "ai"
      };
      if (normalized.category === "Other" && ["Misc", "General"].includes(normalized.subcategory)) {
        const ruleFallback = classifyByRules(row.item);
        if (!(ruleFallback.category === "Other" && ["Misc", "General"].includes(ruleFallback.subcategory))) {
          return {
            ...row,
            category: ruleFallback.category,
            subcategory: ruleFallback.subcategory,
            confidence: Math.max(Number(ruleFallback.confidence || 0.75), Number(normalized.confidence || 0.7)),
            source: "rules-override"
          };
        }
      }
      if (shouldLearnItemMapping(memoryKey, normalized.confidence)) {
        learnedMappings[memoryKey] = {
          category: normalized.category,
          subcategory: normalized.subcategory,
          confidence: normalized.confidence
        };
      }
      return normalized;
    });
    if (Object.keys(learnedMappings).length > 0) {
      saveItemMemory({ ...itemMemory, ...learnedMappings });
    }
    return results;
  } catch {
    setStatus("Local AI is not available right now. I switched to basic classification.", "");
    return parsedItems.map((row) => {
      const memoryKey = toItemMemoryKey(row.item);
      const memoryHit = itemMemory[memoryKey];
      if (memoryHit && CATEGORIES.includes(memoryHit.category)) {
        return {
          ...row,
          category: memoryHit.category,
          subcategory: memoryHit.subcategory || "General",
          confidence: Number(memoryHit.confidence || 0.95),
          source: "memory"
        };
      }
      return { ...row, ...classifyByRules(row.item) };
    });
  }
}

function classifyByRules(itemName) {
  const normalized = normalizeItemText(itemName);

  // Prepared grocery products should not fall into Raw Materials/Other due to token noise.
  if (isPreparedGroceryItem(normalized)) {
    return { category: "Groceries", subcategory: "General Grocery", confidence: 0.84, source: "rules" };
  }

  for (const entry of GROCERY_KEYWORD_MAP) {
    if (normalized.includes(entry.key)) {
      return { category: "Groceries", subcategory: entry.subcategory, confidence: 0.8, source: "rules" };
    }
  }

  for (const keyword of CATEGORY_KEYWORDS.Dining) {
    if (normalized.includes(keyword)) {
      return {
        category: "Dining",
        subcategory: normalized.includes("coffee") ? "Coffee" : "Restaurant Meals",
        confidence: 0.8,
        source: "rules"
      };
    }
  }
  for (const keyword of CATEGORY_KEYWORDS["Gas & Fuel"]) {
    if (normalized.includes(keyword)) {
      return { category: "Gas & Fuel", subcategory: "Fuel", confidence: 0.8, source: "rules" };
    }
  }
  for (const keyword of CATEGORY_KEYWORDS.Groceries) {
    if (normalized.includes(keyword)) {
      return { category: "Groceries", subcategory: "General Grocery", confidence: 0.75, source: "rules" };
    }
  }
  if (normalized.includes("gatorade")) {
    return { category: "Groceries", subcategory: "Beverages", confidence: 0.82, source: "rules" };
  }
  for (const entry of HEALTH_KEYWORD_MAP) {
    if (normalized.includes(entry.key)) {
      return { category: "Health", subcategory: entry.subcategory, confidence: 0.8, source: "rules" };
    }
  }
  for (const entry of HOME_KEYWORD_MAP) {
    if (normalized.includes(entry.key)) {
      return { category: "Home", subcategory: entry.subcategory, confidence: 0.78, source: "rules" };
    }
  }
  for (const entry of OTHER_KEYWORD_MAP) {
    if (normalized.includes(entry.key)) {
      const shoppingSub = ["Clothing", "Footwear"].includes(entry.subcategory)
        ? entry.subcategory
        : entry.subcategory === "Personal Care"
          ? "General Shopping"
          : entry.subcategory;
      const category = ["Clothing", "Footwear"].includes(entry.subcategory) ? "Shopping" : "Other";
      return { category, subcategory: shoppingSub, confidence: 0.8, source: "rules" };
    }
  }

  const hinted = classifyByTokenHints(normalized);
  if (hinted) return hinted;

  return { category: "Other", subcategory: "Misc", confidence: 0.6, source: "rules" };
}

async function classifyItemsWithLocalAI(parsedItems, receiptText, modelName) {
  const model = (modelName || DEFAULT_MODEL).trim();
  const payload = {
    model,
    stream: false,
    format: "json",
    prompt: buildClassifierPrompt(parsedItems, receiptText)
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("I couldn't reach the local AI model for classification.");
    const data = await response.json();
    const raw = data?.response || "";
    const parsed = safeJsonParse(raw);
    if (!Array.isArray(parsed)) throw new Error("The local AI response was unclear, so I couldn't classify this receipt.");
    return parsed.map(normalizeAiClassification);
  } finally {
    clearTimeout(timeout);
  }
}

function buildClassifierPrompt(items, receiptText) {
  const itemNames = items.map((x, i) => `${i + 1}. ${x.item}`).join("\n");
  const compactContext = receiptText.split("\n").slice(0, 20).join("\n");
  return `You classify receipt items.
Allowed categories: Groceries, Dining, Gas & Fuel, Health, Home, Shopping, Other.
Allowed subcategories by category:
- Groceries: Vegetables, Fruits, Dairy, Bakery, Raw Materials, Baby Care, Beverages, General Grocery
- Dining: Restaurant Meals, Coffee
- Gas & Fuel: Fuel
- Health: Medical Bills, Pharmacy, Insurance, Diagnostics, General Health
- Home: Hardware, Tools, Electrical, Plumbing, Paint, Garden, Household, General Home
- Shopping: Clothing, Baby Apparel, Footwear, Accessories, General Shopping
- Other: Electronics, Office, Personal Care, Household Other, Misc, General
Return ONLY a JSON array with one object per item in order.
Each object must contain: category, subcategory, confidence.
confidence is 0..1.
Examples:
- "carrot" -> Groceries / Vegetables
- "beets" -> Groceries / Vegetables
- "apple" -> Groceries / Fruits
- "gatorade" -> Groceries / Beverages
- "latte" -> Dining / Coffee
- "drill bit set" -> Home / Tools
- "pvc elbow" -> Home / Plumbing
- "paint roller" -> Home / Paint
- "hospital bill" -> Health / Medical Bills
- "prescription rx" -> Health / Pharmacy
- "organic hummus" -> Groceries / General Grocery
- "lentil soup" -> Groceries / General Grocery
- "jr drs/swtr/jk" -> Shopping / Clothing
- "ladies ftwr" -> Shopping / Footwear
- "knitwear casual" -> Shopping / Clothing
- "baby dress" -> Shopping / Baby Apparel

Receipt context:
${compactContext}

Items:
${itemNames}`;
}

function normalizeAiClassification(row) {
  const category = CATEGORIES.includes(row?.category) ? row.category : "Other";
  const raw = typeof row?.subcategory === "string" ? row.subcategory.trim() : "General";
  const confidence = Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 0.7;
  const subcategory = normalizeSubcategory(category, raw, confidence);
  return { category, subcategory, confidence };
}

function normalizeSubcategory(category, subcategory, confidence = 0.7) {
  const allowed = getAllowedSubcategories(category);
  const sub = String(subcategory || "").trim();
  if (!sub) return allowed[0];
  const exact = allowed.find((x) => x.toLowerCase() === sub.toLowerCase());
  if (exact) return exact;

  const lower = sub.toLowerCase();
  if (category === "Groceries") {
    if (lower.includes("vegetable") || lower.includes("veggie") || lower.includes("produce")) return "Vegetables";
    if (lower.includes("fruit")) return "Fruits";
    if (
      lower.includes("hummus") ||
      lower.includes("dip") ||
      lower.includes("soup") ||
      lower.includes("broth") ||
      lower.includes("prepared")
    ) {
      return "General Grocery";
    }
    if (
      lower.includes("beverage") ||
      lower.includes("drink") ||
      lower.includes("juice") ||
      lower.includes("soda")
    ) {
      return "Beverages";
    }
  }
  if (category === "Dining" && lower.includes("coffee")) return "Coffee";
  if (category === "Gas & Fuel") return "Fuel";
  if (category === "Health") {
    if (lower.includes("pharma") || lower.includes("prescription") || lower.includes("rx")) return "Pharmacy";
    if (lower.includes("insur") || lower.includes("copay")) return "Insurance";
    if (lower.includes("diag") || lower.includes("lab") || lower.includes("scan")) return "Diagnostics";
    return "Medical Bills";
  }
  if (category === "Home") {
    if (lower.includes("tool")) return "Tools";
    if (lower.includes("paint")) return "Paint";
    if (lower.includes("garden")) return "Garden";
    if (lower.includes("plumb")) return "Plumbing";
    if (lower.includes("electr")) return "Electrical";
    if (lower.includes("hardwar")) return "Hardware";
    if (lower.includes("house")) return "Household";
    if (shouldLearnSubcategory(category, sub, confidence)) {
      const learned = toTitleCase(sub);
      addCustomSubcategory(category, learned);
      return learned;
    }
    return "General Home";
  }
  if (category === "Shopping") {
    if (lower.includes("baby") || lower.includes("kids") || lower.includes("child")) return "Baby Apparel";
    if (lower.includes("foot") || lower.includes("shoe") || lower.includes("sandal") || lower.includes("sneaker")) {
      return "Footwear";
    }
    if (lower.includes("accessor") || lower.includes("belt") || lower.includes("cap") || lower.includes("hat")) {
      return "Accessories";
    }
    if (
      lower.includes("cloth") ||
      lower.includes("apparel") ||
      lower.includes("wear") ||
      lower.includes("dress") ||
      lower.includes("shirt") ||
      lower.includes("pant") ||
      lower.includes("jacket") ||
      lower.includes("coat")
    ) {
      return "Clothing";
    }
    return "General Shopping";
  }
  if (category === "Other") {
    if (lower.includes("cloth") || lower.includes("apparel") || lower.includes("wear") || lower.includes("dress")) {
      return "Clothing";
    }
    if (lower.includes("foot") || lower.includes("shoe") || lower.includes("sandal") || lower.includes("sneaker")) {
      return "Footwear";
    }
    if (lower.includes("electr") || lower.includes("charger") || lower.includes("usb") || lower.includes("headphone")) {
      return "Electronics";
    }
    if (lower.includes("office") || lower.includes("stationery") || lower.includes("notebook") || lower.includes("printer")) {
      return "Office";
    }
    if (lower.includes("personal") || lower.includes("soap") || lower.includes("shampoo") || lower.includes("toothpaste")) {
      return "Personal Care";
    }
    if (lower.includes("house")) return "Household Other";
    if (shouldLearnSubcategory(category, sub, confidence)) {
      const learned = toTitleCase(sub);
      addCustomSubcategory(category, learned);
      return learned;
    }
    return "Misc";
  }

  if (shouldLearnSubcategory(category, sub, confidence)) {
    const learned = toTitleCase(sub);
    addCustomSubcategory(category, learned);
    return learned;
  }
  return allowed[0];
}

function normalizeItemText(value) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^\w\s&/-]/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").map((w) => WORD_CORRECTIONS[w] || w);
  return words.join(" ");
}

function classifyByTokenHints(normalized) {
  const tokens = normalized
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t));

  if (!tokens.length) return null;

  let bestCategory = null;
  let bestScore = 0;
  for (const [category, hints] of Object.entries(TOKEN_CATEGORY_HINTS)) {
    const score = tokens.reduce((acc, tok) => (hints.some((h) => tok.includes(h) || h.includes(tok)) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (!bestCategory || bestScore < 2) return null;
  if (bestCategory === "Home") return { category: "Home", subcategory: "Hardware", confidence: 0.72, source: "rules" };
  if (bestCategory === "Dining") return { category: "Dining", subcategory: "Restaurant Meals", confidence: 0.72, source: "rules" };
  if (bestCategory === "Gas & Fuel") return { category: "Gas & Fuel", subcategory: "Fuel", confidence: 0.72, source: "rules" };
  if (bestCategory === "Health") return { category: "Health", subcategory: "General Health", confidence: 0.72, source: "rules" };
  if (bestCategory === "Shopping") return { category: "Shopping", subcategory: "Clothing", confidence: 0.72, source: "rules" };
  return { category: "Groceries", subcategory: "General Grocery", confidence: 0.72, source: "rules" };
}

function isPreparedGroceryItem(normalized) {
  const preparedTokens = ["hummus", "dip", "soup", "broth", "stew", "ready meal", "prepared", "amys"];
  return preparedTokens.some((t) => normalized.includes(t));
}

function getAllowedSubcategories(category) {
  const base = SUBCATEGORIES_BY_CATEGORY[category] || ["General"];
  const custom = loadCustomSubcategories()[category] || [];
  return [...base, ...custom];
}

function loadCustomSubcategories() {
  try {
    const raw = localStorage.getItem(CUSTOM_SUBCATEGORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function addCustomSubcategory(category, subcategory) {
  const map = loadCustomSubcategories();
  const existing = Array.isArray(map[category]) ? map[category] : [];
  if (existing.some((x) => x.toLowerCase() === subcategory.toLowerCase())) return;
  map[category] = [...existing, subcategory];
  localStorage.setItem(CUSTOM_SUBCATEGORY_KEY, JSON.stringify(map));
}

function shouldLearnSubcategory(category, subcategory, confidence) {
  if (!category || !subcategory) return false;
  if (confidence < 0.9) return false;
  if (subcategory.length < 3 || subcategory.length > 30) return false;
  if (!/^[a-zA-Z][a-zA-Z0-9\s&/-]*$/.test(subcategory)) return false;
  return true;
}

function toTitleCase(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function toItemMemoryKey(itemName) {
  return normalizeItemText(itemName)
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadItemMemory() {
  try {
    const raw = localStorage.getItem(ITEM_MEMORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveItemMemory(memory) {
  localStorage.setItem(ITEM_MEMORY_KEY, JSON.stringify(memory));
}

function shouldLearnItemMapping(memoryKey, confidence) {
  if (!memoryKey || memoryKey.length < 3) return false;
  if (!Number.isFinite(Number(confidence))) return false;
  return Number(confidence) >= 0.88;
}
