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
        const user = await User.findById(decoded.id);

        if (!user) {
            res.status(404);
            throw new Error("사용자를 찾을 수 없습니다.");
        }

        // ❌ 탈퇴한 회원 차단
        if (user.isDeleted) {
            res.status(403);
            throw new Error("탈퇴한 회원입니다. 고객센터에 문의하세요.");
        }

        req.user = user; // ✅ 전체 user 객체 저장
        next();
    } catch (err) {
        console.error("❌ 인증 실패:", err.message);
        res.status(401);
        throw new Error("유효하지 않은 토큰입니다.");
    }
});

module.exports = { protect };
