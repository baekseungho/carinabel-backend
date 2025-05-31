// models/QnA.js
const mongoose = require("mongoose");

const qnaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, required: true },
    content: { type: String, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    productName: { type: String },
    imagePath: { type: String },
    views: { type: Number, default: 0 },
    answer: {
      content: String,
      createdAt: { type: Date, default: Date.now },
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  },

  {
    timestamps: true, // createdAt, updatedAt 자동 생성
  }
);

module.exports = mongoose.model("QnA", qnaSchema);
