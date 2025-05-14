const membershipLevels = require("../config/membershipLevels");

const updateMembershipLevel = (user, singlePurchaseAmount) => {
    const now = new Date();

    // 🔄 단일 결제 금액에 따른 등급 설정
    if (singlePurchaseAmount >= 3300000) {
        user.membershipLevel = "대리점";
    } else if (singlePurchaseAmount >= 550000) {
        user.membershipLevel = "IPC회원";
    }

    // 🔄 첫 구매일 설정
    if (!user.firstPurchaseDate) {
        user.firstPurchaseDate = now;
        user.totalPromotionAmount = singlePurchaseAmount;
    } else {
        // 90일 이내의 누적 프로모션 금액
        const daysSinceFirstPurchase = Math.floor(
            (now - user.firstPurchaseDate) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceFirstPurchase <= 90) {
            user.totalPromotionAmount += singlePurchaseAmount;
        }

        // 총판 등급 판단
        if (user.totalPromotionAmount >= 20000000) {
            user.membershipLevel = "총판";
        }
    }

    // 🔄 누적 구매액 업데이트 (기존 로직)
    user.totalPurchaseAmount += singlePurchaseAmount;

    return user;
};

module.exports = updateMembershipLevel;
