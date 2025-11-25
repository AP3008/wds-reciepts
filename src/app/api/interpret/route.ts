import { ReceiptItem } from "@/lib/receipts.js";
import Groq from "groq-sdk"; 
import { NextResponse } from "next/server.js";

type InterpretedReceipt = {
  vendor: string;
  date: string;
  total: number;
  tax: number;
  subtotal: number;
  items: ReceiptItem[];
  paymentMethod: string;
  confidence: number;
};

export async function POST(request: Request) {
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const body = await request.json() as { ocrText?: string }; 
    const { ocrText } = body; 
    
    if (!ocrText || typeof ocrText !== "string") {
      return NextResponse.json(
        { error: "OCR text is required and must be a string" }, 
        { status: 400 }
      );
    }

    // Enhanced prompt with better tax detection instructions
    const prompt = `You are a receipt parsing expert. Analyze the following OCR text from a receipt and extract structured information.

OCR Text:
${ocrText}

Extract and return a JSON object with the following structure:
{
    "vendor": "store name",
    "date": "YYYY-MM-DD format",
    "total": number (final amount paid),
    "tax": number (tax amount, 0 if not found),
    "subtotal": number (subtotal before tax, 0 if not found),
    "items": [
        {
            "name": "item description",
            "quantity": number,
            "price": number (price for this line item)
        }
    ],
    "paymentMethod": "Credit Card" | "Cash" | "Debit Card" | "Visa" | "Mastercard" | "Amex" | "Apple Pay" | "Google Pay" | "Unknown",
    "confidence": number between 0 and 1 (your confidence in this extraction)
}

CRITICAL TAX DETECTION RULES:
1. Look for explicit tax labels: "Tax", "TAX", "GST", "PST", "HST", "VAT", "Sales Tax", "TOTAL TAX"
2. If you find a "Subtotal" and "Total", calculate: tax = total - subtotal
3. Common patterns: 
   - "SUBTOTAL: $X.XX"
   - "TAX: $Y.YY"
   - "TOTAL: $Z.ZZ"
4. If tax is found, ensure: subtotal + tax ≈ total (within $0.50)
5. If only "Total" exists with no tax mentioned, set tax to 0
6. Typical tax rates are 5-15% in most regions (use this to validate)

ITEM EXTRACTION RULES:
- Extract ALL items you can identify
- Each item should have: name, quantity (default 1 if not shown), and price
- Skip service fees, tips, or duplicate "total" lines
- If quantity is shown as "2x" or "x2", extract the quantity properly

CONFIDENCE SCORING:
- 0.9-1.0: All fields clear, tax calculation verified
- 0.7-0.89: Most fields clear, minor uncertainties
- 0.5-0.69: Some fields unclear, made educated guesses
- Below 0.5: OCR text is very poor or ambiguous

OTHER RULES:
- For dates, infer the year if not present (use ${new Date().getFullYear()})
- Return ONLY valid JSON, no markdown or extra text
- If fields are unclear, make your best guess but lower confidence
- Ensure all numbers are actual numbers, not strings`;

    console.log("Sending request to Groq API...");
    
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0, // Deterministic for consistent parsing
      max_tokens: 2048,
      top_p: 1,
      stop: null,
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      console.error("No response from Groq API");
      return NextResponse.json(
        { error: "No response from Groq API" },
        { status: 500 }
      );
    }

    console.log("Groq API Response:", responseText);
    
    let interpretedData: InterpretedReceipt;
    try {
      const cleanedResponse = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      
      interpretedData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse Groq response as JSON:", parseError);
      console.error("Raw response:", responseText);
      return NextResponse.json(
        { 
          error: "Failed to parse LLM response",
          details: parseError instanceof Error ? parseError.message : "Unknown error",
          rawResponse: responseText 
        },
        { status: 500 }
      );
    }

    // Validate the parsed data
    if (!interpretedData.vendor || !interpretedData.total) {
      console.error("Invalid receipt data structure:", interpretedData);
      return NextResponse.json(
        { 
          error: "LLM returned incomplete data",
          data: interpretedData 
        },
        { status: 500 }
      );
    }

    // Post-processing validation for tax
    if (interpretedData.subtotal > 0 && interpretedData.tax > 0) {
      const calculatedTotal = interpretedData.subtotal + interpretedData.tax;
      const difference = Math.abs(calculatedTotal - interpretedData.total);
      
      // If the math doesn't add up, log a warning
      if (difference > 0.5) {
        console.warn(
          `Tax calculation mismatch: subtotal ($${interpretedData.subtotal}) + ` +
          `tax ($${interpretedData.tax}) = $${calculatedTotal}, but total is $${interpretedData.total}. ` +
          `Difference: $${difference.toFixed(2)}`
        );
      }
    }

    console.log("Successfully interpreted receipt:", {
      vendor: interpretedData.vendor,
      total: interpretedData.total,
      tax: interpretedData.tax,
      subtotal: interpretedData.subtotal,
      itemCount: interpretedData.items?.length || 0,
      confidence: interpretedData.confidence
    });
    
    return NextResponse.json({
      success: true,
      data: interpretedData,
    });
    
  } catch (error) {
    console.error("Error in /api/interpret:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
 async function GET() {
  return NextResponse.json({
    message: "Receipt interpretation API is running",
    method: "POST",
    expectedBody: {
      ocrText: "string - raw OCR text from receipt"
    }
  });
}