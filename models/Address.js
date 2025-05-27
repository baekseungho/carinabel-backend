// models/Address.js
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    recipientName: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        default: "",
    },
    mobile: {
        type: String,
        required: true,
    },
    address: {
        type: String,
        required: true,
    },
    isDefault: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Address", addressSchema);
