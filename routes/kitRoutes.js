const express = require("express");
const router = express.Router();
const Kit = require("../models/Kit");
const User = require("../models/User");
const Product = require("../models/Product");
const asyncHandler = require("express-async-handler");
const calculateDiscountedPrice = require("../utils/calculateDiscount");
const jwt = require("jsonwebtoken");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
// 🔹 키트 등록
router.post(
    "/create",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const { kitName, products, price, originalPrice, description } = req.body;
        const kit = await Kit.create({
            kitName,
            products,
            price,
            originalPrice,
            description,
        });
        res.status(201).json(kit);
    })
);

// 🔹 전체 키트 리스트 조회
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const kits = await Kit.find().populate("products.productId");
        res.json(kits);
    })
);

// 🔹 키트 수정
router.put(
    "/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const kit = await Kit.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
        });
        if (!kit) return res.status(404).json({ message: "해당 키트를 찾을 수 없습니다." });
        res.json(kit);
    })
);

// 🔹 키트 삭제
router.delete(
    "/:id",
    protect,
    adminOnly,
    asyncHandler(async (req, res) => {
        const kit = await Kit.findByIdAndDelete(req.params.id);
        if (!kit) return res.status(404).json({ message: "해당 키트를 찾을 수 없습니다." });
        res.json({ message: "키트가 삭제되었습니다." });
    })
);

// ✅ 단일 키트 상세 조회 API
router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        let membershipLevel = "일반회원";

        // 토큰에서 회원 등급 가져오기
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (user) {
                    membershipLevel = user.membershipLevel;
                }
            } catch (error) {
                console.error("회원 인증 실패:", error.message);
            }
        }

        // 키트 조회
        const kit = await Kit.findById(req.params.id).lean();
        if (!kit) {
            return res.status(404).json({ message: "키트를 찾을 수 없습니다." });
        }

        // 구성품 상세 정보 불러오기
        const detailedProducts = await Promise.all(
            kit.products.map(async (item) => {
                const product = await Product.findById(item.productId).lean();
                return {
                    ...item,
                    productInfo: product
                        ? {
                              _id: product._id,
                              koreanName: product.koreanName,
                              productName: product.productName,
                              imagePath: product.imagePath,
                              stock: product.stock,
                              volume: product.volume,
                              consumerPrice: product.consumerPrice,
                              memberPrice: calculateDiscountedPrice(product.consumerPrice, membershipLevel),
                          }
                        : null,
                };
            })
        );
        console.log("💡 회원 등급:", membershipLevel);

        // 최종 응답 객체
        res.json({
            ...kit,
            memberPrice: calculateDiscountedPrice(kit.price, membershipLevel),
            products: detailedProducts,
        });
    })
);

module.exports = router;
