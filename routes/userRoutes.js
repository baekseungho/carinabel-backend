const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Referral = require("../models/Referral");
const Purchase = require("../models/Purchase");
const generateToken = require("../utils/generateToken");
const { protect } = require("../middleware/authMiddleware");
const updateMembershipLevel = require("../utils/updateMembershipLevel");
const distributeReferralEarnings = require("../utils/referralEarnings");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

// 회원가입
router.post(
    "/register",
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
            bankName, // ✅ 은행명 추가
            address,
            referrerEmail, // ✅ 추천인 이메일
        } = req.body;

        // 필수 필드 확인
        if (!fullName || !email || !phone || !birthday || !password) {
            res.status(400);
            throw new Error("모든 필드를 입력해주세요.");
        }

        // 이메일, 휴대폰 중복 체크
        const emailExists = await User.findOne({ email });
        const phoneExists = await User.findOne({ phone });

        if (emailExists) {
            res.status(400);
            throw new Error("이미 사용 중인 이메일입니다.");
        }

        if (phoneExists) {
            res.status(400);
            throw new Error("이미 사용 중인 휴대폰 번호입니다.");
        }

        // 추천인 확인 (이메일로 조회)
        let referrer = null;
        if (referrerEmail) {
            referrer = await User.findOne({ email: referrerEmail });
            if (!referrer) {
                res.status(400);
                throw new Error("추천인을 찾을 수 없습니다.");
            }
        }

        // 사용자 생성
        const user = await User.create({
            fullName,
            email,
            phone,
            birthday,
            password,
            agreedToTerms,
            accountNumber,
            socialSecurityNumber,
            bankName: bankName || "KEB하나은행",
            address: address || "",
            referrerId: referrer ? referrer._id : null,
        });

        // ✅ 기본 배송지도 함께 생성
        const Address = require("../models/Address");
        await Address.create({
            userId: user._id,
            recipientName: user.fullName,
            phone: "", // 일반 전화번호 없음
            mobile: user.phone,
            address: user.address || "",
            isDefault: true,
        });

        res.status(201).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            birthday: user.birthday,
            address: user.address,
            agreedToTerms: user.agreedToTerms,
            accountNumber: user.accountNumber,
            socialSecurityNumber: user.socialSecurityNumber,
            bankName: user.bankName,
            referrerId: user.referrerId,
            token: generateToken(user._id),
        });

        console.log("✅ 회원가입 완료:", user);
        if (referrer) {
            console.log("🔗 추천인 설정 완료:", referrer.fullName);
        }
    })
);
// 로그인
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { emailOrId, password } = req.body;

        // 이메일 또는 ID로 사용자 조회
        const user = await User.findOne({
            $or: [{ email: emailOrId }, { userId: emailOrId }],
        });

        // 비밀번호 검사
        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                userId: user.userId,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                birthday: user.birthday,
                agreedToTerms: user.agreedToTerms,
                membershipLevel: user.membershipLevel, // ✅ 회원 등급 추가
                totalPurchaseAmount: user.totalPurchaseAmount, // ✅ 누적 구매액 추가
                token: generateToken(user._id),
            });
        } else {
            res.status(401);
            throw new Error(
                "이메일, 아이디 또는 비밀번호가 일치하지 않습니다."
            );
        }
    })
);

// 🔄 회원 정보 조회
const jwt = require("jsonwebtoken");

router.get(
    "/profile",
    asyncHandler(async (req, res) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401);
            throw new Error("토큰이 없습니다.");
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            res.status(401);
            throw new Error("유효하지 않은 토큰입니다.");
        }

        // ✅ referrerId 정보까지 populate해서 가져오기
        const user = await User.findById(decoded.id).populate(
            "referrerId",
            "email fullName"
        );
        if (!user) {
            res.status(404);
            throw new Error("사용자를 찾을 수 없습니다.");
        }

        res.json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            birthday: user.birthday,
            membershipLevel: user.membershipLevel,
            totalPurchaseAmount: user.totalPurchaseAmount,
            accountNumber: user.accountNumber,
            socialSecurityNumber: user.socialSecurityNumber,
            createdAt: user.createdAt,
            // ✅ 추천인 이메일 및 이름 전달
            referrerEmail: user.referrerId?.email || null,
            referrerName: user.referrerId?.fullName || null,
            address: user.address || null,
            bankName: user.bankName || "연동은행을 확인해주세요.",
        });
    })
);

// 회원 정보 업데이트 (등급 반영 및 추천인 수당)
router.put(
    "/update-profile/:userId",
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { additionalAmount } = req.body;

        console.log("📝 업데이트 요청:", userId, additionalAmount);

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res
                .status(404)
                .json({ message: "사용자를 찾을 수 없습니다." });
        }

        // 💡 여기서 미리 첫 구매 여부 판단
        const isFirstPurchase = !user.firstPurchaseDate;

        // ✅ 첫 구매일 먼저 설정 (로컬 객체에만 적용 → DB 저장은 나중)
        if (isFirstPurchase && additionalAmount >= 550000) {
            user.firstPurchaseDate = new Date();
            console.log("✅ 첫 구매일 설정 완료:", user.firstPurchaseDate);
        }

        // 등급 업데이트
        updateMembershipLevel(user, additionalAmount);

        // ✅ 구매 기록 저장 (자신의 구매 내역)
        await Purchase.create({
            userId: user._id,
            amount: additionalAmount,
        });

        // ✅ 추천인 수당 지급
        if (user.referrerId && additionalAmount >= 550000) {
            await distributeReferralEarnings(
                user,
                additionalAmount,
                isFirstPurchase
            );
        }

        await user.save();

        res.json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            birthday: user.birthday,
            membershipLevel: user.membershipLevel,
            totalPurchaseAmount: user.totalPurchaseAmount,
            totalPromotionAmount: user.totalPromotionAmount,
            totalReferralEarnings: user.totalReferralEarnings,
            firstPurchaseDate: user.firstPurchaseDate,
            token: generateToken(user._id),
        });
    })
);

// 🔄 추천인 수당 기록 조회
router.get(
    "/referral-earnings/:userId",
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const monthStats = [];

        for (let i = 0; i < 6; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");

            const start = new Date(year, date.getMonth(), 1);
            const end = new Date(year, date.getMonth() + 1, 0, 23, 59, 59);

            const monthlyReferral = await Referral.aggregate([
                {
                    $match: {
                        referrerId: new mongoose.Types.ObjectId(userId),
                        date: { $gte: start, $lte: end },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$amount" },
                    },
                },
            ]);

            monthStats.unshift({
                yearMonth: `${year}-${month}`,
                monthlyEarning: monthlyReferral[0]?.total || 0,
            });
        }

        // 총 누적 수당
        const totalReferral = await Referral.aggregate([
            {
                $match: {
                    referrerId: new mongoose.Types.ObjectId(userId),
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" },
                },
            },
        ]);

        const totalEarning = totalReferral[0]?.total || 0;

        res.json({
            stats: monthStats,
            totalEarning,
        });
    })
);
// 🔍 추천 및 구매 통계
router.get(
    "/stats/:userId",
    protect,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        // 🔒 요청자와 토큰의 userId 불일치 시 권한 거부
        if (req.user.id !== userId) {
            return res.status(403).json({ message: "권한이 없습니다." });
        }

        const monthStats = [];

        for (let i = 0; i < 6; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");

            const start = new Date(year, date.getMonth(), 1);
            const end = new Date(year, date.getMonth() + 1, 0, 23, 59, 59);

            // 당월 신규 추천 수
            const monthlyRefCount = await User.countDocuments({
                referrerId: userId,
                createdAt: { $gte: start, $lte: end },
            });

            // 당월 본인 구매 금액
            const purchaseAgg = await Purchase.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        createdAt: { $gte: start, $lte: end },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$amount" },
                    },
                },
            ]);
            const monthlyPurchase = purchaseAgg[0]?.total || 0;

            monthStats.unshift({
                yearMonth: `${year}-${month}`,
                monthlyRefCount,
                monthlyPurchase,
            });
        }

        // 총 추천인 수
        const totalRefCount = await User.countDocuments({ referrerId: userId });

        // 총 누적 구매액
        const totalPurchaseAgg = await Purchase.aggregate([
            {
                $match: { userId: new mongoose.Types.ObjectId(userId) },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" },
                },
            },
        ]);
        const totalPurchase = totalPurchaseAgg[0]?.total || 0;

        res.json({
            stats: monthStats, // ✅ 배열 형태
            totalRefCount,
            totalPurchase,
            token: generateToken(userId), // ✅ 갱신 토큰
        });
    })
);

// 🔧 기간별 구매 금액 계산 함수
const getPurchaseAmount = async (userId, period = "전체") => {
    const now = new Date();
    let match = { userId: new mongoose.Types.ObjectId(userId) };

    if (period === "당월") {
        match.createdAt = {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lte: new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
                23,
                59,
                59
            ),
        };
    } else if (period === "전월") {
        match.createdAt = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            $lte: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
        };
    }

    const agg = await Purchase.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    return agg[0]?.total || 0;
};

// 🔍 조직도 기반 회원 정보 + 구매 금액 조회
router.get(
    "/network/:userId",
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { period = "전체" } = req.query;

        // 🔸 로그인 사용자
        const user = await User.findById(userId).select(
            "fullName email membershipLevel referrerId"
        );
        if (!user) {
            return res
                .status(404)
                .json({ message: "사용자를 찾을 수 없습니다." });
        }

        // 🔼 추천인 (상단 노드)
        let referrer = null;
        if (user.referrerId) {
            const refUser = await User.findById(user.referrerId).select(
                "fullName email membershipLevel"
            );
            if (refUser) {
                const refPurchaseAmount = await getPurchaseAmount(
                    refUser._id,
                    period
                );
                referrer = {
                    ...refUser.toObject(),
                    purchaseAmount: refPurchaseAmount,
                };
            }
        }

        // 🔽 내가 추천한 사용자들
        const children = await User.find({ referrerId: userId }).select(
            "fullName email membershipLevel"
        );

        const childStats = await Promise.all(
            children.map(async (child) => {
                const amount = await getPurchaseAmount(child._id, period);
                return {
                    ...child.toObject(),
                    purchaseAmount: amount,
                };
            })
        );

        // 🔵 내 구매금액
        const myPurchaseAmount = await getPurchaseAmount(user._id, period);

        res.json({
            center: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                membershipLevel: user.membershipLevel,
                purchaseAmount: myPurchaseAmount,
            },
            parent: referrer,
            children: childStats,
        });
    })
);

// /users/referral-earnings/:userId/:yearMonth
router.get(
    "/referral-earnings/:userId/:yearMonth",
    asyncHandler(async (req, res) => {
        const { userId, yearMonth } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
                .status(400)
                .json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const [year, month] = yearMonth.split("-");
        const start = new Date(Number(year), Number(month) - 1, 1);
        const end = new Date(Number(year), Number(month), 0, 23, 59, 59);

        const earnings = await Referral.find({
            referrerId: userId,
            date: { $gte: start, $lte: end },
        }).populate("referredUserId");

        res.json(earnings);
    })
);

module.exports = router;
