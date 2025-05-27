const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const Referral = require("../models/Referral");
const Purchase = require("../models/Purchase");
const generateToken = require("../utils/generateToken");
const { protect } = require("../middleware/authMiddleware");
const updateMembershipLevel = require("../utils/updateMembershipLevel");
const distributeReferralEarnings = require("../utils/referralEarnings");

// 📦 주문 리스트 조회 (옵션: userId)
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { userId } = req.query;

        const match = userId ? { userId: new mongoose.Types.ObjectId(userId) } : {};

        const orders = await Order.find(match).populate("userId", "fullName email");
        res.json(orders);
    })
);

// 📦 추천 하위 유저들의 주문 내역
router.get(
    "/referred/:referrerId",
    asyncHandler(async (req, res) => {
        const { referrerId } = req.params;

        const referredUsers = await User.find({ referrerId }).select("_id fullName email");
        const referredIds = referredUsers.map((u) => u._id);

        const orders = await Order.find({ userId: { $in: referredIds } }).populate("userId", "fullName email");
        res.json(orders);
    })
);

module.exports = router;
