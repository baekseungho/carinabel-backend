const asyncHandler = require("express-async-handler");

const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    res.status(403);
    throw new Error("관리자 권한이 필요합니다.");
  }
  next();
};

module.exports = { adminOnly };
