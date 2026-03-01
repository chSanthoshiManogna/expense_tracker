import { CATEGORIES } from "./config.js";
import { DEFAULT_MODEL, OLLAMA_URL } from "./config.js";
import { safeJsonParse } from "./utils.js";

const KNOWN_SUBCATEGORIES = new Set([
  "vegetables",
  "fruits",
  "dairy",
  "bakery",
  "raw materials",
  "baby care",
  "beverages",
  "general grocery",
  "restaurant meals",
  "coffee",
  "fuel",
  "medical bills",
  "pharmacy",
  "insurance",
  "diagnostics",
  "general health",
  "hardware",
  "tools",
  "electrical",
  "plumbing",
  "paint",
  "garden",
  "household",
  "general home",
  "clothing",
  "baby apparel",
  "footwear",
  "accessories",
  "general shopping",
  "misc",
  "general"
]);

const CATEGORY_ALIAS_MAP = {
  Groceries: ["grocery", "groceries", "diaper", "groceris", "grosery"],
  Dining: ["restaurant", "food", "coffee", "dining", "resturant", "dinnig"],
  "Gas & Fuel": ["gas", "fuel", "petrol", "fule", "diesel"],
  Health: ["health", "hospital", "medical", "pharmacy", "healt", "medcal"],
  Home: ["home", "hardware", "tools", "electrical", "plumbing", "paint", "garden"],
  Shopping: ["shopping", "apparel", "clothing", "fashion", "dress", "shirt", "pant", "jacket", "coat", "footwear", "shoe", "sandal"],
  Other: ["other", "misc", "others"]
};

const SUBCATEGORY_ALIAS_MAP = {
  vegetables: ["vegetable", "vegetables", "veggie", "produce"],
  fruits: ["fruit", "fruits"],
  beverages: ["beverage", "beverages", "drink", "drinks", "juice", "soda"],
  "baby care": ["baby", "diaper", "diapers", "pampers", "wipes"],
  clothing: ["clothing", "apparel", "dress", "shirt", "pant", "jacket", "coat", "knitwear", "sweater"],
  "baby apparel": ["baby clothes", "baby dress", "kids wear", "kids clothes", "child wear"],
  footwear: ["footwear", "shoe", "shoes", "sandal", "sneaker"],
  accessories: ["accessory", "accessories", "belt", "cap", "hat"]
};

export function getCategoryTotalsForMonth(receipts, refDate) {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));

  for (const receipt of receipts) {
    for (const item of receipt.items || []) {
      if (!totals[item.category]) totals[item.category] = 0;
      totals[item.category] += Number(item.amount || 0);
    }
  }
  return totals;
}

export function detectQueryCategory(question) {
  const q = String(question || "").toLowerCase();
  const all = detectAllCategoriesByRules(q);
  return all[0] || null;
}

export async function answerSpendQuestion(receipts, question, now = new Date(), modelName = DEFAULT_MODEL) {
  const q = String(question || "").toLowerCase();
  const understanding = await understandQuestionWithAI(question, modelName, now);
  const parsedRange = understanding.range || detectRange(q, now);
  const range = parsedRange || buildTillDateRange(now);
  const includeTargets = dedupeTargets([...(understanding.targets || []), ...detectTargetsByRules(q)]);
  const excludeTargets = dedupeTargets([...(understanding.excludeTargets || []), ...detectExcludeTargetsByRules(q)]);
  const hasSpendIntentWord = /\b(spend|spent|cost|pay|paid|amount|total|expense|expenses)\b/i.test(q);

  if (understanding.intent === "non_spending" || (!includeTargets.length && !hasSpendIntentWord)) {
    return {
      needsClarification: true,
      message: "This isn't a valid spending question. Ask about money spent by category/subcategory.",
      suggestedQuery: "How much did I spend on groceries till date?"
    };
  }

  if (!includeTargets.length) {
    return {
      needsClarification: true,
      message:
        understanding.help ||
        "I couldn't map that to a spending target yet. Ask about a category or subcategory like groceries, vegetables, gas, or pharmacy.",
      suggestedQuery: understanding.rewrite || "How much did I spend on groceries this month?"
    };
  }

  const availability = checkTargetsAvailability(includeTargets, receipts);
  if (!availability.available) {
    return {
      needsClarification: true,
      message: availability.message,
      suggestedQuery: availability.suggestedQuery || "How much did I spend on groceries last week?"
    };
  }

  let sum = 0;
  for (const receipt of receipts || []) {
    const d = new Date(receipt.receiptDate);
    if (!isInRange(d, range.start, range.end)) continue;

    for (const item of receipt.items || []) {
      const included = includeTargets.some((target) => matchesTarget(item, target));
      const excluded = excludeTargets.some((target) => matchesTarget(item, target));
      if (included && !excluded) {
        sum += Number(item.amount || 0);
      }
    }
  }

  const label = buildTargetLabel(includeTargets, excludeTargets);
  return {
    amount: sum,
    targetLabel: label,
    rangeLabel: range.label,
    interpretedIntent: understanding.intent && understanding.intent !== "unknown" ? understanding.intent : "spending_query",
    suggestedQuery: understanding.rewrite || buildSuggestedQuery(includeTargets, excludeTargets, range)
  };
}

async function understandQuestionWithAI(question, modelName, now) {
  const model = (modelName || DEFAULT_MODEL).trim();
  const payload = {
    model,
    stream: false,
    format: "json",
    prompt: `Understand user question for receipt spending analytics.
Return ONLY JSON:
{
  "intent": "spending_query" | "non_spending" | "unknown",
  "targets": [{"type":"category"|"subcategory","value":"string","label":"string"}],
  "exclude_targets": [{"type":"category"|"subcategory","value":"string","label":"string"}],
  "time_range": "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "last_year" | "all_time" | "year:YYYY",
  "rewrite": "short improved spending query",
  "help": "short user guidance if unclear"
}

Allowed categories: Groceries, Dining, Gas & Fuel, Health, Home, Shopping, Other.
If typo exists, infer likely target.
If user asks unrelated question, set intent=non_spending.

User question:
${question}`
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) return { intent: "unknown", targets: [], excludeTargets: [], range: null, rewrite: "", help: "" };
    const data = await response.json();
    const parsed = safeJsonParse(data?.response || "{}");

    const intent = String(parsed?.intent || "unknown").toLowerCase();
    const timeRange = String(parsed?.time_range || "").toLowerCase().trim();
    const rewrite = String(parsed?.rewrite || "").trim();
    const help = String(parsed?.help || "").trim();

    const targets = normalizeParsedTargets(parsed?.targets);
    const excludeTargets = normalizeParsedTargets(parsed?.exclude_targets);

    if (!targets.length) {
      const oldTargetType = String(parsed?.target_type || "none").toLowerCase();
      const oldTargetValue = String(parsed?.target_value || "").toLowerCase().trim();
      const oldTargetLabelRaw = String(parsed?.target_label || "").trim();
      const oldTarget = normalizeParsedTarget(oldTargetType, oldTargetValue, oldTargetLabelRaw);
      if (oldTarget) targets.push(oldTarget);
    }

    const range = normalizeParsedRange(timeRange, now);
    return { intent, targets, excludeTargets, range, rewrite, help };
  } catch {
    return { intent: "unknown", targets: [], excludeTargets: [], range: null, rewrite: "", help: "" };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeParsedTargets(rawTargets) {
  if (!Array.isArray(rawTargets)) return [];
  const out = [];
  for (const t of rawTargets) {
    const targetType = String(t?.type || "").toLowerCase();
    const targetValue = String(t?.value || "").toLowerCase().trim();
    const targetLabelRaw = String(t?.label || "").trim();
    const normalized = normalizeParsedTarget(targetType, targetValue, targetLabelRaw);
    if (normalized) out.push(normalized);
  }
  return dedupeTargets(out);
}

function normalizeParsedTarget(targetType, targetValue, targetLabelRaw) {
  if (targetType === "category") {
    const normalized = normalizeCategoryValue(targetValue || targetLabelRaw);
    if (!normalized) return null;
    return { type: "category", value: normalized.toLowerCase(), label: normalized };
  }
  if (targetType === "subcategory" && targetValue) {
    const normalizedSub = normalizeSubcategoryAlias(targetValue || targetLabelRaw);
    return { type: "subcategory", value: normalizedSub, label: targetLabelRaw || normalizedSub };
  }
  return null;
}

function normalizeParsedRange(timeRange, now) {
  if (!timeRange) return null;
  if (timeRange === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: "today" };
  }
  if (timeRange === "yesterday") {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "yesterday" };
  }
  if (timeRange === "this_week") return { start: startOfWeek(now), end: now, label: "this week" };
  if (timeRange === "last_week") {
    const currentWeekStart = startOfWeek(now);
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() - 1);
    return { start, end, label: "last week" };
  }
  if (timeRange === "this_month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: "this month" };
  }
  if (timeRange === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: "last month" };
  }
  if (timeRange === "this_year") {
    return { start: new Date(now.getFullYear(), 0, 1), end: now, label: "this year" };
  }
  if (timeRange === "last_year") {
    const y = now.getFullYear() - 1;
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999), label: "last year" };
  }
  if (timeRange === "all_time") {
    return { start: new Date(1970, 0, 1), end: now, label: "all time" };
  }
  if (timeRange === "none" || timeRange === "unknown") return null;
  const yearMatch = timeRange.match(/^year:(20\d{2})$/);
  if (yearMatch) {
    const y = Number.parseInt(yearMatch[1], 10);
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999), label: String(y) };
  }
  return null;
}

function buildSuggestedQuery(includeTargets, excludeTargets, range) {
  const label = buildTargetLabel(includeTargets, excludeTargets) || "groceries";
  const rangeLabel = range?.label || "till date";
  return `How much did I spend on ${label} in ${rangeLabel}?`;
}

function buildTillDateRange(now) {
  return { start: new Date(1970, 0, 1), end: now, label: "till date" };
}

function checkTargetsAvailability(targets, receipts) {
  for (const target of targets) {
    const single = checkSingleTargetAvailability(target, receipts);
    if (!single.available) return single;
  }
  return { available: true };
}

function checkSingleTargetAvailability(target, receipts) {
  if (target.type === "category") {
    const exists = CATEGORIES.some((c) => c.toLowerCase() === String(target.value || "").toLowerCase());
    if (!exists) {
      return {
        available: false,
        message: `Category "${target.label}" is not available.`,
        suggestedQuery: "How much did I spend on groceries last week?"
      };
    }
    return { available: true };
  }

  if (target.type === "subcategory") {
    const normalized = normalizeSubcategoryValue(target.value);
    const known = KNOWN_SUBCATEGORIES.has(normalized);
    const seenInData = (receipts || []).some((receipt) =>
      (receipt.items || []).some((item) => normalizeSubcategoryValue(item.subcategory || "") === normalized)
    );
    if (!known && !seenInData) {
      return {
        available: false,
        message: `Subcategory "${target.label}" is not available.`,
        suggestedQuery: "Try vegetables, fruits, dairy, coffee, fuel, pharmacy, or household."
      };
    }
    return { available: true };
  }

  return { available: false, message: "That category is not available." };
}

function normalizeSubcategoryValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSubcategoryAlias(value) {
  const v = normalizeSubcategoryValue(value);
  for (const [canonical, aliases] of Object.entries(SUBCATEGORY_ALIAS_MAP)) {
    if (matchesAnyCategoryAlias(v, [canonical, ...aliases])) return canonical;
  }
  return v;
}

function detectAllCategoriesByRules(q) {
  const categories = [];
  for (const [category, aliases] of Object.entries(CATEGORY_ALIAS_MAP)) {
    if (matchesAnyCategoryAlias(q, aliases)) categories.push(category);
  }
  return categories;
}

function detectTargetsByRules(q) {
  const targets = [];
  for (const [canonical, aliases] of Object.entries(SUBCATEGORY_ALIAS_MAP)) {
    if (matchesAnyCategoryAlias(q, aliases)) {
      targets.push({ type: "subcategory", value: canonical, label: canonical });
    }
  }
  for (const category of detectAllCategoriesByRules(q)) {
    targets.push({ type: "category", value: category.toLowerCase(), label: category });
  }
  return dedupeTargets(targets);
}

function detectExcludeTargetsByRules(q) {
  const excludes = [];
  for (const [canonical, aliases] of Object.entries(SUBCATEGORY_ALIAS_MAP)) {
    if (hasNegatedAlias(q, aliases)) {
      excludes.push({ type: "subcategory", value: canonical, label: canonical });
    }
  }
  for (const [category, aliases] of Object.entries(CATEGORY_ALIAS_MAP)) {
    if (hasNegatedAlias(q, aliases)) {
      excludes.push({ type: "category", value: category.toLowerCase(), label: category });
    }
  }
  return dedupeTargets(excludes);
}

function hasNegatedAlias(text, aliases) {
  return aliases.some((alias) => {
    const escaped = escapeRegex(alias);
    const re = new RegExp(`\\b(no|without|exclude|except|not)\\b[^.]{0,30}\\b${escaped}\\b`, "i");
    return re.test(text);
  });
}

function dedupeTargets(targets) {
  const seen = new Set();
  const out = [];
  for (const t of targets || []) {
    const type = String(t?.type || "").toLowerCase();
    const value = type === "subcategory" ? normalizeSubcategoryAlias(t?.value) : String(t?.value || "").toLowerCase();
    if (!type || !value) continue;
    const key = `${type}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = String(t?.label || value).trim();
    out.push({ type, value, label });
  }
  return out;
}

function buildTargetLabel(includeTargets, excludeTargets) {
  const include = (includeTargets || []).map((t) => t.label).join(" + ");
  const exclude = (excludeTargets || []).map((t) => t.label).join(" + ");
  if (include && exclude) return `${include} (excluding ${exclude})`;
  return include || "";
}

function normalizeCategoryValue(value) {
  const v = String(value || "").toLowerCase();
  const all = detectAllCategoriesByRules(v);
  if (all.length) return all[0];
  return null;
}

function matchesAnyCategoryAlias(text, aliases) {
  return aliases.some((alias) => fuzzyContains(text, alias));
}

function fuzzyContains(text, term) {
  const t = String(text || "").toLowerCase();
  const needle = String(term || "").toLowerCase();
  if (!needle) return false;
  if (t.includes(needle)) return true;

  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  const maxDistance = needle.length >= 7 ? 2 : 1;
  return tokens.some((token) => levenshteinDistance(token, needle) <= maxDistance);
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function detectRange(q, now) {
  const weekdayRange = detectLastWeekdayRange(q, now);
  if (weekdayRange) return weekdayRange;

  if (q.includes("today")) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: "today" };
  }
  if (q.includes("yesterday")) {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "yesterday" };
  }

  const explicitYearMatch = q.match(/\b(20\d{2})\b/);
  if (explicitYearMatch) {
    const y = Number.parseInt(explicitYearMatch[1], 10);
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    return { start, end, label: String(y) };
  }

  if (q.includes("last year")) {
    const y = now.getFullYear() - 1;
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
      label: "last year"
    };
  }
  if (q.includes("this year")) {
    const y = now.getFullYear();
    return {
      start: new Date(y, 0, 1),
      end: now,
      label: "this year"
    };
  }

  if (q.includes("last week") || q.includes("last weeek") || q.includes("last wekk")) {
    const currentWeekStart = startOfWeek(now);
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() - 1);
    return { start, end, label: "last week" };
  }
  if (q.includes("this week")) {
    return { start: startOfWeek(now), end: now, label: "this week" };
  }
  if (q.includes("last month")) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: "last month" };
  }
  if (q.includes("this month")) {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: "this month" };
  }
  return null;
}

function detectLastWeekdayRange(q, now) {
  const dayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  const match = q.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (!match) return null;

  const targetDow = dayMap[match[1].toLowerCase()];
  if (typeof targetDow !== "number") return null;

  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);

  for (let i = 0; i < 14; i += 1) {
    if (cursor.getDay() === targetDow) {
      const start = new Date(cursor);
      start.setHours(0, 0, 0, 0);
      const finish = new Date(cursor);
      finish.setHours(23, 59, 59, 999);
      return { start, end: finish, label: `last ${match[1].toLowerCase()}` };
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return null;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isInRange(date, start, end) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

function matchesTarget(item, target) {
  const itemName = String(item?.item || "").toLowerCase();
  const subcategory = String(item?.subcategory || "").toLowerCase();
  const category = String(item?.category || "").toLowerCase();

  if (target.type === "category") return category === target.value;
  if (target.type === "subcategory") {
    const normalizedTarget = normalizeSubcategoryAlias(target.value);
    if (normalizedTarget === "vegetables") {
      return (
        subcategory.includes("vegetable") ||
        ["carrot", "beet", "broccoli", "lettuce", "tomato", "potato", "onion", "spinach", "pepper", "peas"].some(
          (k) => itemName.includes(k)
        )
      );
    }
    if (normalizedTarget === "fruits") {
      return (
        subcategory.includes("fruit") ||
        ["apple", "banana", "grape", "orange", "mango", "berry", "avocado"].some((k) => itemName.includes(k))
      );
    }
    if (normalizedTarget === "beverages") {
      return (
        subcategory.includes("beverage") ||
        ["gatorade", "juice", "soda", "cola", "water", "energy drink"].some((k) => itemName.includes(k))
      );
    }
    if (normalizedTarget === "baby care") {
      return (
        subcategory.includes("baby") ||
        ["diaper", "pampers", "wipes"].some((k) => itemName.includes(k))
      );
    }
    return normalizeSubcategoryValue(subcategory).includes(normalizedTarget);
  }
  return false;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
