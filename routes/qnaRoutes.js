// routes/qnaRoutes.js
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const QnA = require("../models/QnA");
const mongoose = require("mongoose");

// 📌 전체 게시글 목록 조회
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const {
            category,
            searchType,
            keyword,
            page = "1", // string 기본값
            size = "10",
        } = req.query;

        const pageInt = Math.max(parseInt(page), 1); // 최소 1
        const sizeInt = Math.max(parseInt(size), 1); // 최소 1

        const query = {};

        // 카테고리 필터
        if (category && category !== "전체") {
            query.category = category;
        }

        // 검색 필터
        if (keyword) {
            const regex = new RegExp(keyword, "i");
            if (searchType === "title") query.title = regex;
            else if (searchType === "content") query.content = regex;
            else if (searchType === "title_content") query.$or = [{ title: regex }, { content: regex }];
        }

        const total = await QnA.countDocuments(query);

        const qnas = await QnA.find(query)
            .populate("userId", "fullName email")
            .sort({ createdAt: -1 })
            .skip((pageInt - 1) * sizeInt)
            .limit(sizeInt);

        const result = qnas.map((item) => {
            const maskedName = item.userId.fullName.replace(/.$/, "*");
            return {
                _id: item._id,
                title: item.title,
                category: item.category,
                views: item.views,
                createdAt: item.createdAt,
                productName: item.productName || "-",
                imagePath: item.imagePath || "/img/default.jpg",
                maskedAuthor: maskedName,
            };
        });

        res.json({
            qnas: result,
            total,
            page: pageInt,
            size: sizeInt,
        });
    })
);

// 📌 내가 작성한 게시글 조회
router.get(
    "/my",
    asyncHandler(async (req, res) => {
        const userId = req.query.userId;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }
        const myQnAs = await QnA.find({ userId }).sort({ createdAt: -1 });
        res.json(myQnAs);
    })
);

// 📌 게시글 상세 조회 (+ 조회수 증가)
router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const qna = await QnA.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true }).populate(
            "userId",
            "fullName email"
        );
        if (!qna) {
            return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
        }
        res.json(qna);
    })
);

// 📌 게시글 작성
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { title, category, content, userId, orderId, productName, imagePath } = req.body;

        if (!title || !category || !content || !userId) {
            return res.status(400).json({ message: "모든 필드를 입력해주세요." });
        }

        const newQnA = await QnA.create({
            title,
            category,
            content,
            userId,
            orderId,
            productName, // ✅ 저장
            imagePath, // ✅ 저장
        });

        res.status(201).json(newQnA);
    })
);

// 📌 게시글 수정
router.put(
    "/:id",
    asyncHandler(async (req, res) => {
        const qna = await QnA.findById(req.params.id);
        if (!qna) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });

        const { title, category, content } = req.body;
        if (title) qna.title = title;
        if (category) qna.category = category;
        if (content) qna.content = content;

        const updatedQnA = await qna.save();
        res.json(updatedQnA);
    })
);

// 📌 게시글 삭제
router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const qna = await QnA.findById(req.params.id);
        if (!qna) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
        await qna.deleteOne();
        res.json({ message: "삭제되었습니다." });
    })
);

module.exports = router;
