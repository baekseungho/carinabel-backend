const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const generateToken = require("../utils/generateToken");
const Order = require("../models/Order");
const calculateDiscountedPrice = require("../utils/calculateDiscount");
const Product = require("../models/Product");
// 관리자 계정생성
router.post(
    "/create",
    asyncHandler(async (req, res) => {
        const { fullName, email, password } = req.body;

        const existingAdmin = await User.findOne({ email });
        if (existingAdmin) {
            res.status(400);
            throw new Error("이미 존재하는 관리자입니다.");
        }

        const adminUser = await User.create({
            fullName,
            email,
            password,
            role: "admin",
            agreedToTerms: true,
            phone: "000-0000-0000", // 👉 더미값
            birthday: new Date("1900-01-01"), // 👉 더미 생년월일
        });

        res.status(201).json({
            message: "관리자 계정이 생성되었습니다.",
            _id: adminUser._id,
            email: adminUser.email,
        });
    })
);

// ✅ 관리자 로그인
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { adminId, password } = req.body;

        const user = await User.findOne({ email: adminId, role: "admin" });

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                token: generateToken(user._id, user.role),
            });
        } else {
            res.status(401);
            throw new Error("관리자 ID 또는 비밀번호가 잘못되었습니다.");
        }
    })
);

router.get(
    "/users",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { name, email, level, page = 1, size = 10 } = req.query;

        const query = {};
        if (name) query.fullName = new RegExp(name, "i");
        if (email) query.email = new RegExp(email, "i");
        if (level) query.membershipLevel = level;

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * size)
            .limit(Number(size));

        res.json({
            users,
            total,
        });
    })
);

// 관리자 주문 리스트 조회 API (상품명, 이름, 이메일로 필터링)
router.get(
    "/orders",
    asyncHandler(async (req, res) => {
        const { page = 1, size = 10, email, productName, name } = req.query;

        const match = {};

        // 🔍 사용자 이름으로 검색
        if (name) {
            const users = await User.find({
                fullName: new RegExp(name, "i"),
            }).select("_id");
            const userIds = users.map((u) => u._id);
            match.userId = { $in: userIds };
        }

        // 🔍 이메일 검색 (populate 전이라서 조건 불가 — 나중에 필터하거나 위와 같이 처리)
        if (email) {
            const users = await User.find({
                email: new RegExp(email, "i"),
            }).select("_id");
            const userIds = users.map((u) => u._id);
            if (match.userId) {
                // 이름 + 이메일 동시 필터링
                match.userId.$in = match.userId.$in.filter((id) => userIds.some((e) => e.equals(id)));
            } else {
                match.userId = { $in: userIds };
            }
        }

        if (productName) {
            match.productName = new RegExp(productName, "i");
        }

        const skip = (Number(page) - 1) * Number(size);
        const total = await Order.countDocuments(match);
        const orders = await Order.find(match)
            .populate("userId", "fullName email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(size));

        res.json({ orders, total });
    })
);

// 🔐 관리자 상품 목록 조회
router.get(
    "/products",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const products = await Product.find({});
        res.json(products);
    })
);

// ➕ 관리자 상품 추가
router.post(
    "/products/add",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { category, productName, koreanName, volume, consumerPrice, imagePath, detailImage, stock } = req.body;

        const product = new Product({
            category,
            productName,
            koreanName,
            volume,
            consumerPrice,
            memberPrice: calculateDiscountedPrice(consumerPrice, "일반회원"),
            imagePath: imagePath || "/img/default.jpg",
            detailImage: detailImage || "/img/default_detail.jpg",
            stock: stock || 0,
        });

        await product.save();
        res.json({ message: "상품이 성공적으로 등록되었습니다.", product });
    })
);

// ✏️ 관리자 상품 수정
router.put(
    "/products/update/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { category, productName, koreanName, volume, consumerPrice, stock } = req.body;

        const product = await Product.findById(req.params.id);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        product.category = category || product.category;
        product.productName = productName || product.productName;
        product.koreanName = koreanName || product.koreanName;
        product.volume = volume || product.volume;
        product.consumerPrice = consumerPrice || product.consumerPrice;
        product.memberPrice = calculateDiscountedPrice(consumerPrice || product.consumerPrice, "일반회원");
        product.stock = stock !== undefined ? stock : product.stock;
        await product.save();
        res.json({ message: "상품이 수정되었습니다.", product });
    })
);

// 🗑️ 관리자 상품 삭제
router.delete(
    "/products/delete/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const product = await Product.findById(req.params.id);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        await product.deleteOne();
        res.json({ message: "상품이 삭제되었습니다." });
    })
);
// ✅ 관리자 전용 대시보드
router.get(
    "/dashboard",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        res.json({ message: "관리자만 접근 가능한 대시보드입니다." });
    })
);

module.exports = router;
