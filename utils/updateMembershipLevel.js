const membershipLevels = require("../config/membershipLevels");

const updateMembershipLevel = (user, singlePurchaseAmount) => {
    // 🔄 단일 결제 금액에 따른 등급 설정
    if (singlePurchaseAmount >= 3300000) {
        user.membershipLevel = "대리점";
    } else if (singlePurchaseAmount >= 550000) {
        user.membershipLevel = "IPC회원";
    }

    // 🔄 누적 구매액에 따른 등급 설정
    if (user.totalPurchaseAmount >= 20000000) {
        user.membershipLevel = "총판";
    }

    return user;
};

module.exports = updateMembershipLevel;
