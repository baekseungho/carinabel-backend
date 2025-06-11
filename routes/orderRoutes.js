const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Purchase = require("../models/Purchase");
const User = require("../models/User");
const Product = require("../models/Product");
const Address = require("../models/Address"); // 기본 배송지 모델
const Kit = require("../models/Kit"); // 키트 모델도 불러오기

// 주문 생성 API
router.post(
    "/create",
    asyncHandler(async (req, res) => {
        const { userId, amount, quantity, status, deliveryDate, productName, imagePath } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        console.log("🧾 주문 생성 요청:", req.body);

        // 1️⃣ 상품 찾기 (Product → 없으면 Kit)
        let product = await Product.findOne({ koreanName: productName });

        if (product) {
            // 일반 상품 주문 처리
            if (product.stock < quantity) {
                return res.status(400).json({ message: `재고가 부족합니다. 현재 남은 재고: ${product.stock}` });
            }

            product.stock -= quantity;
            await product.save();
        } else {
            // 키트 상품 주문 처리
            const kit = await Kit.findOne({ kitName: productName }).populate("products.productId");

            if (!kit) {
                return res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            }

            // 모든 구성품 재고 확인
            const insufficient = kit.products.find((item) => item.productId.stock < item.quantity * quantity);
            if (insufficient) {
                return res.status(400).json({
                    message: `구성품 ${insufficient.productId.koreanName}의 재고가 부족합니다. 현재 재고: ${insufficient.productId.stock}`,
                });
            }

            // 구성품 재고 차감
            for (const item of kit.products) {
                const product = item.productId;
                product.stock -= item.quantity * quantity;
                await product.save();
            }
        }

        // 3️⃣ 주문 생성
        const newOrder = await Order.create({
            userId,
            productName,
            imagePath,
            amount,
            quantity,
            status: status || "결제완료",
            deliveryDate: deliveryDate || null,
        });

        // 4️⃣ 통계용 기록
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

        const match = userId ? { userId: new mongoose.Types.ObjectId(userId) } : {};
        if (status !== "all") {
            match.status = status;
        }

        const skip = (Number(page) - 1) * Number(size);
        const total = await Order.countDocuments(match);
        const orders = await Order.find(match)
            .populate("userId", "fullName memberId referrerId")
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
            return res.status(400).json({ message: "유효하지 않은 추천인 ID입니다." });
        }

        const referredUsers = await User.find({ referrerId }).select("_id fullName memberId");
        const referredIds = referredUsers.map((u) => u._id);

        if (!referredIds.length) return res.json([]);

        const orders = await Order.find({ userId: { $in: referredIds } })
            .populate({
                path: "userId",
                select: "fullName memberId referrerId",
                populate: {
                    path: "referrerId",
                    select: "fullName memberId",
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
            return res.status(400).json({ message: "유효하지 않은 추천인 ID입니다." });
        }

        const referredUsers = await User.find({ referrerId }).select("_id fullName memberId");
        const referredIds = referredUsers.map((u) => u._id);

        if (!referredIds.length) return res.json({ orders: [], total: 0 });

        const match = { userId: { $in: referredIds } };
        const skip = (Number(page) - 1) * Number(size);
        const total = await Order.countDocuments(match);
        const orders = await Order.find(match)
            .populate({
                path: "userId",
                select: "fullName memberId referrerId",
                populate: { path: "referrerId", select: "fullName memberId" },
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
            return res.status(400).json({ message: "유효하지 않은 주문 ID입니다." });
        }

        const order = await Order.findById(orderId)
            .populate("userId", "fullName memberId phone mobile address bankName accountNumber")
            .lean();

        if (!order) {
            return res.status(404).json({ message: "주문 정보를 찾을 수 없습니다." });
        }

        // 상품 정보 가져오기: 일반 상품 → 키트 순서로 시도
        let productImagePath = "/img/default.jpg";

        const product = await Product.findOne({ koreanName: order.productName }).lean();
        if (product) {
            productImagePath = product.imagePath;
        } else {
            const kit = await Kit.findOne({ kitName: order.productName }).lean();
            if (kit) {
                productImagePath = kit.imagePath;
            }
        }

        // 배송지 정보
        let delivery = null;
        if (order.deliveryAddressId) {
            delivery = await Address.findById(order.deliveryAddressId).lean();
        } else {
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
            dueDate: order.createdAt ? new Date(new Date(order.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000) : null,
        };

        res.json({
            _id: order._id,
            createdAt: order.createdAt,
            product: {
                productName: order.productName,
                imagePath: productImagePath,
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
