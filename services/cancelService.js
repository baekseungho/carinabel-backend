const axios = require("axios");

const CPID = process.env.KIWOOMPAY_CPID;
const AUTH_KEY = process.env.KIWOOMPAY_AUTH_KEY;
const READY_URL = "https://apitest.kiwoompay.co.kr/pay/ready";

// 1단계: 취소 URL 요청
async function requestCancelReady(payMethod) {
    const headers = {
        "Content-Type": "application/json;charset=EUC-KR",
        Authorization: AUTH_KEY,
    };

    const body = {
        CPID,
        PAYMETHOD: payMethod,
        CANCELREQ: "Y",
    };

    const response = await axios.post(READY_URL, body, { headers });
    return response.data; // { RETURNURL, TOKEN }
}

// 2단계: 실제 취소 요청
async function executeCancel({ returnUrl, token, cpid, trxId, amount, cancelReason }) {
    const headers = {
        "Content-Type": "application/json;charset=EUC-KR",
        Authorization: AUTH_KEY,
    };

    const body = {
        CPID: cpid,
        TOKEN: token,
        TRXID: trxId,
        AMOUNT: amount.toString(),
        CANCELREASON: cancelReason || "고객 요청 취소",
    };

    const response = await axios.post(returnUrl, body, { headers });
    return response.data;
}

module.exports = {
    requestCancelReady,
    executeCancel,
};
