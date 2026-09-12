const notFound = (req, res) => {
    res.status(404).json({ message: "요청한 API를 찾을 수 없습니다." });
};

const errorHandler = (err, req, res, _next) => {
    if (res.headersSent) return _next(err);
    let statusCode = res.statusCode >= 400 ? res.statusCode : 500;
    let message = err.message;
    if (err.name === "CastError" || err.name === "ValidationError") {
        statusCode = 400;
        message = "입력값의 형식과 필수 항목을 확인해 주세요.";
    } else if (err.code === 11000) {
        statusCode = 409;
        message = "이미 등록된 정보입니다. 입력 내용을 확인해 주세요.";
    } else if (err.type === "entity.parse.failed") {
        statusCode = 400;
        message = "요청 데이터 형식이 올바르지 않습니다.";
    } else if (err.type === "entity.too.large") {
        statusCode = 413;
        message = "요청 데이터가 너무 큽니다.";
    }
    const isProduction = process.env.NODE_ENV === "production";

    if (!isProduction) {
        console.error(err.name, statusCode);
    }

    res.status(statusCode).json({
        message: statusCode >= 500 ? "서버 오류가 발생했습니다." : message,
    });
};

module.exports = { notFound, errorHandler };
