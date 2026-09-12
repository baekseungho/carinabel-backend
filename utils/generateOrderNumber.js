// utils/generateOrderNumber.js
const Counter = require("../models/Counter");

const generateOrderNumber = async (session = null) => {
    const counter = await Counter.findOneAndUpdate(
        { name: "order" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
    );
    return counter.seq.toString().padStart(10, "0");
};

module.exports = generateOrderNumber;
