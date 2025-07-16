const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    orderNumber: {
        type: String,
        unique: true,
        required: true,
    },
    orderType: {
        type: String,
        enum: ["oil", "kit", "cart"],
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
        enum: [
            "입금대기", // PENDING_PAYMENT
            "결제완료", // ORDERED
            "상품준비중", // PREPARING
            "배송중", // IN_TRANSIT
            "배송완료", // DELIVERED
            "구매확정", // CONFIRMED
            "취소됨", // CANCELLED
            "반품됨", // RETURNED
        ],
    },
    imagePath: {
        type: String,
        default: "",
    },
    deliveryDate: {
        type: Date,
    },
    cartItems: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
            },
            quantity: Number,
        },
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Order", orderSchema);
