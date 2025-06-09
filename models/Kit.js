const mongoose = require("mongoose");

const kitSchema = new mongoose.Schema({
    kitName: { type: String, required: true },
    products: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true,
            },
            quantity: { type: Number, required: true, default: 1 },
        },
    ],
    price: { type: Number, required: true }, // 할인가격
    originalPrice: { type: Number, required: true }, // 원래 총합 가격
    description: { type: String },
    createdAt: { type: Date, default: Date.now },
    imagePath: {
        type: String,
        default: "/img/default_product.png",
    },
    detailImage: {
        type: String,
        default: "/img/default_detail.jpg",
    },
});

module.exports = mongoose.model("Kit", kitSchema);
