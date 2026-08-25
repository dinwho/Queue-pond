import { connect, JSONCodec } from "nats";
import { PriceCheckTask } from ".";

async function runPublisher(){
    const nc = await connect({servers: "localhost:4222"});
    console.log("connected to nats server");


    const jsm = await nc.jetstreamManager();
    const jc = nc.jetstream();



    const streamName = "PRICES";
    const subjName = "price.check";


    await jsm.streams.add({
        name: streamName,
        subjects: [subjName],
    });


    console.log(`Stream '${streamName}' is ready to capture '${subjName}' messages`);

    const task : PriceCheckTask = {
        taskId : "job-004",
        productUrl : "dinotube.com/m1",
        targetPrice: 6.77,
        userEmail: "hi@lol.com",
        createdAt: new Date().toISOString(),
    };

    const jcMessage = JSONCodec<PriceCheckTask>();
    const ack = await jc.publish(subjName,jcMessage.encode(task));


    console.log(`Published task ${task.taskId}! JetStream Sequence ID: ${ack.seq}`);
    await nc.close();

}

runPublisher().catch((err) => console.error("Error running publisher:", err));

