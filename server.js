const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
const qnaRoutes = require("./routes/qnaRoutes");
const adminRoutes = require("./routes/adminRoutes"); // 추가
const kitRoutes = require("./routes/kitRoutes");
const payRoutes = require("./routes/payRoutes");
const noticeRoutes = require("./routes/noticeRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
// 환경변수 설정
dotenv.config();

// DB 연결
connectDB();

// 서버 설정
const app = express();
// Explicitly configure proxy trust for the actual deployment topology.
app.set("trust proxy", process.env.TRUST_PROXY || false);
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error("허용되지 않은 출처입니다."));
        },
        credentials: true,
    })
);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
});
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/users/find-member-id", authLimiter);
app.use("/api/users/reset-password", authLimiter);
app.use("/api/admin/login", authLimiter);
app.use("/api/media", require("./routes/mediaRoutes"));
app.use(require("./middleware/queryValidation"));
// 기본 라우터
app.get("/", (req, res) => {
    res.send("API is running...");
});

// 사용자 라우터
app.use("/api/users", userRoutes);

// 🔄 상품 라우터 추가
app.use("/api/products", productRoutes);

// 장바구니 라우터
app.use("/api/cart", cartRoutes);

// 🆕 주문 라우터 등록
app.use("/api/orders", orderRoutes);

app.use("/api/notices", noticeRoutes);

// 주소 라우터
app.use("/api/addresses", addressRoutes);

// QnA 라우터
app.use("/api/qna", qnaRoutes);

// 관리자 라우터
app.use("/api/admin", adminRoutes);

// 관리자 라우터
app.use("/api/kits", kitRoutes);

//PG
app.use("/api/payment", payRoutes);

app.use(notFound);
app.use(errorHandler);
// 서버 시작

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
