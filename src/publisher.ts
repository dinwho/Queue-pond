import { connect, JSONCodec, StorageType } from "nats";
import { PriceCheckTask } from ".";

async function runPublisher(){
    const nc = await connect({ servers: process.env.NATS_URL || "localhost:4222" });
    console.log("connected to nats server");


    const jsm = await nc.jetstreamManager();
    const jc = nc.jetstream();



    const streamName = "PRICES";
    const subjName = "price.check";


    try {
        await jsm.streams.info(streamName);
    } catch {
        await jsm.streams.add({
            name: streamName,
            subjects: [subjName],
            storage: StorageType.File,
        });
    }


    console.log(`Stream '${streamName}' is ready to capture '${subjName}' messages`);

    const task : PriceCheckTask = {
        taskId : "job-004",
        productUrl : "https://leetcode.com/0xmarq",
        targetPrice: 4.20,
        userEmail: "hi@lol.com",
        createdAt: new Date().toISOString(),
    };

    const jcMessage = JSONCodec<PriceCheckTask>();
    const ack = await jc.publish(subjName,jcMessage.encode(task));


    console.log(`Published task ${task.taskId}! JetStream Sequence ID: ${ack.seq}`);
    await nc.close();

}

runPublisher().catch((err) => console.error("Error running publisher:", err));

