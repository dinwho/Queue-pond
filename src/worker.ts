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
        await jsm.consumers.info(streamName, consumerTag);
    } catch {
        await jsm.consumers.add(streamName, {
            durable_name: consumerTag,
            ack_policy: AckPolicy.Explicit,
            filter_subject: "price.check",
        });
    }

    const consumer = await js.consumers.get(streamName,consumerTag);

    console.log("Worker waiting for tasks...");


    const messages = await consumer.consume();//fetch messages
    

    for await (const msg of messages){
        const task = jc.decode(msg.data);

        console.log(`\n [WORKER] Received Task ID: ${task.taskId}`);
        console.log(` [WORKER] Scraping URL: ${task.productUrl}`);
        console.log(` [WORKER] Target Price: $${task.targetPrice}`);

        const result = await runPriceTrackerGraph(task);
        console.log(`current price: ${result.currentPrice}`);
        if (result.status === "retry") {
        msg.nak(5_000);
        continue;
        }

        msg.ack();

    }


}
runWorker().catch((err)=> console.error("Worker stopped:", err));



