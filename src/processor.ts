import { PriceCheckTask } from ".";
import { Browser, BrowserContext, chromium } from "playwright-core";

function normalizeProductUrl(productUrl: string): string {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(productUrl)
        ? productUrl
        : `https://${productUrl}`;

    return new URL(withProtocol).toString();
}

export async function processPriceCheck(task: PriceCheckTask): Promise<void>{

    
    console.log(`\n------------------------------`);
    console.log(`[WORKER] Starting Task: ${task.taskId}`);
    const productUrl = normalizeProductUrl(task.productUrl);
    console.log(`[WORKER] Navigating to: ${productUrl}`);

    // Use `browserless` from Docker; override this with localhost when running the worker on the host.
    const browserlessUrl = process.env.BROWSERLESS_URL
        || process.env.BROWSERLESSURL // temporary backwards compatibility
        || "ws://browserless:3000?token=secrettoken123";

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try{
        // Browserless exposes Chromium's Chrome DevTools Protocol (CDP), not a Playwright server.
        browser = await chromium.connectOverCDP(browserlessUrl, { timeout: 10_000 });
        context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

        const pageTitle = await page.title();
        console.log(`[PROCESSOR] Page Title Loaded: "${pageTitle}"`);

        const mockCurrentPrice = Math.floor(Math.random() * 200) + 50; 

            
        console.log(`[PROCESSOR] Scraped Current Price: $${mockCurrentPrice} (Target: $${task.targetPrice})`);

        if (mockCurrentPrice <= task.targetPrice) {
        console.log(` [ALERT] Price dropped, emailing to ${task.userEmail}...`);
        } else {
            console.log(`[INFO] Price still above target, No alert sent`);
        }
    }finally{
        await context?.close();
        await browser?.close();
    }

    console.log(`--------------------------------------------------\n`);



    

}
