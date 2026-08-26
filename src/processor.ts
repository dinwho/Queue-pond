import { PriceCheckTask } from ".";

export async function processPriceCheck(task: PriceCheckTask): Promise<void>{
    console.log(`\n------------------------------`);

    console.log(`[PROCESSOR] Starting execution for Task ID: ${task.taskId}`);
    console.log(`[PROCESSOR] Target URL: ${task.productUrl}`);
    
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const mockCurrentPrice = Math.floor(Math.random() * 200) + 50; 
    console.log(`[PROCESSOR] Scraped Current Price: $${mockCurrentPrice} (Target: $${task.targetPrice})`);

    if (mockCurrentPrice <= task.targetPrice) {
    console.log(` [ALERT] Price dropped! Triggering email to ${task.userEmail}...`);
    // Trigger notification service call here
  } else {
    console.log(` [INFO] Price still above target. No alert sent.`);
  }

  console.log(`--------------------------------------------------\n`);


}