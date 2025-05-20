const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    referredUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    percentage: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    firstPurchase: {
        type: Boolean,
        default: false,
    },
});

module.exports = mongoose.model("Referral", referralSchema);
