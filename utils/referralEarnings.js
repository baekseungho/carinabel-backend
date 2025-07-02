const Referral = require("../models/Referral");
const User = require("../models/User");

/**
 * 추천인 수당을 계산하고 지급하는 함수
 * @param {Object} buyer - 구매자 유저 객체 (User 모델 인스턴스)
 * @param {Number} purchaseAmount - 결제 금액 (단일 결제 금액)
 * @param {Boolean} isFirstPurchase - 해당 유저의 첫 구매 여부
 */
async function distributeReferralEarnings(
    buyer,
    purchaseAmount,
    isFirstPurchase
) {
    // 추천인이 없는 경우 수당 지급 불가
    if (!buyer.referrerId) return;

    // 추천인 정보 조회
    const referrer = await User.findById(buyer.referrerId);
    if (!referrer) return;

    // ❌ 일반회원이면 수당 지급 불가
    const eligibleLevels = ["회원", "대리점", "총판"];
    if (!eligibleLevels.includes(referrer.membershipLevel)) {
        console.log(
            `⚠️ 수당 미지급 - 추천인 등급이 낮음: ${referrer.memberId} (${referrer.membershipLevel})`
        );
        return;
    }

    // 첫 구매 시 30%, 일반 구매 시 10% 수당 계산
    const percentage = isFirstPurchase ? 0.3 : 0.1;
    const commission = Math.floor(purchaseAmount * percentage);

    // 수당 기록 저장
    await Referral.create({
        referrerId: referrer._id, // 수당 받는 사람
        referredUserId: buyer._id, // 구매한 사람
        amount: commission, // 수당 금액
        percentage: percentage * 100, // 수당 비율 (예: 30)
        firstPurchase: isFirstPurchase, // 첫 구매 여부
    });

    // 추천인 누적 수당 반영, 미지급수당 반영

    referrer.totalReferralEarnings += commission;
    referrer.unpaidReferralEarnings += commission;
    await referrer.save();

    console.log(
        `✅ 추천인 수당 지급 완료: ${commission}원 (${referrer.memberId})`
    );
}
module.exports = distributeReferralEarnings;
