const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Address = require("../models/Address");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect);

router.get("/", asyncHandler(async (req, res) => {
    res.json(await Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 }));
}));

const mutate = method => asyncHandler(async (req, res) => {
    if (method !== "POST" && !mongoose.isObjectIdOrHexString(req.params.id)) {
        return res.status(400).json({ message: "잘못된 배송지 ID입니다." });
    }
    const body = req.body || {};
    if (method !== "DELETE" && (
        ["recipientName", "mobile", "address"].some(key => typeof body[key] !== "string" || !body[key].trim() || body[key].length > 500) ||
        (body.phone !== undefined && (typeof body.phone !== "string" || body.phone.length > 50)) ||
        (body.isDefault !== undefined && typeof body.isDefault !== "boolean")
    )) return res.status(400).json({ message: "받는 분, 연락처, 주소를 확인해 주세요." });

    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            // A shared write serializes all address changes, even an empty address book.
            const locked = await User.updateOne({ _id: req.user.id }, { $inc: { addressRevision: 1 } }, { session });
            if (!locked.matchedCount) throw Object.assign(new Error("회원을 찾을 수 없습니다."), { status: 404 });
            let entry = method === "POST" ? new Address({ userId: req.user.id }) :
                await Address.findOne({ _id: req.params.id, userId: req.user.id }).session(session);
            if (!entry) throw Object.assign(new Error("배송지를 찾을 수 없습니다."), { status: 404 });
            if (method === "DELETE") {
                await entry.deleteOne({ session });
            } else {
                const wasDefault = entry.isDefault;
                for (const key of ["recipientName", "mobile", "address"]) entry[key] = body[key].trim();
                entry.phone = body.phone || "";
                entry.isDefault = body.isDefault === undefined ? Boolean(wasDefault) : body.isDefault;
                if (entry.isDefault) {
                    await Address.updateMany({ userId: req.user.id, _id: { $ne: entry._id } }, { $set: { isDefault: false } }, { session });
                }
                await entry.save({ session });
            }
            const defaultAddress = await Address.findOne({ userId: req.user.id, isDefault: true }).session(session);
            if (!defaultAddress) {
                const first = await Address.findOne({ userId: req.user.id }).sort({ createdAt: 1, _id: 1 }).session(session);
                if (first) {
                    first.isDefault = true;
                    await first.save({ session });
                    if (String(first._id) === String(entry._id)) entry = first;
                }
            }
            result = method === "DELETE" ? { message: "주소가 삭제되었습니다." } : entry.toObject();
        });
        res.status(method === "POST" ? 201 : 200).json(result);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        throw error;
    } finally { await session.endSession(); }
});
router.post("/", mutate("POST"));
router.put("/:id", mutate("PUT"));
router.delete("/:id", mutate("DELETE"));
module.exports = router;
