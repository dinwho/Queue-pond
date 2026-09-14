import { AckPolicy, connect, JSONCodec, StorageType } from "nats";
import type { PriceCheckTask } from ".";
import { runPriceTrackerGraph } from "./graph";


async function runWorker()
{
    const natsUrl = process.env.NATS_URL || "localhost:4222";

    const nc = await connect({
        servers: natsUrl,
        maxReconnectAttempts : 10,
        reconnectTimeWait: 2000,
    });
    console.log(`Worker connected to nats server at ${natsUrl}`);


    const js = nc.jetstream();
    const jc = JSONCodec<PriceCheckTask>();
    const jsm  = await nc.jetstreamManager();

    const streamName = "PRICES";
    const consumerTag = "price-checker-worker";
    const maxDeliveries = Number(process.env.MAX_DELIVERIES || 3);

    // The worker may start before a publisher has ever run, so it owns the
    // initial stream setup as well. Both operations are safe on restarts.
    try {
        await jsm.streams.info(streamName);
    } catch {
        await jsm.streams.add({
            name: streamName,
            subjects: ["price.check"],
            storage: StorageType.File,
        });
    }

    try {
        const consumerInfo = await jsm.consumers.info(streamName, consumerTag);
        // This also updates an already-created durable consumer when the env changes.
        if (consumerInfo.config.max_deliver !== maxDeliveries) {
            await jsm.consumers.update(streamName, consumerTag, { max_deliver: maxDeliveries });
        }
    } catch {
        await jsm.consumers.add(streamName, {
            durable_name: consumerTag,
            ack_policy: AckPolicy.Explicit,
            filter_subject: "price.check",
            max_deliver: maxDeliveries,
        });
    }

    const consumer = await js.consumers.get(streamName,consumerTag);

    console.log("Worker waiting for tasks...");


    const messages = await consumer.consume();//fetch messages
    

    for await (const msg of messages){
        const task = jc.decode(msg.data);

        const deliveryAttempt = msg.info.deliveryCount;
        console.log(`\n [WORKER] Received Task ID: ${task.taskId} (attempt ${deliveryAttempt}/${maxDeliveries})`);
        console.log(` [WORKER] Scraping URL: ${task.productUrl}`);
        console.log(` [WORKER] Target Price: $${task.targetPrice}`);

        const result = await runPriceTrackerGraph(task);
        console.log(`[WORKER] Result: ${result.status}; current price: ${result.currentPrice ?? "not found"}`);
        if (result.status === "retry") {
            if (deliveryAttempt >= maxDeliveries) {
                console.error(`[WORKER] Task ${task.taskId} exhausted ${maxDeliveries} attempts: ${result.error}`);
                msg.term(); // terminal failure: do not redeliver this bad/flaky task
            } else {
                console.warn(`[WORKER] Retrying task ${task.taskId}: ${result.error}`);
                msg.nak(5_000);
            }
            continue;
        }

        if (result.error) {
            console.error(`[WORKER] Stopping task ${task.taskId}: ${result.error}`);
        }
        msg.ack();

    }


}
runWorker().catch((err)=> console.error("Worker stopped:", err));



