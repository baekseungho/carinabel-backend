const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const User = require("../models/User");
const calculateDiscountedPrice = require("../utils/calculateDiscount");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

// 🔄 모든 상품 조회 (회원 등급 할인 적용)
router.get(
    "/",
    asyncHandler(async (req, res) => {
        let membershipLevel = "일반회원";

        // 🔑 회원 등급 확인
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (user) {
                    membershipLevel = user.membershipLevel;
                }
            } catch (error) {
                console.error("회원 정보 로드 실패:", error);
            }
        }

        const products = await Product.find({});

        // 🔄 회원 등급별 할인 적용
        const discountedProducts = products.map((product) => ({
            ...product.toObject(),
            memberPrice: calculateDiscountedPrice(product.consumerPrice, membershipLevel),
        }));

        res.json(discountedProducts);
    })
);

// 🔄 단일 상품 조회 (회원 등급 할인 적용)
router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        let membershipLevel = "일반회원";

        // 🔑 회원 등급 확인
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (user) {
                    membershipLevel = user.membershipLevel;
                }
            } catch (error) {
                console.error("회원 정보 로드 실패:", error);
            }
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        // 🔄 회원 등급별 할인 적용
        const discountedProduct = {
            ...product.toObject(),
            memberPrice: calculateDiscountedPrice(product.consumerPrice, membershipLevel),
        };

        res.json(discountedProduct);
    })
);

// ➕ 상품 등록
router.post(
    "/add",
    asyncHandler(async (req, res) => {
        const { category, productName, koreanName, volume, consumerPrice, imagePath, detailImage, membershipLevel } =
            req.body;

        const product = new Product({
            category,
            productName,
            koreanName,
            volume,
            consumerPrice,
            memberPrice: calculateDiscountedPrice(consumerPrice, membershipLevel || "일반회원"),
            imagePath: imagePath || "/img/defalut_product.png",
            detailImage: detailImage || "/img/defalut_product.png",
        });

        await product.save();

        res.json({
            message: "상품이 성공적으로 등록되었습니다.",
            product,
        });
    })
);

// ✏️ 상품 수정
router.put(
    "/update/:id",
    asyncHandler(async (req, res) => {
        const { category, productName, koreanName, volume, consumerPrice, membershipLevel } = req.body;

        const product = await Product.findById(req.params.id);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        product.category = category || product.category;
        product.productName = productName || product.productName;
        product.koreanName = koreanName || product.koreanName;
        product.volume = volume || product.volume;
        product.consumerPrice = consumerPrice || product.consumerPrice;
        product.memberPrice = calculateDiscountedPrice(
            consumerPrice || product.consumerPrice,
            membershipLevel || "일반회원"
        );

        await product.save();

        res.json({
            message: "상품이 성공적으로 수정되었습니다.",
            product,
        });
    })
);

// 🗑️ 상품 삭제
router.delete(
    "/delete/:id",
    asyncHandler(async (req, res) => {
        const product = await Product.findById(req.params.id);
        if (!product) {
            res.status(404).json({ message: "상품을 찾을 수 없습니다." });
            return;
        }

        await product.deleteOne();
        res.json({ message: "상품이 성공적으로 삭제되었습니다." });
    })
);

module.exports = router;
