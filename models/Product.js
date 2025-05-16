const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
    },
    productName: {
        type: String,
        required: true,
        unique: true,
    },
    koreanName: {
        type: String,
        required: true,
        unique: true,
    },
    volume: {
        type: Number,
        required: true,
    },
    consumerPrice: {
        type: Number,
        required: true,
    },
    memberPrice: {
        type: Number,
        default: 0,
    },
    imagePath: {
        type: String,
        default: "/img/default_product.png",
    },
    detailImage: {
        type: String,
        default: "/img/default_detail.jpg",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Product", productSchema);
