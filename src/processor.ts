import type { PriceCheckTask } from ".";
import { Browser, BrowserContext, chromium, Page } from "playwright-core";

export type PriceSource = "json-ld" | "meta" | "selector" | "vision";

export type PriceExtractionResult =
  | { ok: true; price: number; currency?: string; source: PriceSource }
  | { ok: false; retryable: boolean; reason: string; screenshotBase64?: string };

function normalizeProductUrl(productUrl: string): string {
  const trimmed = productUrl.trim();
  if (/^\[.+\]\(.+\)$/.test(trimmed)) {
    throw new Error("productUrl must be a plain URL, not Markdown link syntax");
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) {
    throw new Error("productUrl must be an absolute http(s) URL");
  }
  return parsed.toString();
}

function parsePrice(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/\s/g, "").match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/);
  if (!match) return undefined;
  const price = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function currencyFrom(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes("₹")) return "INR";
  if (value.includes("$")) return "USD";
  if (value.includes("€")) return "EUR";
  if (value.includes("£")) return "GBP";
  return undefined;
}

function findJsonLdPrice(value: unknown): { price: number; currency?: string } | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findJsonLdPrice(item);
      if (result) return result;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const priceValue = record.price ?? record.lowPrice;
  if (typeof priceValue === "string" || typeof priceValue === "number") {
    const price = parsePrice(String(priceValue));
    if (price) return { price, currency: typeof record.priceCurrency === "string" ? record.priceCurrency : undefined };
  }

  return findJsonLdPrice(record.offers) ?? Object.values(record)
    .map(findJsonLdPrice)
    .find((result): result is { price: number; currency?: string } => Boolean(result));
}

async function extractDomPrice(page: Page): Promise<PriceExtractionResult | undefined> {
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  for (const script of jsonLd) {
    try {
      const result = findJsonLdPrice(JSON.parse(script));
      if (result) return { ok: true, ...result, source: "json-ld" };
    } catch { /* Ignore malformed JSON-LD and try another source. */ }
  }

  const meta = await page.locator('meta[property="product:price:amount"], meta[itemprop="price"], meta[name="price"]')
    .evaluateAll((elements) => elements.map((element) => ({
      price: element.getAttribute("content") ?? element.getAttribute("value"),
      currency: element.getAttribute("currency") ?? element.getAttribute("data-currency"),
    })));
  for (const candidate of meta) {
    const price = parsePrice(candidate.price);
    if (price) return { ok: true, price, currency: candidate.currency ?? undefined, source: "meta" };
  }

  const selectors = [
  "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen",
  "#corePrice_feature_div .priceToPay .a-offscreen",
  "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen",
  "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen",

  // Generic fallbacks only after Amazon-specific ones:
  '[itemprop="price"]',
  '[data-testid*="price" i]',
  '[data-price]',
];
  for (const selector of selectors) {
    const candidates = await page.locator(selector).evaluateAll((elements) => elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .slice(0, 5)
      .map((element) => ({
        text: element.textContent,
        value: element.getAttribute("content") ?? element.getAttribute("data-price"),
      })));
    for (const candidate of candidates) {
      const value = candidate.value ?? candidate.text;
      const price = parsePrice(value);
      if (price) return { ok: true, price, currency: currencyFrom(value), source: "selector" };
    }
  }
}

export async function processPriceCheck(task: PriceCheckTask): Promise<PriceExtractionResult> {
  const browserlessUrl = process.env.BROWSERLESS_URL || process.env.BROWSERLESSURL || "ws://localhost:3000?token=secrettoken123";
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let productUrl: string;

  try {
    productUrl = normalizeProductUrl(task.productUrl);
  } catch (error) {
    return {
      ok: false,
      retryable: false,
      reason: error instanceof Error ? error.message : "Invalid product URL",
    };
  }

  try {
    browser = await chromium.connectOverCDP(browserlessUrl, { timeout: 10_000 });
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const domResult = await extractDomPrice(page);
    if (domResult?.ok) {
      console.log(`[PROCESSOR] Found $${domResult.price} via ${domResult.source}`);
      return domResult;
    }

    return {
      ok: false,
      retryable: true,
      reason: "No supported price field was found in the loaded page",
      screenshotBase64: (await page.screenshot({ type: "png" })).toString("base64"),
    };
  } catch (error) {
    return { ok: false, retryable: true, reason: error instanceof Error ? error.message : "Price check failed" };
  } finally {
    await context?.close();
    await browser?.close();
  }
}
