import { connect, JSONCodec, AckPolicy } from "nats";
import { PriceCheckTask } from ".";
import { defaultJsOptions } from "nats/lib/jetstream/jsbaseclient_api";


async function runWorker()
{
    const nc = await connect({servers: "localhost:4222"});
    console.log(`Worker connected to nats`);


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

    //fetch messages
    const messages = await consumer.consume();
    

    for await (const msg of messages){
        const task = jc.decode(msg.data);

        console.log(`\n [WORKER] Received Task ID: ${task.taskId}`);
        console.log(` [WORKER] Scraping URL: ${task.productUrl}`);
        console.log(` [WORKER] Target Price: $${task.targetPrice}`);


        await new Promise((resolve) => setTimeout(resolve, 1000));

        msg.ack();
        console.log(` [WORKER] Task ${task.taskId} completed and ACKed!\n`);

    }


}
runWorker().catch((err)=> {console.log("fuck you", err)});



