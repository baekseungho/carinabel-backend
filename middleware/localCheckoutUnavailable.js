// Purchases currently take place at the partner store. Do not expose the
// unfinished local PG integration until server-side payment verification exists.
module.exports = (req, res) => res.status(503).json({
    code: "LOCAL_CHECKOUT_UNAVAILABLE",
    message: "현재 구매는 제휴 쇼핑몰에서 진행됩니다. 결제 및 환불은 구매처로 문의해 주세요.",
});
