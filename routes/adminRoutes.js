const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const generateToken = require("../utils/generateToken");

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
    const users = await User.find({ role: "user" }).sort({ createdAt: -1 });
    res.json(users);
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
