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
        const {
            tid,
            amt,
            goodsName,
            productType,
            payMethod,
            ordNm,
            email,
            returnUrl,
        } = req.body;

        if (!tid || !amt || !goodsName || !ordNm || !returnUrl) {
            return res
                .status(400)
                .json({ success: false, message: "필수 정보 누락" });
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
            return res
                .status(400)
                .json({ success: false, message: "tid 누락" });
        }

        // 실제 결제 상태 확인 로직 필요 (윈페이 연동)
        // 아래는 예시 응답
        const isPaid = true; // 실제 결제 결과에 따라 설정

        if (isPaid) {
            return res
                .status(200)
                .json({ success: true, message: "결제 성공" });
        } else {
            return res
                .status(200)
                .json({ success: false, message: "결제 실패" });
        }
    })
);
// 📱 BankPay 결제 요청 (결제창 URL 발급)
router.post(
    "/bankpay/request",
    asyncHandler(async (req, res) => {
        const { tid, amt, goodsName, productType, ordNm, email, returnUrl } =
            req.body;

        // 필수 파라미터 검증
        if (!tid || !amt || !goodsName || !ordNm || !returnUrl) {
            return res
                .status(400)
                .json({ success: false, message: "필수 정보 누락" });
        }

        // 💳 실제 Winpay BankPay 연동 로직 (추후 외부 API 요청 추가 예정)
        // 예시 응답 형식 (BankPay는 form 방식이기 때문에 필요한 필드를 모두 제공해야 함)
        const paymentData = {
            url: "https://jh.winglobalpay.com", // 실제 PG URL로 대체 필요
            mid: "TESTMID1234", // 가맹점 ID (실제 발급값)
            tid,
            amt,
            goodsName,
            productType: productType || "01", // 기본: 실물 상품
            ordNm,
            email,
            returnUrl,
            // 기타 필요 파라미터 추가 가능
        };

        res.status(200).json({
            success: true,
            paymentUrl: JSON.stringify(paymentData), // 프론트에서 form 전송용으로 쓰기 위함
            tid,
        });
    })
);

// 🔄 BankPay 결제 결과 수신 처리
router.post(
    "/bankpay/result",
    asyncHandler(async (req, res) => {
        const {
            tid,
            resultCd, // '0000' = 성공
            resultMsg,
            authNo,
            authDt,
            amt,
            goodsName,
            ordNm,
        } = req.body;

        if (!tid) {
            return res.status(400).send("❌ TID 누락");
        }

        console.log("✅ BankPay 결제 결과 수신:", req.body);

        if (resultCd === "0000") {
            // 💡 결제 성공
            // ➤ 이곳에서 주문 정보를 업데이트하거나 후처리 가능

            // 예시: 성공 메시지 출력
            res.send(`
        <html>
          <head><title>결제 완료</title></head>
          <body>
            <h2>✅ 결제가 완료되었습니다.</h2>
            <p>주문자: ${ordNm}</p>
            <p>상품명: ${goodsName}</p>
            <p>금액: ${amt}원</p>
            <p>승인번호: ${authNo}</p>
            <p>승인일시: ${authDt}</p>
            <a href="/">홈으로 이동</a>
          </body>
        </html>
      `);
        } else {
            // 💥 결제 실패
            res.send(`
        <html>
          <head><title>결제 실패</title></head>
          <body>
            <h2>❌ 결제 실패</h2>
            <p>사유: ${resultMsg || "알 수 없는 오류"}</p>
            <a href="/">홈으로 이동</a>
          </body>
        </html>
      `);
        }
    })
);

module.exports = router;
