const transitions = {
    "결제완료": ["상품준비중", "취소대기"],
    "상품준비중": ["배송중", "취소대기"],
    "배송중": ["배송완료"],
    "배송완료": ["구매확정"],
};
// Payment, refund, and return completion need their own accounting workflow.
module.exports = (from, to) => typeof to === "string" &&
    (from === to || Boolean(transitions[from]?.includes(to)));
