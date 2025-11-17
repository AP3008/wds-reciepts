export type ReceiptItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  emoji?: string;
  category?: string;
};

export type Receipt = {
  id: string;
  store: string;
  date: string;
  total: number;
  tax: number;
  category: string;
  paymentMethod: string;
  items: ReceiptItem[];
  notes?: string;
  summary?: string;
  emojiTag?: string;
  favorite?: boolean;
  pinned?: boolean;
  createdAt: string;
  rawText?: string;
};

export type ReceiptDraft = Omit<
  Receipt,
  "id" | "favorite" | "pinned" | "createdAt"
> & {
  confidence: number;
  taxConfidence: number;
  suggestions: string[];
};

export const CATEGORY_OPTIONS = [
  "Groceries",
  "Restaurants",
  "Transportation",
  "Supplies",
  "Lifestyle",
  "Travel",
  "Services",
] as const;

export const PAYMENT_METHODS = [
  "Visa",
  "Mastercard",
  "Debit",
  "Cash",
  "Amex",
  "Apple Pay",
  "Google Pay",
] as const;

const createId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const today = new Date();

const buildItems = (): ReceiptItem[] => [
  {
    id: createId("item"),
    name: "Seasonal Produce",
    quantity: 1,
    price: 14.5,
    emoji: "🍓",
    category: "Groceries",
  },
  {
    id: createId("item"),
    name: "Fresh Bread",
    quantity: 2,
    price: 7.25,
    emoji: "🥖",
    category: "Groceries",
  },
  {
    id: createId("item"),
    name: "Household Supplies",
    quantity: 1,
    price: 9.85,
    emoji: "🧽",
    category: "Supplies",
  },
];

export const SAMPLE_RECEIPTS: Receipt[] = [
  {
    id: "rcpt-1067",
    store: "Harvest Lane Market",
    date: new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 2,
    ).toISOString(),
    total: 52.1,
    tax: 6.2,
    category: "Groceries",
    paymentMethod: "Visa",
    items: buildItems(),
    favorite: true,
    emojiTag: "🛒",
    summary:
      "Groceries and supplies for the week. Produce pricing looks stable week-over-week.",
    createdAt: new Date().toISOString(),
    rawText: `HARVEST LANE MARKET
12/02/2025 5:42PM
VISA ••0456
SUBTOTAL 45.90
TAX 6.20
TOTAL 52.10`,
  },
  {
    id: "rcpt-1068",
    store: "Café Lumen",
    date: new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 7,
    ).toISOString(),
    total: 18.32,
    tax: 2.03,
    category: "Restaurants",
    paymentMethod: "Apple Pay",
    items: [
      {
        id: createId("item"),
        name: "Latte",
        quantity: 1,
        price: 5.5,
        emoji: "☕",
        category: "Restaurants",
      },
      {
        id: createId("item"),
        name: "Avocado Toast",
        quantity: 1,
        price: 9.5,
        emoji: "🥑",
        category: "Restaurants",
      },
      {
        id: createId("item"),
        name: "Tip",
        quantity: 1,
        price: 3.32,
        emoji: "💸",
        category: "Restaurants",
      },
    ],
    favorite: false,
    pinned: true,
    emojiTag: "☕",
    summary: "Quick coffee meeting expense.",
    createdAt: new Date().toISOString(),
    rawText: `CAFÉ LUMEN
11/27/2025 9:17AM
APPLE PAY
LATTE          5.50
AVO TOAST      9.50
TIP            3.32
TOTAL         18.32`,
  },
];

export const emptyReceiptDraft = (): ReceiptDraft => ({
  store: "",
  date: new Date().toISOString().slice(0, 10),
  total: 0,
  tax: 0,
  category: "",
  paymentMethod: "Visa",
  items: [
    {
      id: createId("item"),
      name: "",
      quantity: 1,
      price: 0,
    },
  ],
  notes: "",
  summary: "",
  emojiTag: undefined,
  rawText: "",
  confidence: 0,
  taxConfidence: 0,
  suggestions: [],
});

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

export const formatDisplayDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

export const createReceiptFromDraft = (draft: ReceiptDraft): Receipt => ({
  id: `rcpt-${Date.now()}`,
  store: draft.store.trim(),
  date: draft.date,
  total: draft.total,
  tax: draft.tax,
  category: draft.category,
  paymentMethod: draft.paymentMethod,
  items: draft.items,
  notes: draft.notes,
  summary: draft.summary,
  emojiTag: draft.emojiTag,
  createdAt: new Date().toISOString(),
  rawText: draft.rawText,
});

export const computeMonthlyBuckets = (receipts: Receipt[]) => {
  const buckets = new Map<string, number>();

  receipts.forEach((receipt) => {
    const date = new Date(receipt.date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    buckets.set(key, (buckets.get(key) ?? 0) + receipt.total);
  });

  return Array.from(buckets.entries())
    .map(([key, total]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        label: `${new Date(year, month - 1, 1).toLocaleString("en-US", {
          month: "short",
        })}`,
        total,
      };
    })
    .sort((a, b) => (a.key > b.key ? 1 : -1));
};

export const computeCategorySplit = (receipts: Receipt[]) => {
  const ledger = new Map<string, number>();
  receipts.forEach((receipt) => {
    ledger.set(
      receipt.category,
      (ledger.get(receipt.category) ?? 0) + receipt.total,
    );
  });

  return Array.from(ledger.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
};

export const computeAverageTicket = (receipts: Receipt[]) => {
  if (!receipts.length) {
    return 0;
  }
  return (
    receipts.reduce((sum, receipt) => sum + receipt.total, 0) / receipts.length
  );
};

const randomStoreNames = [
  "Urban Pantry",
  "Midnight Noodle",
  "Campus Deli",
  "Velodrome Café",
  "Sunset Fuel",
];

const randomSuggestions = [
  "Confirm tax vs. subtotal before filing.",
  "Mark recurring merchants to unlock auto-tagging.",
  "Categories look balanced. Consider pinning if reimbursable.",
];

const randomEmoji = ["🧾", "🍽️", "🎒", "🚌", "🛋️"];

const pick = <T,>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)];

export const mockProcessReceipt = async (
  file?: Blob,
): Promise<ReceiptDraft> => {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const draft = emptyReceiptDraft();
  draft.store = pick(randomStoreNames);
  draft.date = new Date().toISOString().slice(0, 10);
  draft.total = Number((Math.random() * 60 + 15).toFixed(2));
  draft.tax = Number((draft.total * 0.13).toFixed(2));
  draft.category = pick(CATEGORY_OPTIONS);
  draft.paymentMethod = pick(PAYMENT_METHODS);
  draft.items = buildItems().map((item) => ({
    ...item,
    id: createId("item"),
  }));
  draft.rawText = `DIGITIZED RECEIPT
${draft.store.toUpperCase()}
TOTAL ${draft.total.toFixed(2)}
TAX ${draft.tax.toFixed(2)}`;
  draft.confidence = 0.72 + Math.random() * 0.2;
  draft.taxConfidence = 0.65 + Math.random() * 0.25;
  draft.summary = "Auto-generated summary placeholder. Ready for review.";
  draft.emojiTag = pick(randomEmoji);
  draft.suggestions = randomSuggestions;
  if (file && typeof File !== "undefined" && file instanceof File) {
    draft.notes = `Source: ${file.name}`;
  }
  return draft;
};
