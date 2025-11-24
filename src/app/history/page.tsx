"use client";

import { useState, useMemo } from "react";
import {
  CATEGORY_OPTIONS,
  type Receipt,
  formatCurrency,
  formatDisplayDate,
  computeAverageTicket,
  computeCategorySplit,
  computeMonthlyBuckets,
} from "@/lib/receipts";
import { generateBulkCSV, downloadCSV } from "@/lib/csvExport";
import Link from "next/link";

type FilterState = {
  query: string;
  category: string;
  favoritesOnly: boolean;
  pinnedOnly: boolean;
  sortBy: "date" | "total" | "store";
  sortOrder: "asc" | "desc";
};

// TODO: Replace with actual database fetch
// For now, we'll load from localStorage to persist data
function loadReceiptsFromStorage(): Receipt[] {
  if (typeof window === "undefined") return [];
  
  try {
    const stored = localStorage.getItem("receiptHistory");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function HistoryPage() {
  // TODO: Replace with database fetch (e.g., useEffect + API call)
  const [receipts, setReceipts] = useState<Receipt[]>(loadReceiptsFromStorage());
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    query: "",
    category: "all",
    favoritesOnly: false,
    pinnedOnly: false,
    sortBy: "date",
    sortOrder: "desc",
  });

    
    const sortedAndFilteredReceipts = useMemo(() => {
    let filtered = [...receipts];

    // Apply filters
    if (filters.category !== "all") {
      filtered = filtered.filter((r) => r.category === filters.category);
    }
    if (filters.favoritesOnly) {
      filtered = filtered.filter((r) => r.favorite);
    }
    if (filters.pinnedOnly) {
      filtered = filtered.filter((r) => r.pinned);
    }
    if (filters.query.trim()) {
      const query = filters.query.toLowerCase();
      filtered = filtered.filter((r) =>
        [
          r.store,
          r.category,
          r.items.map((i) => i.name).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      if (filters.sortBy === "date") {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (filters.sortBy === "total") {
        comparison = a.total - b.total;
      } else if (filters.sortBy === "store") {
        comparison = a.store.localeCompare(b.store);
      }

      return filters.sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [receipts, filters]);

  const selectedReceipt = useMemo(
    () => receipts.find((r) => r.id === selectedReceiptId),
    [receipts, selectedReceiptId]
  );

  const stats = useMemo(() => {
    return {
      total: receipts.reduce((sum, r) => sum + r.total, 0),
      count: receipts.length,
      averageTicket: computeAverageTicket(receipts),
      categorySplit: computeCategorySplit(receipts).slice(0, 5),
      monthlyBuckets: computeMonthlyBuckets(receipts).slice(-6),
    };
  }, [receipts]);

  const toggleFavorite = (id: string) => {
    // TODO: Update via API call to database
    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r))
    );
  };

  const togglePinned = (id: string) => {
    // TODO: Update via API call to database
    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r))
    );
  };

  const deleteReceipt = (id: string) => {
  // TODO: Delete via API call to database
  if (confirm("Are you sure you want to delete this receipt?")) {
    setReceipts((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      
      // Update localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("receiptHistory", JSON.stringify(updated));
      }
      
      return updated;
    });
    
    if (selectedReceiptId === id) {
      setSelectedReceiptId(null);
    }
  }
};

  const handleExportAll = () => {
    if (sortedAndFilteredReceipts.length === 0) return;
    
    const csvContent = generateBulkCSV(sortedAndFilteredReceipts);
    const filename = `receipts_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(csvContent, filename);
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_55%)]" />
      
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        {/* Header */}
        <header className="flex flex-col gap-6 rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                Receiptly
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-white">
                Receipt History
              </h1>
              <p className="mt-2 text-lg text-slate-300">
                View, search, and manage all your saved receipts
              </p>
            </div>
            <Link
              href="/"
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ← Back to Upload
            </Link>
          </div>

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs text-slate-400">Total Receipts</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {stats.count}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs text-slate-400">Total Spent</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {formatCurrency(stats.total)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs text-slate-400">Average Ticket</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {formatCurrency(stats.averageTicket)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <button
                onClick={handleExportAll}
                disabled={sortedAndFilteredReceipts.length === 0}
                className="w-full rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:bg-slate-700 disabled:cursor-not-allowed"
              >
                Export Filtered CSV
              </button>
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
          <div className="space-y-4">
            {/* Search */}
            <input
              value={filters.query}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, query: e.target.value }))
              }
              placeholder="Search by store, category, or item..."
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-emerald-300/70"
            />

            {/* Filter Buttons */}
            <div className="flex flex-wrap gap-3">
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      favoritesOnly: !prev.favoritesOnly,
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    filters.favoritesOnly
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-white/10 text-slate-400 hover:bg-white/20"
                  }`}
                >
                  ⭐ Favorites
                </button>
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      pinnedOnly: !prev.pinnedOnly,
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    filters.pinnedOnly
                      ? "bg-sky-400/20 text-sky-100"
                      : "bg-white/10 text-slate-400 hover:bg-white/20"
                  }`}
                >
                  📌 Pinned
                </button>
              </div>

              <div className="h-6 w-px bg-white/20" />

              {/* Category Filters */}
              <button
                onClick={() =>
                  setFilters((prev) => ({ ...prev, category: "all" }))
                }
                className={`rounded-full px-3 py-1 text-xs transition ${
                  filters.category === "all"
                    ? "bg-emerald-400/20 text-emerald-100"
                    : "bg-white/10 text-slate-400 hover:bg-white/20"
                }`}
              >
                All Categories
              </button>
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, category: cat }))
                  }
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    filters.category === cat
                      ? "bg-emerald-400/20 text-emerald-100"
                      : "bg-white/10 text-slate-400 hover:bg-white/20"
                  }`}
                >
                  {cat}
                </button>
              ))}

              <div className="h-6 w-px bg-white/20" />

              {/* Sort Options */}
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    sortBy: e.target.value as any,
                  }))
                }
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300 outline-none hover:bg-white/20"
              >
                <option value="date">Sort by Date</option>
                <option value="total">Sort by Total</option>
                <option value="store">Sort by Store</option>
              </select>
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
                  }))
                }
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/20"
              >
                {filters.sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>
            </div>

            {/* Results Count */}
            <p className="text-sm text-slate-400">
              Showing {sortedAndFilteredReceipts.length} of {receipts.length}{" "}
              receipts
            </p>
          </div>
        </section>

        {/* Main Content */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Receipts List */}
          <div className="space-y-3 rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">All Receipts</h2>

            {sortedAndFilteredReceipts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center">
                <p className="text-slate-400">
                  {receipts.length === 0
                    ? "No receipts yet. Upload your first receipt!"
                    : "No receipts match your filters."}
                </p>
              </div>
            ) : (
              <div className="max-h-[600px] space-y-3 overflow-y-auto pr-2">
                {sortedAndFilteredReceipts.map((receipt) => (
                  <div
                    key={receipt.id}
                    className={`group rounded-2xl border p-4 transition ${
                      selectedReceiptId === receipt.id
                        ? "border-emerald-300/60 bg-emerald-400/5"
                        : "border-white/10 bg-black/30 hover:border-white/30"
                    }`}
                  >
                    <div
                      className="cursor-pointer"
                      onClick={() => setSelectedReceiptId(receipt.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-white">
                            {receipt.emojiTag && `${receipt.emojiTag} `}
                            {receipt.store}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDisplayDate(receipt.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">
                            {formatCurrency(receipt.total)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {receipt.category}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span>{receipt.paymentMethod}</span>
                        <span>{receipt.items.length} items</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(receipt.id);
                        }}
                        className={`rounded-lg border px-3 py-1 text-xs transition ${
                          receipt.favorite
                            ? "border-amber-300/50 bg-amber-400/10 text-amber-200"
                            : "border-white/10 text-slate-400 hover:border-amber-300/50 hover:text-amber-200"
                        }`}
                      >
                        {receipt.favorite ? "★ Favorited" : "☆ Favorite"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinned(receipt.id);
                        }}
                        className={`rounded-lg border px-3 py-1 text-xs transition ${
                          receipt.pinned
                            ? "border-sky-300/50 bg-sky-400/10 text-sky-200"
                            : "border-white/10 text-slate-400 hover:border-sky-300/50 hover:text-sky-200"
                        }`}
                      >
                        {receipt.pinned ? "📌 Pinned" : "📍 Pin"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReceipt(receipt.id);
                        }}
                        className="ml-auto rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-400 transition hover:border-rose-400/50 hover:text-rose-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Receipt Detail */}
          <div className="rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur">
            {selectedReceipt ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">
                      {selectedReceipt.store}
                    </h2>
                    <p className="text-sm text-slate-400">
                      {formatDisplayDate(selectedReceipt.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-emerald-400">
                      {formatCurrency(selectedReceipt.total)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Tax: {formatCurrency(selectedReceipt.tax)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
                  <div>
                    <p className="text-slate-400">Category</p>
                    <p className="font-medium text-white">
                      {selectedReceipt.category}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Payment</p>
                    <p className="font-medium text-white">
                      {selectedReceipt.paymentMethod}
                    </p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h3 className="mb-3 text-sm font-medium text-slate-300">
                    Items ({selectedReceipt.items.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedReceipt.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-200">
                          {item.emoji && `${item.emoji} `}
                          {item.name}
                          {item.quantity > 1 && ` ×${item.quantity}`}
                        </span>
                        <span className="font-medium text-white">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                {selectedReceipt.summary && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      AI Summary
                    </p>
                    <p className="mt-2 text-sm text-slate-200">
                      {selectedReceipt.summary}
                    </p>
                  </div>
                )}

                {/* Notes */}
                {selectedReceipt.notes && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Notes
                    </p>
                    <p className="mt-2 text-sm text-slate-200">
                      {selectedReceipt.notes}
                    </p>
                  </div>
                )}

                {/* Raw Text */}
                {selectedReceipt.rawText && (
                  <details className="rounded-2xl border border-white/10 bg-black/30">
                    <summary className="cursor-pointer p-4 text-sm font-medium text-slate-300 hover:bg-white/5">
                      View Raw OCR Text
                    </summary>
                    <pre className="overflow-auto p-4 text-xs text-slate-400">
                      {selectedReceipt.rawText}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-400">
                <p>Select a receipt to view details</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}