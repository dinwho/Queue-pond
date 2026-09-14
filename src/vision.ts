import OpenAI from "openai";



export type VisionPriceResult =
  | { ok: true; price: number; currency?: string; confidence: number }
  | { ok: false; retryable: boolean; reason: string };


  
export async function readPriceFromScreenshot(screenshotBase64: string): Promise<VisionPriceResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, retryable: false, reason: "Vision fallback is not configured: set OPENAI_API_KEY" };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); 
  //read from screenshot part, only as a fallback ahh


  try {
    const response = await client.responses.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna",
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Read the current purchasable product price.Ignore crossed-out, was, installment, coupon, shipping, and unrelated prices. Return JSON only: {\\\"price\\\": number | null, \\\"currency\\\": string | null, \\\"confidence\\\": number}.",
        },
        { type: "input_image", image_url: `data:image/png;base64,${screenshotBase64}`, detail: "low" },
      ],
    }],
    });

    const parsed = JSON.parse(response.output_text) as { price?: unknown; currency?: unknown; confidence?: unknown };
    const price = typeof parsed.price === "number" ? parsed.price : Number(parsed.price);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(confidence) || confidence < 0.9) {
      return { ok: false, retryable: false, reason: "Vision response did not contain a high-confidence price" };
    }
    return { ok: true, price, confidence, currency: typeof parsed.currency === "string" ? parsed.currency : undefined };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      reason: error instanceof Error ? `Vision fallback failed: ${error.message}` : "Vision fallback failed",
    };
  }
}
