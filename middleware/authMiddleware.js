const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// 🔐 사용자 인증 미들웨어
const protect = asyncHandler(async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        res.status(401);
        throw new Error("토큰이 없습니다.");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // ✅ req.user.id 로 접근 가능
        next();
    } catch (err) {
        res.status(401);
        throw new Error("유효하지 않은 토큰입니다.");
    }
});

module.exports = { protect };
