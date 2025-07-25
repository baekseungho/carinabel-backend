const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const generateToken = require("../utils/generateToken");
const Order = require("../models/Order");
const calculateDiscountedPrice = require("../utils/calculateDiscount");
const Referral = require("../models/Referral");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const Kit = require("../models/Kit");
const Notice = require("../models/Notice");
const axios = require("axios");
const generateMemberId = require("../utils/generateMemberId");
// 관리자 계정생성
router.post(
    "/create",
    asyncHandler(async (req, res) => {
        const { fullName, memberId, password } = req.body;

        const existingAdmin = await User.findOne({ memberId });
        if (existingAdmin) {
            res.status(400);
            throw new Error("이미 존재하는 관리자입니다.");
        }

        const adminUser = await User.create({
            fullName,
            memberId,
            password,
            role: "admin",
            agreedToTerms: true,
            phone: "000-0000-0000", // 👉 더미값
            birthday: new Date("1900-01-01"), // 👉 더미 생년월일
        });

        res.status(201).json({
            message: "관리자 계정이 생성되었습니다.",
            _id: adminUser._id,
            memberId: adminUser.memberId,
        });
    })
);

// ✅ 관리자 로그인
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { adminId, password } = req.body;

        const user = await User.findOne({ memberId: adminId, role: "admin" });

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                fullName: user.fullName,
                memberId: user.memberId,
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
        const { name, memberId, level, page = 1, size = 10, fromDate, toDate } = req.query;

        const query = {
            isDeleted: false, // ✅ 탈퇴 회원 제외
        };

        if (name) query.fullName = new RegExp(name, "i");
        if (memberId) query.memberId = new RegExp(memberId, "i");
        if (level) query.membershipLevel = level;

        // ✅ 가입일 필터 추가
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) query.createdAt.$gte = new Date(fromDate);
            if (toDate) {
                const endDate = new Date(toDate);
                endDate.setDate(endDate.getDate() + 1);
                query.createdAt.$lt = endDate;
            }
        }

        const total = await User.countDocuments(query);

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * size)
            .limit(Number(size))
            .populate("referrerId", "fullName memberId")
            .lean();

        const result = users.map((user) => ({
            _id: user._id,
            fullName: user.fullName,
            memberId: user.memberId,
            phone: user.phone,
            birthday: user.birthday,
            membershipLevel: user.membershipLevel,
            createdAt: user.createdAt,
            address: user.address || "-",
            referrerName: user.referrerId?.fullName || "-",
            referrerMemberId: user.referrerId?.memberId || "-",
        }));

        res.json({
            users: result,
            total,
        });
    })
);

// 🔍 탈퇴 회원 목록 조회
router.get(
    "/withdrawn-users",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { name, memberId, page = 1, size = 10, fromDate, toDate } = req.query;

        const query = {
            isDeleted: true, // ✅ 탈퇴 회원만 조회
        };

        if (name) query.fullName = new RegExp(name, "i");
        if (memberId) query.memberId = new RegExp(memberId, "i");

        // 가입일 필터
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) query.createdAt.$gte = new Date(fromDate);
            if (toDate) {
                const endDate = new Date(toDate);
                endDate.setDate(endDate.getDate() + 1);
                query.createdAt.$lt = endDate;
            }
        }

        const total = await User.countDocuments(query);

        const users = await User.find(query)
            .sort({ deletedAt: -1 }) // 최근 탈퇴 순으로 정렬
            .skip((page - 1) * size)
            .limit(Number(size))
            .populate("referrerId", "fullName memberId")
            .lean();

        const result = users.map((user) => ({
            _id: user._id,
            fullName: user.fullName,
            memberId: user.memberId,
            phone: user.phone,
            birthday: user.birthday,
            membershipLevel: user.membershipLevel,
            deletedAt: user.deletedAt,
            deleteReason: user.deleteReason,
            referrerName: user.referrerId?.fullName || "-",
            referrerMemberId: user.referrerId?.memberId || "-",
        }));

        res.json({
            users: result,
            total,
        });
    })
);

router.put(
    "/restore/:userId",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        if (!user.isDeleted) return res.status(400).json({ message: "이미 활성화된 회원입니다." });

        // 하위 회원들의 추천인 복구
        const subUsers = await User.find({
            referrerId: user.referrerId || null,
            previousReferrerId: user._id,
        });
        for (const subUser of subUsers) {
            subUser.referrerId = subUser.previousReferrerId;
            subUser.previousReferrerId = null;
            await subUser.save();
        }

        user.isDeleted = false;
        user.deletedAt = null;
        user.deleteReason = "";

        await user.save();

        res.json({ message: "회원 복구가 완료되었습니다." });
    })
);

// 관리자 주문 리스트 조회 API (상품명, 이름, 이메일로 필터링)
router.get(
    "/orders",
    asyncHandler(async (req, res) => {
        const { page = 1, size = 10, orderNumber, productName, name, fromDate, toDate } = req.query;

        const match = {};

        // 🔍 주문번호
        if (orderNumber) {
            match.orderNumber = new RegExp(orderNumber, "i");
        }

        // 🔍 상품명
        if (productName) {
            match.productName = new RegExp(productName, "i");
        }

        // 🔍 사용자 이름
        if (name) {
            const users = await User.find({
                fullName: new RegExp(name, "i"),
            }).select("_id");
            const userIds = users.map((u) => u._id);
            match.userId = { $in: userIds };
        }

        // 🔍 주문일시 (createdAt)
        if (fromDate || toDate) {
            match.createdAt = {};
            if (fromDate) match.createdAt.$gte = new Date(fromDate);
            if (toDate) {
                const to = new Date(toDate);
                to.setDate(to.getDate() + 1); // 포함되도록 하루 더함
                match.createdAt.$lt = to;
            }
        }

        const skip = (Number(page) - 1) * Number(size);
        const total = await Order.countDocuments(match);
        const orders = await Order.find(match)
            .populate("userId", "fullName memberId")
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

        // 🔹 고유 시퀀스 번호 증가 및 가져오기
        let counter = await Counter.findOneAndUpdate(
            { name: "product" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        // 🔹 숫자 포맷팅 (6자리 0패딩)
        const formattedCode = counter.seq.toString().padStart(6, "0");

        const product = new Product({
            category,
            productCode: formattedCode, // 자동 부여된 상품번호
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
        const { category, productName, koreanName, volume, consumerPrice, stock, imagePath, detailImage } = req.body;

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "상품을 찾을 수 없습니다." });
        }

        product.category = category || product.category;
        product.productName = productName || product.productName;
        product.koreanName = koreanName || product.koreanName;
        product.volume = volume || product.volume;
        product.consumerPrice = consumerPrice || product.consumerPrice;
        product.memberPrice = calculateDiscountedPrice(consumerPrice || product.consumerPrice, "일반회원");
        product.stock = stock !== undefined ? stock : product.stock;
        product.imagePath = imagePath || product.imagePath;
        product.detailImage = detailImage || product.detailImage;
        console.log("detailImage in req.body:", detailImage);
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
// 🔹 키트 등록
router.post(
    "/kits/create",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { kitName, products, price, originalPrice, description, imagePath, detailImage } = req.body;

        // 🔹 시퀀스 증가
        const counter = await Counter.findOneAndUpdate(
            { name: "kit" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        // 🔹 5자리 0패딩
        const formattedKitCode = counter.seq.toString().padStart(5, "0");

        const kit = await Kit.create({
            kitCode: formattedKitCode, // 자동 생성된 코드
            kitName,
            products,
            price,
            originalPrice,
            description,
            imagePath: imagePath || "/img/default_product.png",
            detailImage: detailImage || "/img/default_detail.jpg",
        });

        res.status(201).json(kit);
    })
);

// 🔹 전체 키트 리스트 조회
router.get(
    "/kits",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const kits = await Kit.find().populate("products.productId");
        res.json(kits);
    })
);

// 🔹 키트 수정
router.put(
    "/kits/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { kitName, products, price, originalPrice, description, imagePath, detailImage } = req.body;

        const updatedData = {
            kitName,
            products,
            price,
            originalPrice,
            description,
            imagePath: imagePath || "/img/default_product.png",
            detailImage: detailImage || "/img/default_detail.jpg",
        };

        const kit = await Kit.findByIdAndUpdate(req.params.id, updatedData, {
            new: true,
        });

        if (!kit) {
            return res.status(404).json({ message: "해당 키트를 찾을 수 없습니다." });
        }

        res.json(kit);
    })
);

// 🔹 키트 삭제
router.delete(
    "/kits/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const kit = await Kit.findByIdAndDelete(req.params.id);
        if (!kit) {
            return res.status(404).json({ message: "해당 키트를 찾을 수 없습니다." });
        }
        res.json({ message: "키트가 삭제되었습니다." });
    })
);

// GET /api/admin/referral-earnings 수당 관리 조회
router.get(
    "/referral-earnings",
    protect,
    adminOnly, // ✅ 관리자 권한만 허용
    asyncHandler(async (req, res) => {
        const { name, memberId, bankName, page = 1, size = 10 } = req.query;

        const filter = {};
        if (name) filter.fullName = { $regex: name, $options: "i" };
        if (memberId) filter.memberId = { $regex: memberId, $options: "i" };
        if (bankName) filter.bankName = { $regex: bankName, $options: "i" };

        const limit = parseInt(size);
        const skip = (parseInt(page) - 1) * limit;

        const [total, users] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select(
                    "fullName memberId totalReferralEarnings paidReferralEarnings unpaidReferralEarnings accountNumber bankName socialSecurityNumber"
                )
                .sort({ unpaidReferralEarnings: -1 }) // 🔽 미지급 수당이 높은 순으로 정렬
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);

        res.status(200).json({ total, users });
    })
);

// 수당 상세 정보 조회 API
router.get(
    "/referral-details/:userId",
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (!String(userId).match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const referralRecords = await Referral.find({ referrerId: userId })
            .populate("referredUserId", "fullName memberId")
            .sort({ date: -1 });

        res.json(referralRecords);
    })
);
// 수당 지급 처리 API
router.post(
    "/referral-pay",
    asyncHandler(async (req, res) => {
        const { userId, amount } = req.body;

        // ObjectId 유효성 검사 (정규식 사용)
        if (!String(userId).match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        }

        if (user.unpaidReferralEarnings < amount) {
            return res.status(400).json({ message: "미지급 수당이 부족합니다." });
        }

        user.unpaidReferralEarnings -= amount;
        user.paidReferralEarnings += amount;
        await user.save();

        res.json({
            message: "수당 지급 완료",
            paidReferralEarnings: user.paidReferralEarnings,
            unpaidReferralEarnings: user.unpaidReferralEarnings,
        });
    })
);

// 관리자용 주문 목록 조회
router.get(
    "/admin-orders",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { name, orderNumber, status } = req.query;

        const query = {};

        if (orderNumber) query.orderNumber = orderNumber;
        if (status) query.status = status;

        if (name) {
            const users = await User.find({
                fullName: new RegExp(name, "i"),
            }).select("_id");
            query.userId = { $in: users.map((u) => u._id) };
        }

        const orders = await Order.find(query).populate("userId", "fullName").sort({ createdAt: -1 });

        res.status(200).json(orders);
    })
);

// 상태 업데이트
router.put(
    "/update-order-status/:orderId",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "유효하지 않은 주문 ID입니다." });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
        }

        order.status = status;
        await order.save();

        res.status(200).json({ message: "주문 상태가 업데이트되었습니다." });
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

// 📌 전체 공지사항 목록 조회 (관리자 전용)
router.get(
    "/notices",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const notices = await Notice.find().sort({ date: -1 });
        res.json(notices);
    })
);

// ➕ 공지사항 등록
router.post(
    "/notices/add",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { title, summary, content, date } = req.body;

        if (!title || !summary || !content || !date) {
            return res.status(400).json({ message: "모든 항목을 입력해주세요." });
        }

        const notice = new Notice({ title, summary, content, date });
        await notice.save();

        res.status(201).json({ message: "공지사항이 등록되었습니다.", notice });
    })
);

// ✏️ 공지사항 수정
router.put(
    "/notices/update/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { title, summary, content, date } = req.body;

        const notice = await Notice.findById(req.params.id);
        if (!notice) {
            return res.status(404).json({ message: "공지사항을 찾을 수 없습니다." });
        }

        notice.title = title || notice.title;
        notice.summary = summary || notice.summary;
        notice.content = content || notice.content;
        notice.date = date || notice.date;

        await notice.save();

        res.json({ message: "공지사항이 수정되었습니다.", notice });
    })
);

// ❌ 공지사항 삭제
router.delete(
    "/notices/delete/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const notice = await Notice.findById(req.params.id);
        if (!notice) {
            return res.status(404).json({ message: "공지사항을 찾을 수 없습니다." });
        }

        await notice.deleteOne();
        res.json({ message: "공지사항이 삭제되었습니다." });
    })
);

// 관리자: 취소대기 상태의 주문 조회
router.get(
    "/cancel-pending",
    protect,
    adminOnly, // 관리자 인증 미들웨어
    asyncHandler(async (req, res) => {
        const orders = await Order.find({ status: "취소대기" });
        res.json(orders);
    })
);

// 관리자: 실제 취소 요청 처리
router.post(
    "/cancel-order/:orderNumber",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { orderNumber } = req.params;
        const { trxId, amount, reason, payMethod } = req.body;

        console.log("🧾 취소 요청 도착:");
        console.log("orderNumber:", orderNumber);
        console.log("trxId:", trxId);
        console.log("amount:", amount);
        console.log("reason:", reason);
        console.log("payMethod:", payMethod);

        const order = await Order.findOne({ orderNumber });
        if (!order) return res.status(404).json({ message: "주문이 존재하지 않습니다." });
        if (order.status !== "취소대기") return res.status(400).json({ message: "이미 처리된 주문입니다." });

        const AUTHKEY = process.env.WINPAY_CANCEL_KEY;
        const CPID = process.env.WINPAY_CPID;

        try {
            console.log("🔐 [1단계] /pay/ready 호출...");
            const readyRes = await axios.post(
                "https://api.kiwoompay.co.kr/pay/ready",
                {
                    CPID,
                    PAYMETHOD: payMethod,
                    CANCELREQ: "Y",
                },
                {
                    headers: {
                        "Content-Type": "application/json;charset=EUC-KR",
                        Authorization: AUTHKEY,
                    },
                }
            );

            console.log("✅ READY 응답:", readyRes.data);
            const { RETURNURL, TOKEN } = readyRes.data;

            console.log("🔐 [2단계] RETURNURL로 최종 취소 요청:", RETURNURL);
            const cancelRes = await axios.post(
                RETURNURL,
                {
                    CPID,
                    TRXID: trxId,
                    AMOUNT: amount.toString(),
                    CANCELREASON: reason,
                    TOKEN,
                },
                {
                    headers: {
                        "Content-Type": "application/json;charset=EUC-KR",
                        Authorization: AUTHKEY,
                    },
                }
            );

            console.log("✅ CANCEL 응답:", cancelRes.data);
            const { RESULTCODE, ERRORMESSAGE } = cancelRes.data;

            if (RESULTCODE !== "0000") {
                console.error("❌ 취소 실패:", ERRORMESSAGE);
                return res.status(400).json({ message: "취소 실패: " + ERRORMESSAGE });
            }

            order.status = "취소됨";
            await order.save();

            console.log("✅ 주문 상태 '취소됨'으로 변경 완료");
            res.json({ message: "정상적으로 취소되었습니다.", order });
        } catch (err) {
            console.error("❌ 키움페이 취소 실패:", err.response?.data || err.message);
            res.status(500).json({ message: "키움페이 API 호출 중 오류가 발생했습니다." });
        }
    })
);

// 🔧 관리자 수기 회원 등록
router.post(
    "/manual-register",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const {
            fullName,
            email,
            phone,
            birthday,
            password,
            agreedToTerms,
            accountNumber,
            socialSecurityNumber,
            bankName,
            address,
            referrermemberId,
            createdAt, // ✅ 관리자 수기 입력
        } = req.body;

        if (!fullName || !phone || !birthday || !password) {
            res.status(400);
            throw new Error("필수 항목을 모두 입력해주세요.");
        }

        const phoneExists = await User.findOne({ phone });
        if (phoneExists) {
            res.status(400);
            throw new Error("이미 사용 중인 휴대폰 번호입니다.");
        }

        let referrer = null;
        if (referrermemberId) {
            referrer = await User.findOne({ memberId: referrermemberId });
            if (!referrer) {
                res.status(400);
                throw new Error("추천인을 찾을 수 없습니다.");
            }
        }

        if (email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                res.status(400);
                throw new Error("이미 사용 중인 이메일입니다.");
            }
        }

        const memberId = await generateMemberId();

        const user = await User.create({
            fullName,
            email,
            memberId,
            phone,
            birthday,
            password,
            agreedToTerms,
            accountNumber,
            socialSecurityNumber,
            bankName: bankName || "",
            address: address || "",
            referrerId: referrer ? referrer._id : null,
            createdAt: createdAt ? new Date(createdAt) : new Date(), // ✅ 수기 입력된 날짜 적용
        });

        const Address = require("../models/Address");
        await Address.create({
            userId: user._id,
            recipientName: user.fullName,
            phone: "",
            mobile: user.phone,
            address: user.address || "",
            isDefault: true,
        });

        res.status(201).json({
            message: "수기 회원 등록이 완료되었습니다.",
            userId: user._id,
            memberId: user.memberId,
        });

        console.log("✅ 수기 회원가입 완료:", user.fullName);
    })
);

// 수기 주문추가
router.post(
    "/manual-order",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const {
            userId,
            productName,
            amount,
            quantity,
            status = "결제완료",
            deliveryDate = null,
            imagePath = "",
            orderType = "oil", // oil | kit
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "회원을 찾을 수 없습니다." });

        // 🔄 재고 차감
        const Product = require("../models/Product");
        const Kit = require("../models/Kit");

        if (orderType === "oil") {
            const product = await Product.findOne({ koreanName: productName });
            if (!product) return res.status(404).json({ message: "상품을 찾을 수 없습니다." });

            if (product.stock < quantity) {
                return res
                    .status(400)
                    .json({ message: `재고 부족: ${product.koreanName} - 남은 재고 ${product.stock}` });
            }

            product.stock -= quantity;
            await product.save();
        } else if (orderType === "kit") {
            const kit = await Kit.findOne({ kitName: productName }).populate("products.productId");
            if (!kit) return res.status(404).json({ message: "키트 상품을 찾을 수 없습니다." });

            // 구성품 재고 확인
            const insufficient = kit.products.find((item) => item.productId.stock < item.quantity * quantity);
            if (insufficient) {
                return res.status(400).json({
                    message: `구성품 ${insufficient.productId.koreanName}의 재고가 부족합니다. 남은 재고: ${insufficient.productId.stock}`,
                });
            }

            // 구성품 재고 차감
            for (const item of kit.products) {
                const product = item.productId;
                product.stock -= item.quantity * quantity;
                await product.save();
            }
        } else {
            return res.status(400).json({ message: "잘못된 orderType입니다." });
        }

        // 주문 생성
        const generateOrderNumber = require("../utils/generateOrderNumber");
        const orderNumber = await generateOrderNumber();

        const Order = require("../models/Order");
        const newOrder = await Order.create({
            userId,
            productName,
            imagePath,
            amount,
            quantity,
            status,
            deliveryDate,
            orderType,
            orderNumber,
        });

        // 통계 반영
        const Purchase = require("../models/Purchase");
        await Purchase.create({ userId, amount });

        // 등급/수당 반영
        const isFirstPurchase = !user.firstPurchaseDate;
        if (isFirstPurchase && amount >= 550000) {
            user.firstPurchaseDate = new Date();
        }

        const updateMembershipLevel = require("../utils/updateMembershipLevel");
        updateMembershipLevel(user, amount);

        const distributeReferralEarnings = require("../utils/referralEarnings");
        const shouldPayReferral = isFirstPurchase ? amount >= 550000 : true;
        if (user.referrerId && shouldPayReferral) {
            await distributeReferralEarnings(user, amount, isFirstPurchase);
        }

        await user.save();

        res.status(201).json({
            message: "수기 주문 및 회원 반영 완료",
            orderId: newOrder._id,
            userId: user._id,
        });
    })
);

module.exports = router;
