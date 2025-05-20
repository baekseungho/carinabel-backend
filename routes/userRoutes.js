const express = require("express");
const router = express.Router();
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
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
            referrerEmail, // 🔄 추천인 이메일 추가
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
            referrerId: referrer ? referrer._id : null,
        });

        res.status(201).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            birthday: user.birthday,
            agreedToTerms: user.agreedToTerms,
            accountNumber: user.accountNumber,
            socialSecurityNumber: user.socialSecurityNumber,
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
            throw new Error("이메일, 아이디 또는 비밀번호가 일치하지 않습니다.");
        }
    })
);

// 🔄 회원 정보 조회
router.get(
    "/profile",
    asyncHandler(async (req, res) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            res.status(401);
            throw new Error("토큰이 없습니다.");
        }

        const user = await User.findOne({ token });
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
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
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

        // ✅ 추천인 수당 지급
        if (user.referrerId && additionalAmount >= 550000) {
            await distributeReferralEarnings(user, additionalAmount, isFirstPurchase);
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
            res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
            return;
        }

        const earnings = await Referral.find({ referrerId: userId }).populate("referredUserId");

        res.json(earnings);
    })
);

module.exports = router;
