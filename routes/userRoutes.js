const express = require("express");
const router = express.Router();
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const updateMembershipLevel = require("../utils/updateMembershipLevel");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
// 회원가입
router.post(
    "/register",
    asyncHandler(async (req, res) => {
        const { fullName, email, phone, birthday, password, agreedToTerms } = req.body;

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

        // 사용자 생성
        const user = await User.create({
            fullName,
            email,
            phone,
            birthday,
            password,
            agreedToTerms,
        });

        res.status(201).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            birthday: user.birthday,
            agreedToTerms: user.agreedToTerms,
            token: generateToken(user._id),
        });
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
        });
    })
);

// 회원 정보 업데이트 (등급 반영)
router.put(
    "/update-profile/:userId",
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { additionalAmount } = req.body;

        console.log("📝 업데이트 요청:", userId, additionalAmount);

        // 🛠️ userId가 ObjectId 형식인지 확인
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.error("❌ 유효하지 않은 사용자 ID:", userId);
            res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
            return;
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error("❌ 사용자를 찾을 수 없습니다:", userId);
            res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
            return;
        }

        // 누적 구매액 추가
        user.totalPurchaseAmount += additionalAmount;

        // 등급 업데이트 (단일 결제 금액도 고려)
        updateMembershipLevel(user, additionalAmount);

        await user.save();

        console.log("✅ 회원 정보 업데이트 완료:", user);

        res.json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            birthday: user.birthday,
            membershipLevel: user.membershipLevel,
            totalPurchaseAmount: user.totalPurchaseAmount,
            token: generateToken(user._id),
        });
    })
);
module.exports = router;
