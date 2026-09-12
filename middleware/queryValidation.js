module.exports = (req, res, next) => {
    for (const [key, value] of Object.entries(req.query)) {
        if (typeof value !== "string" || value.length > 500) {
            return res.status(400).json({ message: "검색 조건은 500자 이하의 문자열이어야 합니다." });
        }
        if (["page", "size"].includes(key)) {
            const minimum = key === "page" && req.path.startsWith("/api/notices") ? 0 : 1;
            const maximum = key === "size" ? 100 : 100000;
            if (!/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum) {
                return res.status(400).json({ message: "페이지 또는 조회 개수가 허용 범위를 벗어났습니다." });
            }
        }
        if (["fromDate", "toDate"].includes(key) && value && !Number.isFinite(Date.parse(value))) {
            return res.status(400).json({ message: "검색 날짜를 확인해 주세요." });
        }
    }
    next();
};
