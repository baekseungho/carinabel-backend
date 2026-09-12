require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const User = require("../models/User");
const Address = require("../models/Address");

(async () => {
    const dbName = "carinabel_address_test_" + randomUUID().replaceAll("-", "");
    let server;
    try {
        await mongoose.connect(process.env.MONGO_URI, { dbName, serverSelectionTimeoutMS: 5000 });
        assert.equal(mongoose.connection.name, dbName);
        await Promise.all([User.init(), Address.init()]);
        const id = new mongoose.Types.ObjectId();
        await User.collection.insertOne({ _id: id, role: "user", isDeleted: false });
        const app = express();
        app.use(express.json());
        app.use("/addresses", require("../routes/addressRoutes"));
        app.use(require("../middleware/errorMiddleware").errorHandler);
        server = app.listen(0, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const token = jwt.sign({ id: String(id) }, process.env.JWT_SECRET);
        const request = (method, path, body) => new Promise((resolve, reject) => {
            const req = http.request({ host: "127.0.0.1", port: server.address().port, method, path,
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } }, res => {
                let text = "";
                res.on("data", chunk => text += chunk);
                res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
            });
            req.on("error", reject);
            req.end(JSON.stringify(body));
        });
        const body = { recipientName: "Test", mobile: "01000000000", address: "Test address", isDefault: true };
        const created = await Promise.all(Array.from({ length: 6 }, () => request("POST", "/addresses", body)));
        created.forEach(result => assert.equal(result.status, 201));
        assert.equal(await Address.countDocuments({ userId: id }), 6);
        assert.equal(await Address.countDocuments({ userId: id, isDefault: true }), 1);
        const updates = await Promise.all(created.map(result => request("PUT", `/addresses/${result.body._id}`, body)));
        updates.forEach(result => assert.equal(result.status, 200));
        assert.equal(await Address.countDocuments({ userId: id, isDefault: true }), 1);
        const current = await Address.findOne({ userId: id, isDefault: true });
        assert.equal((await request("DELETE", `/addresses/${current.id}`)).status, 200);
        assert.equal(await Address.countDocuments({ userId: id, isDefault: true }), 1);
        assert.equal((await request("POST", "/addresses", { ...body, address: "" })).status, 400);
        assert.equal(await Address.countDocuments({ userId: id, isDefault: true }), 1);
        const foreign = await Address.create({ ...body, userId: new mongoose.Types.ObjectId() });
        assert.equal((await request("DELETE", `/addresses/${foreign.id}`)).status, 404);
        assert.ok(await Address.findById(foreign.id));
        console.log("PASS: concurrent create/update, default deletion, invalid input, and ownership over real HTTP + MongoDB.");
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName && /^carinabel_address_test_[a-f0-9]{32}$/.test(dbName)) {
            await mongoose.connection.dropDatabase();
            console.log("Removed isolated test database only.");
        }
        await mongoose.disconnect();
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
