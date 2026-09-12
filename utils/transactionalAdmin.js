const mongoose = require("mongoose");
const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const Operation = require("../models/AdminOperation");

const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
};

module.exports = handler => asyncHandler(async (req, res) => {
    const key = req.get("Idempotency-Key");
    if (!key || !/^[a-zA-Z0-9-]{16,100}$/.test(key)) {
        return res.status(400).json({ message: "요청 식별자가 필요합니다. 화면을 새로고침 후 다시 시도해 주세요." });
    }
    const id = digest(`${req.user.id}:${req.path}:${key}`);
    const fingerprint = digest(JSON.stringify(canonical(req.body)));
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const existing = await Operation.findById(id).session(session);
            if (existing) {
                if (existing.fingerprint !== fingerprint) throw Object.assign(new Error("동일한 요청 식별자의 내용이 변경되었습니다."), { status: 409 });
                result = existing;
                return;
            }
            await Operation.create([{ _id: id, fingerprint }], { session });
            let status = 200;
            let response;
            const reply = {
                status(code) { status = code; return reply; },
                json(body) {
                    if (status >= 400) throw Object.assign(new Error(body.message), { status });
                    response = body;
                    return reply;
                },
            };
            await handler(req, reply, session);
            if (response === undefined) throw new Error("Operation did not produce a response");
            await Operation.updateOne({ _id: id }, { $set: { status, response } }, { session });
            result = { status, response };
        });
        res.status(result.status).json(result.response);
    } catch (error) {
        if (error.code === 11000) {
            const existing = await Operation.findById(id);
            if (existing?.response && existing.fingerprint === fingerprint) return res.status(existing.status).json(existing.response);
            return res.status(409).json({ message: "동일 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요." });
        }
        if (error.code === 20 || error.codeName === "IllegalOperation") {
            return res.status(503).json({ message: "안전한 처리를 위해 MongoDB replica set 설정이 필요합니다. 서버 관리자에게 문의해 주세요." });
        }
        if (error.status) return res.status(error.status).json({ message: error.message });
        throw error;
    } finally {
        await session.endSession();
    }
});
