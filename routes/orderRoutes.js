const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { protect } = require("../middleware/authMiddleware");
const Order = require("../models/Order");
const Purchase = require("../models/Purchase");
const User = require("../models/User");
const Product = require("../models/Product");
const Address = require("../models/Address"); // 기본 배송지 모델
const Kit = require("../models/Kit"); // 키트 모델도 불러오기
const generateOrderNumber = require("../utils/generateOrderNumber");
const cancelService = require("../services/cancelService");
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

        const orderNumber = await generateOrderNumber();
        // 3️⃣ 주문 생성
        const newOrder = await Order.create({
            userId,
            productName,
            imagePath,
            amount,
            quantity,
            status: status || "결제완료",
            deliveryDate: deliveryDate || null,
            orderNumber, // 추가된 필드
        });

        // 4️⃣ 통계용 기록
        await Purchase.create({
            userId,
            amount,
        });

        res.status(201).json(newOrder);
    })
);

// 주문 취소 API
router.post(
    "/cancel/:orderId",
    protect,
    asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { payMethod, trxId, amount, cancelReason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });

        if (order.userId.toString() !== req.user.id) {
            return res.status(403).json({ message: "본인 주문만 취소할 수 있습니다." });
        }

        if (order.status === "취소됨") return res.status(400).json({ message: "이미 취소된 주문입니다." });

        if (!trxId) return res.status(400).json({ message: "거래번호가 없습니다." });

        const { RETURNURL, TOKEN } = await cancelService.requestCancelReady(payMethod);

        const cancelRes = await cancelService.executeCancel({
            returnUrl: RETURNURL,
            token: TOKEN,
            cpid: process.env.KIWOOMPAY_CPID,
            trxId,
            amount,
            cancelReason,
        });

        if (cancelRes.RESULTCODE !== "0000") {
            console.error("❌ 취소 실패:", cancelRes.ERRORMESSAGE);
            return res.status(500).json({ message: cancelRes.ERRORMESSAGE });
        }

        order.status = "취소됨";
        await order.save();

        res.json({
            message: "주문이 취소되었습니다.",
            cancelDate: cancelRes.CANCELDATE,
            amount: cancelRes.AMOUNT,
        });
    })
);

// 주문 상태 업데이트 API
router.put(
    "/update-status/:orderId",
    protect,
    asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!["결제완료", "배송중", "배송완료", "취소됨"].includes(status)) {
            return res.status(400).json({ message: "허용되지 않는 상태입니다." });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
        }

        order.status = status;
        await order.save();

        res.json({ message: "주문 상태가 업데이트되었습니다.", order });
    })
);
// 결제 결과 조회 API
router.get(
    "/payment-status/:orderNo",
    protect,
    asyncHandler(async (req, res) => {
        const { orderNo } = req.params;

        const jwtToken = req.headers.authorization?.split(" ")[1];
        if (!jwtToken) {
            return res.status(401).json({ message: "JWT 토큰이 필요합니다." });
        }

        const statusUrl = `https://api.kiwoompay.co.kr/api/payment/status/${orderNo}`;
        const response = await fetch(statusUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${jwtToken}`,
            },
        });

        const data = await response.json();

        if (!data.success) {
            return res.status(400).json({ message: data.message || "결제 상태 확인 실패" });
        }

        // 주문 상태 업데이트
        const order = await Order.findOne({ orderNumber: orderNo });
        if (order && order.status !== "결제완료") {
            order.status = "결제완료";
            await order.save();
        }

        res.json({
            message: "결제 성공",
            status: data.status,
            orderInfo: order,
            raw: data,
        });
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
        let zipCode = "";
        let addressWithoutZip = "";

        if (delivery?.address) {
            const match = delivery.address.match(/^(\d{5})\s(.+)$/);
            if (match) {
                zipCode = match[1]; // "48060"
                addressWithoutZip = match[2]; // "부산 해운대구 APEC로 30 (우동), 벡스코제2전시장 604-1701"
            } else {
                addressWithoutZip = delivery.address; // 혹시 앞에 우편번호 없으면 전체
            }
        }
        res.json({
            _id: order._id,
            orderNumber: order.orderNumber, // ✅ 주문번호 추가
            createdAt: order.createdAt,
            product: {
                productName: order.productName,
                imagePath: productImagePath,
                amount: order.amount,
                quantity: order.quantity,
            },
            status: order.status,
            user: order.userId,
            delivery: {
                recipientName: delivery?.recipientName || order.userId.fullName,
                phone: delivery?.phone || order.userId.mobile,
                address: addressWithoutZip, // ✅ 우편번호 제거된 주소
                detailAddress: delivery?.detailAddress || "",
                zipCode: zipCode, // ✅ 우편번호만 따로
                memo: delivery?.memo || "",
            },
            payment,
        });
    })
);

module.exports = router;
