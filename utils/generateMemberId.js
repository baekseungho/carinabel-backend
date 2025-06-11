const User = require("../models/User");

const generateMemberId = async () => {
    const now = new Date();
    const year = String(now.getFullYear()).slice(2); // 예: 25
    const month = String(now.getMonth() + 1).padStart(2, "0"); // 예: 06
    const prefix = `K${year}${month}`; // 예: K2506

    // 정규식: 대소문자 구분 없이 매칭되도록 옵션 추가
    const regex = new RegExp(`^${prefix}\\d{4}$`, "i");

    // 가장 최근 createdAt 기준으로 정렬해서 가져오기
    const latestUser = await User.findOne({ memberId: { $regex: regex } })
        .sort({ createdAt: -1 })
        .lean();

    let nextNumber = 1;

    if (latestUser) {
        const lastNumber = parseInt(latestUser.memberId.slice(-4), 10);
        nextNumber = lastNumber + 1;
    }

    const nextMemberId = `${prefix}${String(nextNumber).padStart(4, "0")}`;
    console.log("📦 새로 생성된 memberId:", nextMemberId);
    return nextMemberId;
};

module.exports = generateMemberId;
