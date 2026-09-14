export interface PriceCheckTask{
    taskId: string,
    productUrl: string;
    targetPrice: number;
    userEmail: string;
    createdAt: string;
}

type TrackerState = {
  taskId: string;
  productUrl: string;
  targetPrice: number;
  userEmail: string;
  createdAt: string;

  currentPrice?: number;
  previousPrice?: number;
  attempts: number;
  status: "pending" | "checking" | "alerted" | "retry" | "stopped";
  nextCheckAt?: string;
  error?: string;
};


const sampleTask: PriceCheckTask = {
  taskId: "job-101",
  productUrl: "https://example.com/product",
  targetPrice: 49.99,
  userEmail: "hi@lol.com",
  createdAt: new Date().toISOString(),
};

console.log("TypeScript Project Ready! Sample Task:", sampleTask);