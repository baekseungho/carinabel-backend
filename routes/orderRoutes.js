const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Purchase = require("../models/Purchase");
const User = require("../models/User");
const Product = require("../models/Product");
const Address = require("../models/Address"); // 기본 배송지 모델
// 주문 생성 API
router.post(
    "/create",
    asyncHandler(async (req, res) => {
        const {
            userId,
            amount,
            quantity,
            status,
            deliveryDate,
            productName,
            imagePath,
        } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 사용자 ID입니다." });
        }
        console.log("🧾 주문 생성 요청:", req.body);
        // Order에 저장
        const newOrder = await Order.create({
            userId,
            productName,
            imagePath, // ✅ 이미지 경로 저장
            amount,
            quantity,
            status: status || "",
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
        const { userId, page = 1, size = 5, status = "all" } = req.query;

        const match = userId
            ? { userId: new mongoose.Types.ObjectId(userId) }
            : {};
        if (status !== "all") {
            match.status = status;
        }

        const skip = (Number(page) - 1) * Number(size);
        const total = await Order.countDocuments(match);
        const orders = await Order.find(match)
            .populate("userId", "fullName email referrerId")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(size));

        res.json({ orders, total });
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

// 추천 하위 유저 주문(페이징)
router.get(
    "/referred-paged",
    asyncHandler(async (req, res) => {
        const { referrerId, page = 1, size = 5 } = req.query;

        // 🔍 referrerId 유효성 검사
        if (!referrerId || !mongoose.Types.ObjectId.isValid(referrerId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 추천인 ID입니다." });
        }

        const referredUsers = await User.find({ referrerId }).select(
            "_id fullName email"
        );
        const referredIds = referredUsers.map((u) => u._id);

        if (!referredIds.length) return res.json({ orders: [], total: 0 });

        const match = { userId: { $in: referredIds } };
        const skip = (Number(page) - 1) * Number(size);
        const total = await Order.countDocuments(match);
        const orders = await Order.find(match)
            .populate({
                path: "userId",
                select: "fullName email referrerId",
                populate: { path: "referrerId", select: "fullName email" },
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(size));

        res.json({ orders, total });
    })
);

// 주문 상세 정보 통합 조회 API
router.get(
    "/detail/:orderId",
    asyncHandler(async (req, res) => {
        const { orderId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 주문 ID입니다." });
        }

        const order = await Order.findById(orderId)
            .populate("userId", "fullName email phone mobile address")
            .lean();

        if (!order) {
            return res
                .status(404)
                .json({ message: "주문 정보를 찾을 수 없습니다." });
        }

        // 상품 정보
        const product = await Product.findOne({
            koreanName: order.productName,
        }).lean();

        // 배송지 정보
        let delivery = null;

        if (order.deliveryAddressId) {
            // 주문에 지정된 배송지 ID가 있으면 해당 주소를 사용
            delivery = await Address.findById(order.deliveryAddressId).lean();
        } else {
            // 그렇지 않으면 기본 배송지를 찾아서 사용
            delivery = await Address.findOne({
                userId: order.userId._id,
                isDefault: true,
            }).lean();
        }

        // 가상계좌 정보 (예시)
        const payment = {
            method: "가상계좌",
            status: order.status,
            bank: order.userId.bankName || "KEB하나은행",
            virtualAccount: order.userId.accountNumber || "00000000000000",
            dueDate: order.createdAt
                ? new Date(
                      new Date(order.createdAt).getTime() +
                          3 * 24 * 60 * 60 * 1000
                  )
                : null,
        };

        res.json({
            _id: order._id,
            createdAt: order.createdAt,
            product: {
                productName: order.productName,
                imagePath: product?.imagePath || "/img/default.jpg",
                amount: order.amount,
                quantity: order.quantity,
            },
            status: order.status,
            user: order.userId,
            delivery,
            payment,
        });
    })
);
module.exports = router;
