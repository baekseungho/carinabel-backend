const calculateDiscountedPrice = (consumerPrice, membershipLevel) => {
    const discounts = {
        일반회원: 0,
        회원: 0.1,
        대리점: 0.3,
        총판: 0.5,
    };

    if (!membershipLevel || !(membershipLevel in discounts)) {
        console.warn("❗️알 수 없는 회원등급:", membershipLevel);
    }

    const discount = discounts[membershipLevel] || 0;
    return Math.floor(consumerPrice * (1 - discount));
};

module.exports = calculateDiscountedPrice;
