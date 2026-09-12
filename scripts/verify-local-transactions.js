require("dotenv").config();
const mongoose = require("mongoose");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

(async () => {
    let collection;
    let session;
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });
        assert.equal(hello.setName, "rs0");
        assert.equal(hello.isWritablePrimary, true);
        // Only this newly created collection is written to or removed.
        const name = "codex_tx_probe_" + randomUUID().replaceAll("-", "");
        collection = await mongoose.connection.db.createCollection(name);
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            await collection.insertOne({ _id: "commit", balance: 100 }, { session });
        });
        assert.equal((await collection.findOne({ _id: "commit" })).balance, 100);
        await assert.rejects(session.withTransaction(async () => {
            await collection.updateOne({ _id: "commit" }, { $inc: { balance: -30 } }, { session });
            await collection.insertOne({ _id: "rollback" }, { session });
            throw new Error("intentional rollback probe");
        }), /intentional rollback probe/);
        assert.equal((await collection.findOne({ _id: "commit" })).balance, 100);
        assert.equal(await collection.countDocuments({ _id: "rollback" }), 0);
        console.log("PASS: backend URI connects to rs0 PRIMARY; real commit and rollback verified.");
    } finally {
        if (session) await session.endSession();
        if (collection) {
            await collection.drop();
            console.log("Temporary probe collection removed; business collections were not modified.");
        }
        await mongoose.disconnect();
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
