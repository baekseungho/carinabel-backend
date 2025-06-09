const express = require("express");
const router = express.Router();
const Kit = require("../models/Kit");
const Product = require("../models/Product");
const asyncHandler = require("express-async-handler");

// 🔹 키트 등록
router.post(
    "/create",
    asyncHandler(async (req, res) => {
        const { kitName, products, price, originalPrice, description } =
            req.body;
        const kit = await Kit.create({
            kitName,
            products,
            price,
            originalPrice,
            description,
        });
        res.status(201).json(kit);
    })
);

// 🔹 전체 키트 리스트 조회
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const kits = await Kit.find().populate("products.productId");
        res.json(kits);
    })
);

// 🔹 키트 수정
router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const kit = await Kit.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
        });
        if (!kit)
            return res
                .status(404)
                .json({ message: "해당 키트를 찾을 수 없습니다." });
        res.json(kit);
    })
);

// 🔹 키트 삭제
router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const kit = await Kit.findByIdAndDelete(req.params.id);
        if (!kit)
            return res
                .status(404)
                .json({ message: "해당 키트를 찾을 수 없습니다." });
        res.json({ message: "키트가 삭제되었습니다." });
    })
);

module.exports = router;
