const mongoose = require("mongoose");

// _id is the built-in unique index: no TTL, because an old retry must not pay again.
module.exports = mongoose.model("AdminOperation", new mongoose.Schema({
    _id: String,
    fingerprint: { type: String, required: true },
    status: Number,
    response: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
}));
