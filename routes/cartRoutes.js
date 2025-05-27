const express = require("express");
const router = express.Router();
const CartItem = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const calculateDiscountedPrice = require("../utils/calculateDiscount");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

// 🔄 회원 등급 가져오기
const getMembershipLevel = async (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        return user ? user.membershipLevel : "일반회원";
    } catch (error) {
        console.error("회원 등급 로드 실패:", error);
        return "일반회원";
    }
};

// ➕ 장바구니 추가
router.post(
    "/add",
    asyncHandler(async (req, res) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401).json({ message: "로그인이 필요합니다." });
            return;
        }

        const { productId, quantity = 1 } = req.body;
        const membershipLevel = await getMembershipLevel(token);

        // 상품 정보 가져오기
        const product = await Product.findById(productId);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        // 할인 가격 계산
        const price = calculateDiscountedPrice(
            product.consumerPrice,
            membershipLevel
        );

        // 이미 장바구니에 있는지 확인
        const userId = jwt.verify(token, process.env.JWT_SECRET).id;
        const existingItem = await CartItem.findOne({ userId, productId });

        if (existingItem) {
            // 수량 증가
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
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401).json({ message: "로그인이 필요합니다." });
            return;
        }

        const userId = jwt.verify(token, process.env.JWT_SECRET).id;
        const membershipLevel = await getMembershipLevel(token);

        const cartItems = await CartItem.find({ userId }).populate(
            "productId",
            "koreanName productName consumerPrice memberPrice imagePath detailImage category volume"
        );

        // 가격 재계산 (회원 등급별)
        const itemsWithDiscount = cartItems.map((item) => ({
            ...item.toObject(),
            price: calculateDiscountedPrice(
                item.productId.consumerPrice,
                membershipLevel
            ),
        }));

        res.json(itemsWithDiscount);
    })
);

// 🔄 장바구니 수량 수정
router.put(
    "/update/:itemId",
    asyncHandler(async (req, res) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401).json({ message: "로그인이 필요합니다." });
            return;
        }

        const itemId = req.params.itemId;
        const { quantity } = req.body;

        if (quantity < 1) {
            res.status(400).json({ message: "수량은 1개 이상이어야 합니다." });
            return;
        }

        const cartItem = await CartItem.findById(itemId);
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
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401).json({ message: "로그인이 필요합니다." });
            return;
        }

        const itemId = req.params.itemId;
        const cartItem = await CartItem.findById(itemId);
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

module.exports = router;
