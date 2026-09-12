const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const mongoose = require("mongoose");

const protect = asyncHandler(async (req, res, next) => {
    const authorization = req.headers.authorization;
    const [scheme, token, extra] = authorization ? authorization.trim().split(/\s+/) : [];

    if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
        res.status(401);
        throw new Error("Bearer 인증 토큰이 필요합니다.");
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
        if (!decoded || !mongoose.isObjectIdOrHexString(decoded.id)) {
            throw new Error("Invalid token subject");
        }
    } catch (_error) {
        res.status(401);
        throw new Error("유효하지 않거나 만료된 인증 토큰입니다.");
    }

    const user = await User.findById(decoded.id);
    if (!user) {
        res.status(401);
        throw new Error("인증된 사용자를 찾을 수 없습니다.");
    }

    if (user.isDeleted) {
        res.status(403);
        throw new Error("탈퇴한 회원입니다. 고객센터에 문의해 주세요.");
    }

    req.user = user;
    next();
});

module.exports = { protect };
