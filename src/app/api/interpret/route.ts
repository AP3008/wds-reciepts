import { ReceiptItem } from "@/lib/receipts.js";
import Groq from "groq-sdk"; 
import { NextResponse } from "next/server.js";


//Definition for the expected structure of a reciept item
type RecieptItem = {
    name: string; //Name of the Item 
    quantity: number; //Number of the Item 
    price: number; //Price per item or total for the item
}; 

type InterpretedReceipt = {
  vendor: string;           // Store name (e.g., "Whole Foods Market")
  date: string;             // Purchase date in YYYY-MM-DD format
  total: number;            // Final total amount paid
  tax: number;              // Tax amount (0 if not found)
  subtotal: number;         // Subtotal before tax (0 if not found)
  items: ReceiptItem[];     // Array of purchased items
  paymentMethod: string;    // How they paid (e.g., "Credit Card", "Cash")
  confidence: number;       // LLM's confidence in extraction (0-1)
};


//Post request that Next.js recognizes 

export async function POST(request: Request){
    try{

        //Initializing Groq client 

        const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
        });

        const body = await request.json() as { ocrText?: string }; 
        const { ocrText } = body; 
        if(!ocrText || typeof ocrText !== "string"){
            return NextResponse.json(
                {error: "OCR text is required and must be a string"}, 
                {status: 400} //400 = Bad request 
            );
        }

        const prompt = `You are a reciept parsing expert. Analyze the following OCR text from a reciept and extract structured information.
        OCR Text:
     ${ocrText}
     
     Extract and return a JSON object with the follwing structure:
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
        "paymentMethod": "Credit Card" | "Cash" | "Debit Card" | "Unknown",
        "confidence": number between 0 and 1 (your confidence in this extraction)
     }
    
     Rules: 
     -Extract ALL items you can identify
     -If a field is unclear, make your best guess
     -For dates, try to infer the year if not present (use current year)
     -Set confidence lower if the OCR text is messy or unclear 
     -Return ONLY valid JSON, no markdown or extra text 
     -If total/tax/subtotal aren't clear, calculate them from items if possible 
     `

     console.log("Sending request to Groq API...");
     const completion = await groq.chat.completions.create(
        {
            model: "llama-3.3-70b-versatile",
            messages:[
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0,
            max_tokens: 2048, //Shouldn't need anything more than 2000 tokens for reciepts 
            top_p: 1, //Controls diversity of output (1 = consider all possibilities)
            stop: null, //Not needed for our usecase 
        }
     );

     const responseText = completion.choices[0]?.message?.content; 

     if(!responseText){
        console.error("No response from Groq API");
        return NextResponse.json(
            { error: "No response from Groq API"},
            { status: 500} //500 = Server error
        );
     }

     console.log("Groq API Response:", responseText);
     let interpretedData: InterpretedReceipt;
     try{
        const cleanedResponse = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(); 
        //Parse the cleaned JSON String into JSON object 
        interpretedData = JSON.parse(cleanedResponse);
     }
     catch (parseError){
        console.error("Failed to parse Groq response as JSON:", parseError);
        console.error("Raw response", responseText);
        return NextResponse.json(
            { 
            error: "Failed to parse LLM response",
            details: parseError instanceof Error ? parseError.message : "Unknown error",
            rawResponse: responseText 
            },
            { status: 500 }
        );
        }

    //Validate the parsed data has required fields
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
    console.log("Successfully interpreted receipt:", interpretedData);
    
    //returning the successfully interpreted reciept data
    return NextResponse.json({
      success: true,
      data: interpretedData,
    });
    }
    catch(error){
        console.error("Error Occurred:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                detailes: error instanceof Error ? error.message:"Unknown error"
            },
            {status: 500}
        );
    }
}

//GET requests handled for testing endpoint 
export async function GET() {
  return NextResponse.json({
    message: "Receipt interpretation API is running",
    method: "POST",
    expectedBody: {
      ocrText: "string - raw OCR text from receipt"
    }
  });
}