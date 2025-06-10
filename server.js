const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
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
// 환경변수 설정
dotenv.config();

// DB 연결
connectDB();

// 서버 설정
const app = express();
app.use(express.json());
app.use(morgan("dev"));
app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
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

// 주소 라우터
app.use("/api/addresses", addressRoutes);

// QnA 라우터
app.use("/api/qna", qnaRoutes);

// 관리자 라우터
app.use("/api/admin", adminRoutes);

// 관리자 라우터
app.use("/api/kits", kitRoutes);
// 서버 시작
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
