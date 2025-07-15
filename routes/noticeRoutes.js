const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const Notice = require("../models/Notice");
const mongoose = require("mongoose");

// 📌 전체 공지 목록 조회 (페이징 지원)
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 5;

        const total = await Notice.countDocuments();
        const notices = await Notice.find()
            .sort({ date: -1 })
            .skip(page * size)
            .limit(size);

        res.json({
            total,
            page,
            size,
            notices,
        });
    })
);

// 📌 공지 상세 조회
router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const noticeId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(noticeId)) {
            return res.status(400).json({ message: "잘못된 공지 ID입니다." });
        }

        const notice = await Notice.findById(noticeId);
        if (notice) {
            res.json(notice);
        } else {
            res.status(404).json({ message: "공지사항을 찾을 수 없습니다." });
        }
    })
);

module.exports = router;
