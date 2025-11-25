import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import type { Receipt } from "@/lib/receipts";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type SummarizeRequest = {
  type: "single" | "bulk";
  receipt?: any; // For single receipt summary
  receipts?: Receipt[]; // For bulk history summary
};

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not set");
      return NextResponse.json(
        { error: "Server configuration error: GROQ_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const body = await request.json() as SummarizeRequest;
    const { type, receipt, receipts } = body;

    let prompt = "";

    if (type === "single" && receipt) {
      // Generate summary for a single receipt
      prompt = `You are a financial assistant analyzing a receipt. Provide a brief, helpful summary (2-3 sentences max) about this purchase.

Receipt Details:
- Store: ${receipt.vendor || receipt.store}
- Date: ${receipt.date}
- Total: $${receipt.total}
- Items: ${receipt.items?.map((item: any) => item.name).join(", ")}
- Category: ${receipt.category || "Not specified"}

Generate a concise summary focusing on:
1. What was purchased
2. Any notable spending patterns or insights
3. Brief context about the purchase

Keep it friendly and informative. Return ONLY the summary text, no JSON.`;

    } else if (type === "bulk" && receipts && receipts.length > 0) {
      // Generate summary for receipt history
      const totalSpent = receipts.reduce((sum, r) => sum + r.total, 0);
      const categories = receipts.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + r.total;
        return acc;
      }, {} as Record<string, number>);

      const topCategories = Object.entries(categories)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([cat, amount]) => `${cat}: $${amount.toFixed(2)}`);

      const stores = [...new Set(receipts.map(r => r.store))];
      const dateRange = receipts.length > 0 ? {
        start: new Date(Math.min(...receipts.map(r => new Date(r.date).getTime()))),
        end: new Date(Math.max(...receipts.map(r => new Date(r.date).getTime())))
      } : null;

      prompt = `You are a financial assistant analyzing spending history. Provide an insightful summary (4-5 sentences) of the user's spending patterns.

Spending Overview:
- Total Receipts: ${receipts.length}
- Total Spent: $${totalSpent.toFixed(2)}
- Date Range: ${dateRange ? `${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}` : "N/A"}
- Top Categories: ${topCategories.join(", ")}
- Stores Visited: ${stores.slice(0, 5).join(", ")}${stores.length > 5 ? ` and ${stores.length - 5} more` : ""}

Generate a comprehensive summary that:
1. Highlights overall spending trends
2. Identifies top spending categories
3. Notes any interesting patterns (frequent stores, spending habits)
4. Provides actionable insights or observations

Be conversational, insightful, and helpful. Return ONLY the summary text, no JSON.`;

    } else {
      return NextResponse.json(
        { error: "Invalid request: must specify type and provide receipt(s)" },
        { status: 400 }
      );
    }

    console.log("Generating AI summary...");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7, // Slightly higher for more natural language
      max_tokens: 500,
      top_p: 1,
      stop: null,
    });

    const summary = completion.choices[0]?.message?.content;

    if (!summary) {
      console.error("No response from Groq API");
      return NextResponse.json(
        { error: "No response from Groq API" },
        { status: 500 }
      );
    }

    console.log("AI summary generated successfully");

    return NextResponse.json({
      success: true,
      summary: summary.trim(),
    });

  } catch (error) {
    console.error("Error in /api/summarize:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "AI Summary API is running",
    method: "POST",
    expectedBody: {
      type: "'single' | 'bulk'",
      receipt: "Receipt object (for single)",
      receipts: "Receipt[] array (for bulk)"
    }
  });
}