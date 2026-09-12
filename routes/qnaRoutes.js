// routes/qnaRoutes.js
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const QnA = require("../models/QnA");
const mongoose = require("mongoose");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");

// 📌 전체 게시글 목록 조회
// router.get(
//     "/",
//     asyncHandler(async (req, res) => {
//         const { category, searchType, keyword, page = "1", size = "10" } = req.query;

//         const pageInt = Math.max(parseInt(page), 1);
//         const sizeInt = Math.max(parseInt(size), 1);

//         const query = {};

//         if (category && category !== "전체") {
//             query.category = category;
//         }

//         if (keyword) {
//             const regex = new RegExp(keyword, "i");
//             if (searchType === "title") query.title = regex;
//             else if (searchType === "content") query.content = regex;
//             else if (searchType === "title_content") query.$or = [{ title: regex }, { content: regex }];
//         }

//         const total = await QnA.countDocuments(query);

//         const qnas = await QnA.find(query)
//             .populate("userId", "fullName memberId")
//             .sort({ createdAt: -1 })
//             .skip((pageInt - 1) * sizeInt)
//             .limit(sizeInt);

//         const result = qnas.map((item) => {
//             const maskedName = item.userId.fullName.replace(/.$/, "*");
//             return {
//                 _id: item._id,
//                 title: item.title,
//                 category: item.category,
//                 views: item.views,
//                 createdAt: item.createdAt,
//                 productName: item.productName || "-",
//                 imagePath: item.imagePath || "/img/default.jpg",
//                 maskedAuthor: maskedName,
//                 hasAnswer: item.answer && item.answer.content ? true : false, // ✅ 추가
//             };
//         });

//         res.json({
//             qnas: result,
//             total,
//             page: pageInt,
//             size: sizeInt,
//         });
//     })
// );

// 📌 본인 게시글만 조회 (옵션: category, search, pagination)
router.get(
    "/",
    protect,
    asyncHandler(async (req, res) => {
        const {
            userId, // ✅ 추가: 본인 ID를 쿼리로 전달
            category,
            searchType,
            keyword,
            page = "1",
            size = "10",
        } = req.query;

        const pageInt = Math.max(1, Math.min(100000, parseInt(page) || 1));
        const sizeInt = Math.max(1, Math.min(100, parseInt(size) || 10));

        const query = {};

        if (req.user.role !== "admin") {
            if (userId && userId !== req.user.id) {
                return res.status(403).json({ message: "본인의 문의만 조회할 수 있습니다." });
            }
            query.userId = req.user.id;
        } else if (userId && !mongoose.isObjectIdOrHexString(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        // ✅ 본인 글 필터링
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            query.userId = new mongoose.Types.ObjectId(userId);
        }

        if (category && category !== "전체") {
            query.category = category;
        }

        if (keyword) {
            const regex = new RegExp(String(keyword).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            if (searchType === "title") query.title = regex;
            else if (searchType === "content") query.content = regex;
            else if (searchType === "title_content") query.$or = [{ title: regex }, { content: regex }];
        }

        const total = await QnA.countDocuments(query);

        const qnas = await QnA.find(query)
            .populate("userId", "fullName memberId")
            .sort({ createdAt: -1 })
            .skip((pageInt - 1) * sizeInt)
            .limit(sizeInt);

        const result = qnas.map((item) => {
            const maskedName = item.userId?.fullName?.replace(/.$/, "*") || "탈퇴 회원";
            const hasAnswer = item.answer && item.answer.content;

            return {
                _id: item._id,
                title: item.title,
                content: item.content,
                category: item.category,
                views: item.views,
                createdAt: item.createdAt,
                productName: item.productName || "-",
                imagePath: item.imagePath || "/img/default.jpg",
                maskedAuthor: maskedName,
                hasAnswer: hasAnswer
                    ? {
                          content: item.answer.content,
                          adminName: item.answer.adminId?.fullName || "관리자",
                      }
                    : false,
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

// 📌 내가 작성한 게시글 조회 (페이지네이션 적용)
router.get(
    "/my",
    protect,
    asyncHandler(async (req, res) => {
        const { userId, page = 1, size = 5 } = req.query;

        if (req.user.id !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "본인의 문의만 조회할 수 있습니다." });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "유효하지 않은 사용자 ID입니다." });
        }

        const pageNum = parseInt(page);
        const pageSize = parseInt(size);

        const total = await QnA.countDocuments({ userId });
        const qnas = await QnA.find({ userId })
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * pageSize)
            .limit(pageSize);

        res.json({ total, qnas });
    })
);

// 📌 게시글 상세 조회 (+ 조회수 증가)
router.get(
    "/:id",
    protect,
    asyncHandler(async (req, res) => {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            return res.status(400).json({ message: "유효하지 않은 문의 ID입니다." });
        }
        const filter = { _id: req.params.id };
        if (req.user.role !== "admin") filter.userId = req.user.id;
        const qna = await QnA.findOneAndUpdate(filter, { $inc: { views: 1 } }, { new: true })
            .populate("userId", "fullName memberId")
            .populate("answer.adminId", "fullName");
        if (!qna) {
            return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
        }
        res.json(qna);
    })
);

// 📌 게시글 작성
router.post(
    "/",
    protect,
    asyncHandler(async (req, res) => {
        const { title, category, content, userId, orderId, productName, imagePath } = req.body;

        if (!title || !category || !content || !userId) {
            return res.status(400).json({ message: "모든 필드를 입력해주세요." });
        }

        if (req.user.id !== userId) {
            return res.status(403).json({ message: "본인의 문의만 작성할 수 있습니다." });
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
    protect,
    asyncHandler(async (req, res) => {
        const qna = await QnA.findById(req.params.id);
        if (!qna) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });

        if (qna.userId.toString() !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ message: "본인의 문의만 수정할 수 있습니다." });
        }

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
    protect,
    asyncHandler(async (req, res) => {
        const qna = await QnA.findById(req.params.id);
        if (!qna) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
        if (qna.userId.toString() !== req.user.id && req.user.role !== "admin") {
            return res.status(403).json({ message: "본인의 문의만 삭제할 수 있습니다." });
        }
        await qna.deleteOne();
        res.json({ message: "삭제되었습니다." });
    })
);

// 📌 QnA 답변 등록 (관리자)
router.put(
    "/answer/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const qnaId = req.params.id;
        const { content } = req.body;

        const updatedQna = await QnA.findByIdAndUpdate(
            qnaId,
            { answer: { content, adminId: req.user.id, createdAt: new Date() } },
            { new: true }
        );

        if (!updatedQna) return res.status(404).json({ message: "QnA not found" });

        res.json({ message: "답변이 등록되었습니다.", qna: updatedQna });
    })
);
module.exports = router;
