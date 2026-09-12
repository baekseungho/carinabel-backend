const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Referral = require("../models/Referral");
const Purchase = require("../models/Purchase");
const generateToken = require("../utils/generateToken");
const { protect } = require("../middleware/authMiddleware");
const updateMembershipLevel = require("../utils/updateMembershipLevel");
const distributeReferralEarnings = require("../utils/referralEarnings");
const generateMemberId = require("../utils/generateMemberId");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const jwt = require("jsonwebtoken");

// 회원가입
router.post(
    "/register",
    asyncHandler(async (req, res) => {
        const {
            fullName,
            email, // ✅ 추가
            phone,
            birthday,
            password,
            agreedToTerms,
            accountNumber,
            socialSecurityNumber,
            bankName,
            address,
            referrermemberId,
        } = req.body;

        if (!fullName || !phone || !birthday || !password) {
            res.status(400);
            throw new Error("모든 필드를 입력해주세요.");
        }

        if (String(password).length < 8) {
            return res.status(400).json({ message: "비밀번호는 8자 이상이어야 합니다." });
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
        // ✅ 자동 회원번호 생성
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
            _id: user._id,
            fullName: user.fullName,
            email: user.email, // ✅ 추가
            memberId: user.memberId,
            phone: user.phone,
            birthday: user.birthday,
            address: user.address,
            agreedToTerms: user.agreedToTerms,
            accountNumber: user.accountNumber,
            bankName: user.bankName,
            referrerId: user.referrerId,
            token: generateToken(user._id),
        });
    })
);
// 로그인
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { memberIdOrId, password } = req.body;

        if (typeof memberIdOrId !== "string" || !memberIdOrId.trim() || typeof password !== "string" || !password || password.length > 256) {
            return res.status(400).json({ message: "아이디와 비밀번호를 확인해 주세요." });
        }

        // 이메일 또는 ID로 사용자 조회
        const user = await User.findOne({
            $or: [{ memberId: memberIdOrId }, { userId: memberIdOrId }],
        });

        // ❌ 탈퇴 회원 차단
        if (user && user.isDeleted) {
            res.status(403);
            throw new Error("탈퇴한 회원입니다. 고객센터에 문의하세요.");
        }

        // 비밀번호 검사
        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                userId: user.userId,
                fullName: user.fullName,
                email: user.email,
                memberId: user.memberId,
                phone: user.phone,
                birthday: user.birthday,
                agreedToTerms: user.agreedToTerms,
                membershipLevel: user.membershipLevel,
                totalPurchaseAmount: user.totalPurchaseAmount,
                token: generateToken(user._id, user.role),
            });
        } else {
            res.status(401);
            throw new Error("아이디 또는 비밀번호가 일치하지 않습니다.");
        }
    })
);

// 회원번호 찾기
router.post(
    "/find-member-id",
    asyncHandler(async (req, res) => {
        const { fullName, phone } = req.body;

        if (!fullName || !phone) {
            res.status(400);
            throw new Error("이름과 휴대폰 번호를 입력해주세요.");
        }

        const user = await User.findOne({ fullName, phone });

        if (!user) {
            res.status(404);
            throw new Error("일치하는 회원 정보를 찾을 수 없습니다.");
        }

        res.json({ memberId: user.memberId, fullName: user.fullName });
    })
);

// 비밀번호 재설정
router.post(
    "/reset-password",
    (req, res) => res.status(503).json({
        code: "PASSWORD_RECOVERY_UNAVAILABLE",
        message: "비밀번호 재설정은 현재 고객센터로 문의해 주세요. 본인확인 후 안내해 드립니다.",
    })
);

router.put(
    "/withdraw",
    protect,
    asyncHandler(async (req, res) => {
        const { reason } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        if (user.isDeleted) return res.status(400).json({ message: "이미 탈퇴한 회원입니다." });

        // 하위 추천인 목록 조회
        const subUsers = await User.find({ referrerId: user._id });

        // 하위 회원들의 추천인을 탈퇴 회원의 추천인으로 변경하고 원래 추천인 저장
        for (const subUser of subUsers) {
            subUser.previousReferrerId = subUser.referrerId; // 현재 추천인 백업
            subUser.referrerId = user.referrerId || null; // 탈퇴한 회원의 상위 추천인으로 변경
            await subUser.save();
        }

        user.isDeleted = true;
        user.deletedAt = new Date();
        user.deleteReason = reason || "사용자 요청";

        await user.save();

        res.json({ message: "회원 탈퇴가 완료되었습니다." });
        console.log(`❌ 회원 탈퇴 완료: ${user.fullName} (${user.memberId})`);
    })
);

router.put(
    "/restore/:userId",
    protect,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "관리자만 회원을 복구할 수 있습니다." });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        if (!user.isDeleted) return res.status(400).json({ message: "이미 활성화된 회원입니다." });

        // 탈퇴 시 변경된 하위 회원들의 추천인 복원
        const subUsers = await User.find({ referrerId: user.referrerId || null, previousReferrerId: user._id });
        for (const subUser of subUsers) {
            subUser.referrerId = subUser.previousReferrerId; // 원래 추천인으로 복원
            subUser.previousReferrerId = null;
            await subUser.save();
        }

        user.isDeleted = false;
        user.deletedAt = null;
        user.deleteReason = "";

        await user.save();

        res.json({ message: "회원 복구가 완료되었습니다." });
        console.log(`✅ 회원 복구 완료: ${user.fullName} (${user.memberId})`);
    })
);

// 🔄 회원 정보 조회
router.get(
    "/profile",
    protect,
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
        const user = await User.findById(decoded.id).populate("referrerId", "memberId fullName");
        if (!user) {
            res.status(404);
            throw new Error("사용자를 찾을 수 없습니다.");
        }

        res.json({
            _id: user._id,
            fullName: user.fullName,
            memberId: user.memberId,
            phone: user.phone,
            birthday: user.birthday,
            membershipLevel: user.membershipLevel,
            totalPurchaseAmount: user.totalPurchaseAmount,
            accountNumber: user.accountNumber,
            socialSecurityNumber: user.socialSecurityNumber,
            createdAt: user.createdAt,
            // ✅ 추천인 이메일 및 이름 전달
            referrermemberId: user.referrerId?.memberId || null,
            referrerName: user.referrerId?.fullName || null,
            address: user.address || null,
            bankName: user.bankName || "연동은행을 확인해주세요.",
        });
    })
);

// 회원 정보 업데이트 (등급 반영 및 추천인 수당)
router.put(
    "/update-profile/:userId",
    protect,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { additionalAmount } = req.body;

        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "관리자만 구매 금액을 반영할 수 있습니다." });
        }

        console.log("📝 업데이트 요청:", userId, additionalAmount);

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        }

        // 🟡 첫 구매 여부 판단
        const isFirstPurchase = !user.firstPurchaseDate;

        // 🟢 첫 구매 인정 조건: 55만원 이상일 때만
        if (isFirstPurchase && additionalAmount >= 550000) {
            user.firstPurchaseDate = new Date();
            console.log("✅ 첫 구매일 설정:", user.firstPurchaseDate);
        }
        // 등급 업데이트
        updateMembershipLevel(user, additionalAmount);

        // ✅ 구매 기록 저장 (자신의 구매 내역)
        // 25.06.11 주문기록과 중복처리되어 totalPurchase에 2배로저장되는현상때문에 주석처리함
        // await Purchase.create({
        //     userId: user._id,
        //     amount: additionalAmount,
        // });

        // 🔵 추천인 수당 지급 로직
        if (user.referrerId) {
            const shouldPayReferral = isFirstPurchase ? additionalAmount >= 550000 : true;

            if (shouldPayReferral) {
                await distributeReferralEarnings(user, additionalAmount, isFirstPurchase);
            }
        }
        console.log("👀 user instanceof mongoose.Document:", user instanceof mongoose.Document);
        await user.save();

        res.json({
            _id: user._id,
            fullName: user.fullName,
            memberId: user.memberId,
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
    protect,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        if (req.user.id !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "본인의 수당 정보만 조회할 수 있습니다." });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const monthStats = [];

        for (let i = 0; i < 6; i++) {
            const now = new Date(); // 매번 새로 생성
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);

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

            monthStats.push({
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

        if (req.user.id !== userId) {
            return res.status(403).json({ message: "권한이 없습니다." });
        }

        const monthStats = [];

        const now = new Date();
        for (let i = 0; i < 6; i++) {
            const baseDate = new Date(now.getFullYear(), now.getMonth() - i, 1); // 월의 1일 고정
            const year = baseDate.getFullYear();
            const month = String(baseDate.getMonth() + 1).padStart(2, "0");

            const start = new Date(year, baseDate.getMonth(), 1);
            const end = new Date(year, baseDate.getMonth() + 1, 0, 23, 59, 59);

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

            monthStats.push({
                yearMonth: `${year}-${month}`,
                monthlyRefCount,
                monthlyPurchase,
            });
        }

        // 총 누적 추천 수
        const totalRefCount = await User.countDocuments({ referrerId: userId });

        // 총 누적 본인 구매 금액
        const totalAgg = await Purchase.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" },
                },
            },
        ]);
        const totalPurchase = totalAgg[0]?.total || 0;

        res.json({
            stats: monthStats.reverse(), // 최신순 정렬
            totalRefCount,
            totalPurchase,
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
            $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        };
    } else if (period === "전월") {
        match.createdAt = {
            $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            $lte: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
        };
    }

    const agg = await Purchase.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }]);

    return agg[0]?.total || 0;
};

// 🔍 조직도 기반 회원 정보 + 구매 금액 조회
router.get(
    "/network/:userId",
    protect,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { period = "전체" } = req.query;

        // 🔸 로그인 사용자
        const user = await User.findOne({ _id: userId, isDeleted: false }).select(
            "fullName memberId membershipLevel referrerId"
        );
        if (!user) {
            return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        }

        // 🔼 추천인 (상단 노드)
        let referrer = null;
        if (user.referrerId) {
            const refUser = await User.findOne({ _id: user.referrerId, isDeleted: false }).select(
                "fullName memberId membershipLevel"
            );
            if (refUser) {
                const refPurchaseAmount = await getPurchaseAmount(refUser._id, period);
                referrer = {
                    ...refUser.toObject(),
                    purchaseAmount: refPurchaseAmount,
                };
            }
        }

        // 🔽 내가 추천한 사용자들 (탈퇴 회원 제외)
        const children = await User.find({ referrerId: userId, isDeleted: false }).select(
            "fullName memberId membershipLevel"
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
                memberId: user.memberId,
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
    protect,
    asyncHandler(async (req, res) => {
        const { userId, yearMonth } = req.params;

        if (req.user.id !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "본인의 수당 정보만 조회할 수 있습니다." });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const [year, month] = yearMonth.split("-");
        const start = new Date(Number(year), Number(month) - 1, 1);
        const end = new Date(Number(year), Number(month), 0, 23, 59, 59);

        const earnings = await Referral.find({
            referrerId: userId,
            date: { $gte: start, $lte: end },
        }).populate("referredUserId", "fullName memberId membershipLevel");

        res.json(earnings);
    })
);

// 📌 계좌정보 업데이트 API
router.put(
    "/update-bank",
    protect,
    asyncHandler(async (req, res) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "인증 토큰이 없습니다." });
        }

        let userId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id;
        } catch (err) {
            return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
        }

        const { bankName, accountNumber, socialSecurityNumber } = req.body;

        if (!bankName || !accountNumber || !socialSecurityNumber) {
            return res.status(400).json({ message: "입력값이 유효하지 않습니다." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
        }

        user.bankName = bankName;
        user.accountNumber = accountNumber;
        user.socialSecurityNumber = socialSecurityNumber;

        await user.save();

        res.json({ message: "계좌정보가 성공적으로 업데이트되었습니다." });
    })
);

module.exports = router;
