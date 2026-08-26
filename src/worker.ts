import { connect, JSONCodec, AckPolicy } from "nats";
import { PriceCheckTask } from ".";
import { defaultJsOptions } from "nats/lib/jetstream/jsbaseclient_api";
import { processPriceCheck } from "./processor";



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

    await jsm.consumers.add(streamName, {
        durable_name: consumerTag,
        ack_policy: "explicit" as any, //worker must send msg.ack() to finish job
        filter_subject: "price.check",
    });

    const consumer = await js.consumers.get(streamName,consumerTag);

    console.log("Worker waiting for tasks...");


    const messages = await consumer.consume();//fetch messages
    

    for await (const msg of messages){
        const task = jc.decode(msg.data);

        console.log(`\n [WORKER] Received Task ID: ${task.taskId}`);
        console.log(` [WORKER] Scraping URL: ${task.productUrl}`);
        console.log(` [WORKER] Target Price: $${task.targetPrice}`);

        await processPriceCheck(task);


        msg.ack();
        console.log(` [WORKER] Task ${task.taskId} completed and ACKed!\n`);

    }


}
runWorker().catch((err)=> {console.log("fuck you", err)});



