const express = require("express");
const router = express.Router();
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const asyncHandler = require("express-async-handler");

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
                token: generateToken(user._id),
            });
        } else {
            res.status(401);
            throw new Error("이메일, 아이디 또는 비밀번호가 일치하지 않습니다.");
        }
    })
);

module.exports = router;
