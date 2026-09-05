const notFound = (req, res) => {
    res.status(404).json({ message: "요청한 API를 찾을 수 없습니다." });
};

const errorHandler = (err, req, res, _next) => {
    const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
    const isProduction = process.env.NODE_ENV === "production";

    if (!isProduction) {
        console.error(err);
    }

    res.status(statusCode).json({
        message: statusCode === 500 && isProduction ? "서버 오류가 발생했습니다." : err.message,
        ...(!isProduction && { stack: err.stack }),
    });
};

module.exports = { notFound, errorHandler };
