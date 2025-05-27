// routes/addressRoutes.js
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const Address = require("../models/Address");
const { protect } = require("../middleware/authMiddleware");

// 🔍 주소 목록 조회
router.get(
    "/",
    protect,
    asyncHandler(async (req, res) => {
        const addresses = await Address.find({ userId: req.user.id }).sort({
            isDefault: -1,
            createdAt: -1,
        });
        res.json(addresses);
    })
);

// ➕ 주소 추가
router.post(
    "/",
    protect,
    asyncHandler(async (req, res) => {
        const { recipientName, phone, mobile, address, isDefault } = req.body;

        if (isDefault) {
            // 기존 기본 주소 해제
            await Address.updateMany(
                { userId: req.user.id },
                { isDefault: false }
            );
        }

        const newAddress = await Address.create({
            userId: req.user.id,
            recipientName,
            phone,
            mobile,
            address,
            isDefault,
        });

        res.status(201).json(newAddress);
    })
);

// ✏️ 주소 수정
router.put(
    "/:id",
    protect,
    asyncHandler(async (req, res) => {
        const { recipientName, phone, mobile, address, isDefault } = req.body;
        const addressEntry = await Address.findOne({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!addressEntry) {
            res.status(404).json({ message: "주소를 찾을 수 없습니다." });
            return;
        }

        if (isDefault) {
            await Address.updateMany(
                { userId: req.user.id },
                { isDefault: false }
            );
        }

        addressEntry.recipientName = recipientName;
        addressEntry.phone = phone;
        addressEntry.mobile = mobile;
        addressEntry.address = address;
        addressEntry.isDefault = isDefault;

        await addressEntry.save();
        res.json(addressEntry);
    })
);

// 🗑️ 주소 삭제
router.delete(
    "/:id",
    protect,
    asyncHandler(async (req, res) => {
        const address = await Address.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!address) {
            res.status(404).json({
                message: "삭제할 주소를 찾을 수 없습니다.",
            });
            return;
        }

        res.json({ message: "주소가 삭제되었습니다." });
    })
);

module.exports = router;
