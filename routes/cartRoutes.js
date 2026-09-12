const express = require("express");
const router = express.Router();
const CartItem = require("../models/Cart");
const Product = require("../models/Product");
const calculateDiscountedPrice = require("../utils/calculateDiscount");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// ➕ 장바구니 추가
router.post(
    "/add",
    asyncHandler(async (req, res) => {
        const { productId, quantity = 1 } = req.body;
        if (!mongoose.isObjectIdOrHexString(productId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
            return res.status(400).json({ message: "상품과 수량을 확인해 주세요." });
        }
        const membershipLevel = req.user.membershipLevel;

        // 상품 정보 가져오기
        const product = await Product.findById(productId);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        // 할인 가격 계산
        const price = calculateDiscountedPrice(product.consumerPrice, membershipLevel);

        // 이미 장바구니에 있는지 확인
        const userId = req.user.id;
        const existingItem = await CartItem.findOne({ userId, productId });

        if (existingItem) {
            // 수량 증가
            if (existingItem.quantity + quantity > 10000) return res.status(400).json({ message: "최대 수량을 초과했습니다." });
            existingItem.quantity += quantity;
            await existingItem.save();
            res.json({
                message: "장바구니 수량이 증가했습니다.",
                cartItem: existingItem,
            });
        } else {
            // 새로운 항목 추가
            const cartItem = new CartItem({
                userId,
                productId,
                quantity,
                price,
            });

            await cartItem.save();

            res.json({
                message: "장바구니에 상품이 추가되었습니다.",
                cartItem,
            });
        }
    })
);
// 🔄 장바구니 목록 조회
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const membershipLevel = req.user.membershipLevel;

        const cartItems = await CartItem.find({ userId }).populate(
            "productId",
            "koreanName productName consumerPrice memberPrice imagePath detailImage category volume"
        );

        // 가격 재계산 (회원 등급별)
        const itemsWithDiscount = cartItems.filter(item => item.productId).map((item) => ({
            ...item.toObject(),
            price: calculateDiscountedPrice(item.productId.consumerPrice, membershipLevel),
        }));

        res.json(itemsWithDiscount);
    })
);

// 🔄 장바구니 수량 수정
router.put(
    "/update/:itemId",
    asyncHandler(async (req, res) => {
        const itemId = req.params.itemId;
        if (!mongoose.isObjectIdOrHexString(itemId)) return res.status(400).json({ message: "잘못된 장바구니 항목입니다." });
        const { quantity } = req.body;

        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
            res.status(400).json({ message: "수량은 1개 이상이어야 합니다." });
            return;
        }

        const cartItem = await CartItem.findOne({ _id: itemId, userId: req.user.id });
        if (!cartItem) {
            res.status(404).json({
                message: "장바구니 항목을 찾을 수 없습니다.",
            });
            return;
        }

        cartItem.quantity = quantity;
        await cartItem.save();

        res.json({
            message: "장바구니 수량이 업데이트되었습니다.",
            cartItem,
        });
    })
);

// 🗑️ 장바구니에서 상품 삭제
router.delete(
    "/remove/:itemId",
    asyncHandler(async (req, res) => {
        const itemId = req.params.itemId;
        if (!mongoose.isObjectIdOrHexString(itemId)) return res.status(400).json({ message: "잘못된 장바구니 항목입니다." });
        const cartItem = await CartItem.findOne({ _id: itemId, userId: req.user.id });
        if (!cartItem) {
            res.status(404).json({
                message: "장바구니 상품을 찾을 수 없습니다.",
            });
            return;
        }

        await cartItem.deleteOne();
        res.json({ message: "장바구니에서 상품이 삭제되었습니다." });
    })
);
router.delete(
    "/clear",
    asyncHandler(async (req, res) => {
        await CartItem.deleteMany({ userId: req.user.id });
        res.json({ message: "장바구니가 비워졌습니다." });
    })
);
module.exports = router;
