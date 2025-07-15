const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        summary: { type: String, required: true },
        content: { type: String, required: true },
        date: { type: String, required: true }, // 날짜 문자열로 저장 (YYYY-MM-DD)
    },
    { timestamps: true }
);

const Notice = mongoose.model("Notice", noticeSchema);
module.exports = Notice;
