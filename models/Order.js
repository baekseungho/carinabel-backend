const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    productName: {
        type: String, // ✅ 상품명 추가
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        default: 1,
    },
    amount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ["미결제", "결제완료", "배송중", "배송완료", "취소됨"],
        default: "미결제",
    },
    imagePath: {
        type: String,
        default: "",
    },
    deliveryDate: {
        type: Date,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Order", orderSchema);
