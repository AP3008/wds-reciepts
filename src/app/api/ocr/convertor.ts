import { createWorker } from "tesseract.js";
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker - use local copy from public folder
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

// Convert PDF page to image that Tesseract can read
async function pdfPageToImage(page: any): Promise<string> {
  const viewport = page.getViewport({ scale: 2.0 }); // Higher scale = better quality
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Failed to get canvas context');
  }
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  return canvas.toDataURL('image/png');
}

// Process a PDF file and extract text from all pages
async function processPDF(file: File): Promise<string> {
  console.log("Processing PDF with multiple pages...");
  
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  console.log(`PDF has ${numPages} pages`);
  
  const worker = await createWorker('eng');
  let allText = '';

  // Process each page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    console.log(`Processing page ${pageNum} of ${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    const imageData = await pdfPageToImage(page);
    
    const { data: { text } } = await worker.recognize(imageData);
    
    // Add page separator for multi-page PDFs
    if (pageNum > 1) {
      allText += '\n\n--- PAGE BREAK ---\n\n';
    }
    allText += text;
  }

  await worker.terminate();
  console.log("PDF processing complete");
  
  return allText;
}

// Process image files (PNG, JPG, HEIC, etc.)
async function processImage(input: string | File): Promise<string> {
  console.log("Processing image file...");
  
  // If it's a File object, create a URL for it
  let imageUrl = input;
  let shouldCleanup = false;
  
  if (input instanceof File) {
    imageUrl = URL.createObjectURL(input);
    shouldCleanup = true;
  }
  
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(imageUrl as string);
  console.log("Image OCR complete");
  await worker.terminate();
  
  // Clean up object URL if we created one
  if (shouldCleanup && typeof imageUrl === 'string') {
    URL.revokeObjectURL(imageUrl);
  }
  
  return text;
}

// Main converter function - handles ALL file types
const convertor = async (input: string | File): Promise<string> => {
  // If it's a string (URL), treat it as an image
  if (typeof input === 'string') {
    return await processImage(input);
  }
  
  // If it's a File object, check the type
  if (input instanceof File) {
    // Handle PDF files
    if (input.type === 'application/pdf') {
      return await processPDF(input);
    }
    
    // Handle all image types (PNG, JPG, JPEG, HEIC, HEIF, etc.)
    return await processImage(input);
  }
  
  throw new Error('Invalid input type for OCR converter');
};

export default convertor;