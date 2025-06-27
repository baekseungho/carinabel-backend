const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

// 🔐 인증 미들웨어 (선택)
const protect = require("../middleware/authMiddleware"); // 필요시

// 💳 결제 요청 (결제창 URL 발급)
router.post(
    "/request",
    asyncHandler(async (req, res) => {
        const { tid, amt, goodsName, productType, payMethod, ordNm, email, returnUrl } = req.body;

        if (!tid || !amt || !goodsName || !ordNm || !returnUrl) {
            return res.status(400).json({ success: false, message: "필수 정보 누락" });
        }

        // 윈페이 결제 요청을 여기에 연동 (실제 연동 시 외부 API 요청 필요)
        // 예시 응답:
        const paymentUrl = `https://pg.winpay.co.kr/pay?tid=${tid}`; // 실제는 PG사 API 호출 필요

        res.status(200).json({
            success: true,
            paymentUrl,
            tid,
        });
    })
);

// 📦 결제 상태 확인
router.get(
    "/status/:tid",
    asyncHandler(async (req, res) => {
        const { tid } = req.params;

        if (!tid) {
            return res.status(400).json({ success: false, message: "tid 누락" });
        }

        // 실제 결제 상태 확인 로직 필요 (윈페이 연동)
        // 아래는 예시 응답
        const isPaid = true; // 실제 결제 결과에 따라 설정

        if (isPaid) {
            return res.status(200).json({ success: true, message: "결제 성공" });
        } else {
            return res.status(200).json({ success: false, message: "결제 실패" });
        }
    })
);

module.exports = router;
