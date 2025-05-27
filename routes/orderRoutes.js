const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Purchase = require("../models/Purchase");
const User = require("../models/User");

// 주문 생성 API
router.post(
    "/create",
    asyncHandler(async (req, res) => {
        const { userId, amount, quantity, status, deliveryDate, productName } =
            req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 사용자 ID입니다." });
        }
        console.log("🧾 주문 생성 요청:", req.body);
        // Order에 저장
        const newOrder = await Order.create({
            userId,
            productName, // ✅ 저장
            amount,
            quantity,
            status: status || "결제완료",
            deliveryDate: deliveryDate || null,
        });

        // Purchase에도 통계용 데이터 기록
        await Purchase.create({
            userId,
            amount,
        });

        res.status(201).json(newOrder);
    })
);

// 주문 조회 API (개별 또는 전체)
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { userId } = req.query;

        const match = userId
            ? { userId: new mongoose.Types.ObjectId(userId) }
            : {};

        const orders = await Order.find(match)
            .populate("userId", "fullName email referrerId")
            .sort({ createdAt: -1 });

        res.json(orders);
    })
);

// 추천 하위 유저들의 주문 조회
router.get(
    "/referred/:referrerId",
    asyncHandler(async (req, res) => {
        const { referrerId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(referrerId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 추천인 ID입니다." });
        }

        const referredUsers = await User.find({ referrerId }).select(
            "_id fullName email"
        );
        const referredIds = referredUsers.map((u) => u._id);

        if (!referredIds.length) return res.json([]);

        const orders = await Order.find({ userId: { $in: referredIds } })
            .populate({
                path: "userId",
                select: "fullName email referrerId",
                populate: {
                    path: "referrerId",
                    select: "fullName email",
                },
            })
            .sort({ createdAt: -1 });

        res.json(orders);
    })
);

module.exports = router;
