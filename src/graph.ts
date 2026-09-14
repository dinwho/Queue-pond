import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { PriceCheckTask } from ".";
import { processPriceCheck, type PriceSource } from "./processor";
import { readPriceFromScreenshot } from "./vision";

const TrackerState = Annotation.Root({
  task: Annotation<PriceCheckTask>,
  currentPrice: Annotation<number | undefined>,
  source: Annotation<PriceSource | undefined>,
  confidence: Annotation<number | undefined>,
  screenshotBase64: Annotation<string | undefined>,
  attempts: Annotation<number>,
  status: Annotation<"pending" | "checking" | "alerted" | "retry" | "stopped">,
  error: Annotation<string | undefined>,
});

type TrackerStateType = typeof TrackerState.State;

async function checkDomPrice(state: TrackerStateType){
  const result = await processPriceCheck(state.task);
  if (!result.ok) {
    return {
      attempts: state.attempts + 1,
      status: !result.retryable ? "stopped" as const : result.screenshotBase64 ? "checking" as const : "retry" as const,
      error: result.reason,
      screenshotBase64: result.screenshotBase64,
    };
  }

  return {
    attempts: state.attempts + 1,
    currentPrice: result.price,
    source: result.source,
    status: result.price <= state.task.targetPrice ? "alerted" as const : "stopped" as const,
  };
}

async function readScreenshotPrice(state: TrackerStateType) {
  if (!state.screenshotBase64) return { status: "retry" as const, error: "No screenshot available" };

  const result = await readPriceFromScreenshot(state.screenshotBase64);
  if (!result.ok) {
    return {
      status: result.retryable ? "retry" as const : "stopped" as const,
      error: result.reason,
    };
  }

  return {
    currentPrice: result.price,
    source: "vision" as const,
    confidence: result.confidence,
    screenshotBase64: undefined,
    status: result.price <= state.task.targetPrice ? "alerted" as const : "stopped" as const,
  };
}

async function sendAlert(state: TrackerStateType) {
  console.log(`[ALERT] ${state.task.productUrl} is $${state.currentPrice} (${state.source}); email ${state.task.userEmail}`);
  return { status: "alerted" as const };
}

function afterDomCheck(state: TrackerStateType) {
  if (state.status === "alerted") return "sendAlert";
  if (state.screenshotBase64) return "readScreenshotPrice";
  return END;
}

function afterVisionCheck(state: TrackerStateType) {
  return state.status === "alerted" ? "sendAlert" : END;
}

const priceTrackerGraph = new StateGraph(TrackerState)
  .addNode("checkDomPrice", checkDomPrice)
  .addNode("readScreenshotPrice", readScreenshotPrice)
  .addNode("sendAlert", sendAlert)
  .addEdge(START, "checkDomPrice")
  .addConditionalEdges("checkDomPrice", afterDomCheck, ["readScreenshotPrice", "sendAlert", END])
  .addConditionalEdges("readScreenshotPrice", afterVisionCheck, ["sendAlert", END])
  .addEdge("sendAlert", END)
  .compile();

export async function runPriceTrackerGraph(task: PriceCheckTask) {
  return priceTrackerGraph.invoke({ task, attempts: 0, status: "pending" });
}
