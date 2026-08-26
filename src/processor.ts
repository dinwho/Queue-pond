import { PriceCheckTask } from ".";
import { chromium } from "playwright-core";


export async function processPriceCheck(task: PriceCheckTask): Promise<void>{

    
    console.log(`\n------------------------------`);

    const browserlessUrl = process.env.BROWSERLESSURL || "ws://browserless:3000?token=secrettoken123";

    const browser = await chromium.connect(browserlessUrl);
    try{
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(task.productUrl, {waitUntil: "domcontentloaded"});

        const pageTitle = await page.title();
        console.log(`[PROCESSOR] Page Title Loaded: "${pageTitle}"`);

        const mockCurrentPrice = Math.floor(Math.random() * 200) + 50; 

            
        console.log(`[PROCESSOR] Scraped Current Price: $${mockCurrentPrice} (Target: $${task.targetPrice})`);

        if (mockCurrentPrice <= task.targetPrice) {
        console.log(` [ALERT] Price dropped, emailing to ${task.userEmail}...`);
        } else {
            console.log(`[INFO] Price still above target, No alert sent`);
        }
        await context.close();

    }finally{
        await browser.close();
    }

    console.log(`--------------------------------------------------\n`);



    

}