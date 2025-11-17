"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_OPTIONS,
  PAYMENT_METHODS,
  SAMPLE_RECEIPTS,
  type Receipt,
  type ReceiptDraft,
  type ReceiptItem,
  computeAverageTicket,
  computeCategorySplit,
  computeMonthlyBuckets,
  createReceiptFromDraft,
  emptyReceiptDraft,
  formatCurrency,
  formatDisplayDate,
  mockProcessReceipt,
} from "@/lib/receipts";

type PreferenceState = {
  insights: boolean;
  summaries: boolean;
  emoji: boolean;
};

type FilterState = {
  query: string;
  category: string;
  favoritesOnly: boolean;
  pinnedOnly: boolean;
};

type UploadMeta = {
  name?: string;
  size?: number;
  uploadedAt?: string;
};

const makeItemId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `item-${crypto.randomUUID()}`;
  }
  return `item-${Math.random().toString(36).slice(2, 10)}`;
};

const formatBytes = (bytes?: number) => {
  if (!bytes) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
};

const calcMonthSpend = (receipts: Receipt[]) => {
  const now = new Date();
  const current = receipts
    .filter((receipt) => {
      const date = new Date(receipt.date);
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    })
    .reduce((sum, receipt) => sum + receipt.total, 0);

  const previousTarget = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = receipts
    .filter((receipt) => {
      const date = new Date(receipt.date);
      return (
        date.getFullYear() === previousTarget.getFullYear() &&
        date.getMonth() === previousTarget.getMonth()
      );
    })
    .reduce((sum, receipt) => sum + receipt.total, 0);

  return { current, previous, delta: current - previous };
};

const fileAccept =
  ".pdf, image/png, image/jpeg, image/heic, application/pdf, image/heif";

export default function Home() {
  const [history, setHistory] = useState<Receipt[]>(SAMPLE_RECEIPTS);
  const [draft, setDraft] = useState<ReceiptDraft>(emptyReceiptDraft());
  const [uploadMeta, setUploadMeta] = useState<UploadMeta>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReview, setConfirmReview] = useState(false);
  const [preferences, setPreferences] = useState<PreferenceState>({
    insights: true,
    summaries: true,
    emoji: true,
  });
  const [filters, setFilters] = useState<FilterState>({
    query: "",
    category: "all",
    favoritesOnly: false,
    pinnedOnly: false,
  });
  const [selectedReceiptId, setSelectedReceiptId] = useState(
    SAMPLE_RECEIPTS[0]?.id ?? "",
  );

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [history],
  );

  const filteredHistory = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return sortedHistory.filter((receipt) => {
      if (filters.category !== "all" && receipt.category !== filters.category) {
        return false;
      }
      if (filters.favoritesOnly && !receipt.favorite) {
        return false;
      }
      if (filters.pinnedOnly && !receipt.pinned) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      const searchable = [
        receipt.store,
        receipt.category,
        receipt.items.map((item) => item.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [sortedHistory, filters]);

  useEffect(() => {
    if (!filteredHistory.length) {
      setSelectedReceiptId("");
      return;
    }
    if (!filteredHistory.some((receipt) => receipt.id === selectedReceiptId)) {
      setSelectedReceiptId(filteredHistory[0].id);
    }
  }, [filteredHistory, selectedReceiptId]);

  const selectedReceipt = filteredHistory.find(
    (receipt) => receipt.id === selectedReceiptId,
  );

  const monthlyBuckets = useMemo(
    () => computeMonthlyBuckets(history).slice(-4),
    [history],
  );
  const categorySplit = useMemo(
    () => computeCategorySplit(history).slice(0, 4),
    [history],
  );
  const averageTicket = useMemo(
    () => computeAverageTicket(history),
    [history],
  );
  const monthSpend = useMemo(() => calcMonthSpend(history), [history]);

  const confidencePercent = Math.round(draft.confidence * 100);
  const taxConfidencePercent = Math.round(draft.taxConfidence * 100);
  const requiresRetake =
    draft.confidence > 0 && draft.confidence < 0.65 && !isProcessing;

  const lineItemTotal = useMemo(
    () =>
      draft.items.reduce(
        (sum, item) => (Number.isFinite(item.price) ? sum + item.price : sum),
        0,
      ),
    [draft.items],
  );

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setIsProcessing(true);
    setConfirmReview(false);
    setUploadMeta({
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    });

    try {
      const processed = await mockProcessReceipt(file);
      setDraft(processed);
    } catch {
      setError("Processing failed. Please try another capture.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemChange = (
    index: number,
    field: keyof ReceiptItem,
    value: string,
  ) => {
    setDraft((prev) => {
      const items = prev.items.map((item, idx) => {
        if (idx !== index) {
          return item;
        }
        if (field === "price" || field === "quantity") {
          return {
            ...item,
            [field]: Number(value),
          };
        }
        return {
          ...item,
          [field]: value,
        };
      });
      return { ...prev, items };
    });
    setConfirmReview(false);
  };

  const addLineItem = () => {
    setDraft((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: makeItemId(),
          name: "",
          quantity: 1,
          price: 0,
        },
      ],
    }));
  };

  const removeItem = (index: number) => {
    setDraft((prev) => {
      if (prev.items.length === 1) {
        return prev;
      }
      const items = prev.items.filter((_, idx) => idx !== index);
      return { ...prev, items };
    });
  };

  const handleSaveReceipt = () => {
    if (!confirmReview) {
      return;
    }
    if (!draft.store.trim() || draft.total <= 0) {
      setError("Store name and total are required to save.");
      return;
    }
    const newReceipt = createReceiptFromDraft(draft);
    setHistory((prev) => [newReceipt, ...prev]);
    setSelectedReceiptId(newReceipt.id);
    setDraft(emptyReceiptDraft());
    setConfirmReview(false);
    setUploadMeta({});
    setError(null);
  };

  const toggleFavorite = (id: string) => {
    setHistory((prev) =>
      prev.map((receipt) =>
        receipt.id === id
          ? { ...receipt, favorite: !receipt.favorite }
          : receipt,
      ),
    );
  };

  const togglePinned = (id: string) => {
    setHistory((prev) =>
      prev.map((receipt) =>
        receipt.id === id ? { ...receipt, pinned: !receipt.pinned } : receipt,
      ),
    );
  };
  const preferenceToggles: { key: keyof PreferenceState; label: string; desc: string }[] =
    [
      {
        key: "insights",
        label: "Monthly insights",
        desc: "Show spend analytics & trends.",
      },
      {
        key: "summaries",
        label: "AI summary",
        desc: "Show GPT-4o-mini notes per receipt.",
      },
      {
        key: "emoji",
        label: "Emoji tagging",
        desc: "Apply quick visual tags for receipts.",
      },
    ];

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_55%)]" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-emerald-200">
              MVP Sprint
            </span>
            <span>Images deleted post OCR</span>
            <span>Structured AI output</span>
            <span>User history preserved</span>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                Receiptly
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-white md:text-5xl">
                Capture, verify, and save every receipt in seconds.
              </h1>
              <p className="mt-2 max-w-2xl text-lg text-slate-300">
                Upload paper or digital proof, let OCR + GPT-4o-mini interpret
                it, and store structured data for lightning-fast search.
              </p>
            </div>
            <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Avg. processing</span>
                <span className="font-medium text-white">~1.2s (mock)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Receipt limit</span>
                <span className="font-medium text-white">Unlimited</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Export</span>
                <span className="font-medium text-white">
                  CSV (coming soon)
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">
                    Receipt capture
                  </p>
                  <p className="text-sm text-slate-300">
                    Upload files or shoot directly from mobile.
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  Supported: PDF, PNG, JPG, HEIC
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="group flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300/50 bg-emerald-400/5 px-4 py-8 text-center text-sm text-emerald-100 transition hover:border-emerald-200/80 hover:bg-emerald-400/10">
                  <span className="text-base font-semibold text-emerald-100">
                    Drop receipt or click to upload
                  </span>
                  <span className="mt-2 text-xs text-emerald-200/70">
                    Files are deleted once OCR completes.
                  </span>
                  <input
                    type="file"
                    accept={fileAccept}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                <div className="rounded-2xl border border-white/5 bg-black/30 p-4 text-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                    <span>Status</span>
                    <span>
                      {isProcessing
                        ? "Processing"
                        : draft.store
                          ? "Ready"
                          : "Idle"}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">File</span>
                      <span className="font-medium text-white">
                        {uploadMeta.name ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Size</span>
                      <span className="font-medium text-white">
                        {formatBytes(uploadMeta.size)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Captured</span>
                      <span className="font-medium text-white">
                        {uploadMeta.uploadedAt
                          ? formatDisplayDate(uploadMeta.uploadedAt)
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    Encrypted transit · auto-delete confirmed.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/5 bg-black/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">
                    Model confidence
                  </p>
                  <span className="rounded-full border border-emerald-300/40 px-3 py-1 text-xs text-emerald-100">
                    OCR + GPT-4o-mini
                  </span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-emerald-300 to-sky-400 transition-all"
                    style={{ width: `${confidencePercent || 0}%` }}
                  />
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      OCR
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {confidencePercent || "—"}%
                    </p>
                    <p className="text-xs text-slate-400">
                      Raw text extraction
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Tax detection
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {taxConfidencePercent || "—"}%
                    </p>
                    <p className="text-xs text-slate-400">
                      Subtotal + tax alignment
                    </p>
                  </div>
                </div>
                {requiresRetake && (
                  <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
                    Confidence looks low—try retaking the photo or uploading a
                    sharper scan.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">
                    Structured receipt
                  </p>
                  <p className="text-sm text-slate-300">
                    Edit any field before committing to history.
                  </p>
                </div>
                <div className="flex gap-2 text-xs text-slate-300">
                  <span>Manual confirmation required</span>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Store</span>
                  <input
                    value={draft.store}
                    onChange={(event) => {
                      setDraft((prev) => ({ ...prev, store: event.target.value }));
                      setConfirmReview(false);
                    }}
                    placeholder="Ex. Harvest Lane Market"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Purchase date</span>
                  <input
                    type="date"
                    value={draft.date.slice(0, 10)}
                    onChange={(event) => {
                      setDraft((prev) => ({ ...prev, date: event.target.value }));
                      setConfirmReview(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Total amount</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.total}
                    onChange={(event) => {
                      setDraft((prev) => ({
                        ...prev,
                        total: Number(event.target.value),
                      }));
                      setConfirmReview(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Tax</span>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.tax}
                    onChange={(event) => {
                      setDraft((prev) => ({
                        ...prev,
                        tax: Number(event.target.value),
                      }));
                      setConfirmReview(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Category</span>
                  <select
                    value={draft.category}
                    onChange={(event) => {
                      setDraft((prev) => ({ ...prev, category: event.target.value }));
                      setConfirmReview(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  >
                    <option value="">Select</option>
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Payment method</span>
                  <select
                    value={draft.paymentMethod}
                    onChange={(event) => {
                      setDraft((prev) => ({
                        ...prev,
                        paymentMethod: event.target.value,
                      }));
                      setConfirmReview(false);
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-300">Line items</p>
                  <button
                    type="button"
                    className="text-sm text-emerald-200 hover:text-emerald-100"
                    onClick={addLineItem}
                  >
                    + Add item
                  </button>
                </div>
                <div className="space-y-3">
                  {draft.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 sm:flex-row"
                    >
                      <input
                        value={item.name}
                        placeholder="Description"
                        onChange={(event) =>
                          handleItemChange(index, "name", event.target.value)
                        }
                        className="flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-300/70"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        min={0}
                        onChange={(event) =>
                          handleItemChange(index, "quantity", event.target.value)
                        }
                        className="w-20 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-300/70"
                      />
                      <input
                        type="number"
                        placeholder="Amount"
                        value={item.price}
                        step="0.01"
                        onChange={(event) =>
                          handleItemChange(index, "price", event.target.value)
                        }
                        className="w-28 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-300/70"
                      />
                      <button
                        type="button"
                        disabled={draft.items.length === 1}
                        onClick={() => removeItem(index)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <span>
                    Items sum:{" "}
                    <span className="font-semibold text-white">
                      {formatCurrency(lineItemTotal)}
                    </span>
                  </span>
                  <span>
                    Difference vs. total:{" "}
                    <span className="font-semibold text-white">
                      {formatCurrency(draft.total - lineItemTotal)}
                    </span>
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Notes</span>
                  <textarea
                    rows={3}
                    value={draft.notes ?? ""}
                    onChange={(event) => {
                      setDraft((prev) => ({ ...prev, notes: event.target.value }));
                      setConfirmReview(false);
                    }}
                    placeholder="Add context, reimbursement code, etc."
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/70"
                  />
                </label>
                <div className="space-y-2 text-sm">
                  <span className="text-slate-300">Raw OCR text</span>
                  <pre className="h-32 overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300">
                    {draft.rawText || "Awaiting capture..."}
                  </pre>
                </div>
              </div>

              {preferences.summaries && draft.summary && (
                <div className="mt-6 rounded-2xl border border-white/5 bg-gradient-to-r from-sky-500/10 to-emerald-500/10 p-4 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
                    AI summary
                  </p>
                  <p className="mt-2 text-base text-white">{draft.summary}</p>
                </div>
              )}

              {draft.suggestions.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-slate-300">Suggestions</p>
                  <ul className="space-y-2 text-sm text-slate-200">
                    {draft.suggestions.map((tip) => (
                      <li
                        key={tip}
                        className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3"
                      >
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/5 bg-black/40 p-4">
                <label className="flex items-center gap-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={confirmReview}
                    onChange={(event) => setConfirmReview(event.target.checked)}
                    className="h-4 w-4 rounded border border-white/30 bg-transparent accent-emerald-400"
                  />
                  I reviewed the fields above.
                </label>
                <button
                  type="button"
                  onClick={handleSaveReceipt}
                  disabled={
                    !confirmReview || !draft.store.trim() || draft.total <= 0
                  }
                  className="rounded-2xl bg-emerald-400/90 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/30"
                >
                  Save to history
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100">
                {error}
              </p>
            )}
          </div>
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm font-medium text-white">Workspace prefs</p>
              <div className="mt-5 space-y-4">
                {preferenceToggles.map((pref) => (
                  <button
                    key={pref.key}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm transition hover:border-white/30"
                    onClick={() =>
                      setPreferences((prev) => ({
                        ...prev,
                        [pref.key]: !prev[pref.key],
                      }))
                    }
                  >
                    <span>
                      <span className="block font-medium text-white">
                        {pref.label}
                      </span>
                      <span className="text-xs text-slate-400">
                        {pref.desc}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        preferences[pref.key]
                          ? "bg-emerald-400/20 text-emerald-200"
                          : "bg-white/10 text-slate-400"
                      }`}
                    >
                      {preferences[pref.key] ? "On" : "Off"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">
                    Receipt history
                  </p>
                  <div className="flex gap-2 text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          favoritesOnly: !prev.favoritesOnly,
                        }))
                      }
                      className={`rounded-full px-3 py-1 ${
                        filters.favoritesOnly
                          ? "bg-amber-400/20 text-amber-100"
                          : "bg-white/10 text-slate-400"
                      }`}
                    >
                      Favorites
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          pinnedOnly: !prev.pinnedOnly,
                        }))
                      }
                      className={`rounded-full px-3 py-1 ${
                        filters.pinnedOnly
                          ? "bg-sky-400/20 text-sky-100"
                          : "bg-white/10 text-slate-400"
                      }`}
                    >
                      Pinned
                    </button>
                  </div>
                </div>
                <input
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, query: event.target.value }))
                  }
                  placeholder="Search by store, category, or item"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-emerald-300/70"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, category: "all" }))
                    }
                    className={`rounded-full px-3 py-1 ${
                      filters.category === "all"
                        ? "bg-emerald-400/20 text-emerald-100"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    All categories
                  </button>
                  {CATEGORY_OPTIONS.map((category) => (
                    <button
                      type="button"
                      key={category}
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, category }))
                      }
                      className={`rounded-full px-3 py-1 ${
                        filters.category === category
                          ? "bg-emerald-400/20 text-emerald-100"
                          : "bg-white/10 text-slate-400"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {filteredHistory.length === 0 && (
                  <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-400">
                    Nothing yet—capture a receipt to populate history.
                  </p>
                )}
                {filteredHistory.map((receipt) => (
                  <button
                    key={receipt.id}
                    type="button"
                    onClick={() => setSelectedReceiptId(receipt.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      receipt.id === selectedReceiptId
                        ? "border-emerald-300/60 bg-emerald-400/5"
                        : "border-white/10 bg-black/30 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-start justify-between text-sm">
                      <div>
                        <p className="text-white">
                          {preferences.emoji && receipt.emojiTag
                            ? `${receipt.emojiTag} `
                            : ""}
                          {receipt.store}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDisplayDate(receipt.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">
                          {formatCurrency(receipt.total)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {receipt.category}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(receipt.id);
                          }}
                          className={`rounded-full border px-2 py-0.5 ${
                            receipt.favorite
                              ? "border-amber-300/50 text-amber-200"
                              : "border-white/10 text-slate-400"
                          }`}
                        >
                          ?
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePinned(receipt.id);
                          }}
                          className={`rounded-full border px-2 py-0.5 ${
                            receipt.pinned
                              ? "border-sky-300/50 text-sky-200"
                              : "border-white/10 text-slate-400"
                          }`}
                        >
                          ??
                        </button>
                      </div>
                      <span>{receipt.paymentMethod}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {preferences.insights && (
              <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
                <p className="text-sm font-medium text-white">
                  Monthly insights
                </p>
                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs text-slate-400">This month</p>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {formatCurrency(monthSpend.current)}
                      </p>
                      <p
                        className={`text-xs ${
                          monthSpend.delta >= 0
                            ? "text-rose-200"
                            : "text-emerald-200"
                        }`}
                      >
                        {monthSpend.delta >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(monthSpend.delta))} vs last
                        month
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs text-slate-400">Avg. ticket</p>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {formatCurrency(averageTicket || 0)}
                      </p>
                      <p className="text-xs text-slate-400">
                        Based on {history.length} receipts
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Category distribution
                    </p>
                    <div className="mt-3 space-y-3">
                      {categorySplit.map((category) => (
                        <div key={category.category} className="text-sm">
                          <div className="flex items-center justify-between text-white">
                            <span>{category.category}</span>
                            <span>{formatCurrency(category.total)}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-white/10">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-indigo-400 to-emerald-300"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (category.total /
                                    (history.reduce(
                                      (sum, receipt) => sum + receipt.total,
                                      0,
                                    ) || 1)) *
                                    100,
                                ).toFixed(2)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Trending last 4 months
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                      {monthlyBuckets.map((bucket) => (
                        <div
                          key={bucket.key}
                          className="rounded-2xl border border-white/10 bg-black/30 p-3"
                        >
                          <p className="text-xs text-slate-400">
                            {bucket.label}
                          </p>
                          <p className="mt-1 text-base text-white">
                            {formatCurrency(bucket.total)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedReceipt && (
              <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {selectedReceipt.store}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDisplayDate(selectedReceipt.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-white">
                      {formatCurrency(selectedReceipt.total)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {selectedReceipt.paymentMethod}
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-2 text-sm text-slate-200">
                  {selectedReceipt.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-3 py-2"
                    >
                      <span>
                        {preferences.emoji && item.emoji ? `${item.emoji} ` : ""}
                        {item.name}
                        {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                      </span>
                      <span>{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>
                {preferences.summaries && selectedReceipt.summary && (
                  <p className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-slate-300">
                    {selectedReceipt.summary}
                  </p>
                )}
                {selectedReceipt.notes && (
                  <p className="mt-3 text-xs text-slate-400">
                    Notes: {selectedReceipt.notes}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

