# QueuePon-d

npm install


sudo docker compose up --build


npx tsx src/publisher.ts

### How a price tracker should actually work:

    If the price is far above target: check less often
    If the price is close to target or dropping quickly: check more often
    If the price hits or falls below target: trigger alert and stop or slow down
    If the page is flaky or blocked: retry with backoff

    So the scheduling policy is adaptive, not fixed.


price changes are very often bursty and unpredictable.So the tracker needs a state machine, not a cron job.



#### Langgraph pattern for a worker:
- Think of it as a small state machine:
    
    - State shape:
    ```
    type TrackerState = {
        taskId: string;
        productUrl: string;
        targetPrice: number;
        userEmail: string;
        currentPrice?: number;
        lastPrice?: number;
        priceDelta?: number;
        attempts: number;
        nextCheckAt?: Date;
        status: "pending" | "checking" | "alerted" | "stopped" | "retry";
        error?: string;
    };
    ```



