import type { ReceiptDraft, Receipt } from "./receipts.ts";

// Convert a single receipt/draft to CSV row
export function receiptToCSVRow(receipt: ReceiptDraft | Receipt): string {
  // Escape fields that might contain commas or quotes
  const escape = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '""';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Format items as a semicolon-separated list within the cell
  const itemsList = 'items' in receipt 
    ? receipt.items.map(item => 
        `${item.name} (x${item.quantity}) - $${item.price.toFixed(2)}`
      ).join('; ')
    : '';

  return [
    escape(receipt.store),
    escape(receipt.date),
    escape(receipt.total.toFixed(2)),
    escape(receipt.tax.toFixed(2)),
    escape(receipt.category),
    escape(receipt.paymentMethod),
    escape(itemsList),
    escape(receipt.notes || ''),
  ].join(',');
}

// Generate CSV content with headers
export function generateCSV(receipt: ReceiptDraft | Receipt): string {
  const headers = [
    'Store',
    'Date',
    'Total',
    'Tax',
    'Category',
    'Payment Method',
    'Items',
    'Notes',
  ].join(',');

  const row = receiptToCSVRow(receipt);
  
  return `${headers}\n${row}`;
}

// Generate CSV for multiple receipts
export function generateBulkCSV(receipts: (ReceiptDraft | Receipt)[]): string {
  const headers = [
    'Store',
    'Date',
    'Total',
    'Tax',
    'Category',
    'Payment Method',
    'Items',
    'Notes',
  ].join(',');

  const rows = receipts.map(receiptToCSVRow).join('\n');
  
  return `${headers}\n${rows}`;
}

// Trigger browser download
export function downloadCSV(csvContent: string, filename: string = 'receipt.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}