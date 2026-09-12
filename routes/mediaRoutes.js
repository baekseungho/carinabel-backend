const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const asyncHandler = require("express-async-handler");
const router = express.Router();
const root = path.resolve(process.env.MEDIA_ROOT || path.join(__dirname, "../storage/media"));
const legacyRoot = path.resolve(process.env.LEGACY_PRODUCTS_ROOT || path.join(__dirname, "../../carinabel-web/public/products"));
const sizes = [160, 640, 1200];
let pending = 0;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 0 } });
async function store(buffer) {
    const id = crypto.createHash("sha256").update(buffer).digest("hex");
    const dir = path.join(root, id);
    const meta = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1) throw new Error("JPEG, PNG, WebP 정지 이미지만 지원합니다.");
    await fs.mkdir(dir, { recursive: true });
    for (const width of sizes) {
        const target = path.join(dir, `${width}.webp`);
        try { await fs.access(target); } catch {
            const encoded = await sharp(buffer, { limitInputPixels: 40000000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
            await fs.writeFile(target, encoded);
        }
    }
    return { imagePath: `/api/media/${id}/1200.webp`, thumbnail: `/api/media/${id}/160.webp` };
}
router.post("/", protect, adminOnly, (req, res, next) => {
    if (pending >= 2) return res.status(429).json({ message: "이미지 처리 중입니다. 잠시 후 다시 시도해 주세요." });
    pending++;
    res.once("close", () => pending--);
    upload.single("image")(req, res, error => {
        if (error) return res.status(400).json({ message: "이미지는 한 장씩, 12MB 이하로 올려 주세요." });
        next();
    });
}, asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "이미지를 선택해 주세요." });
    try { res.status(201).json(await store(req.file.buffer)); }
    catch { res.status(400).json({ message: "이미지를 처리하지 못했습니다. JPEG·PNG·WebP, 최대 4천만 화소를 지원합니다." }); }
}));
// Existing local product images are resized on demand and then served from cache.
router.get("/legacy", asyncHandler(async (req, res) => {
    const relative = req.query.path;
    if (typeof relative !== "string" || !relative.startsWith("/products/")) return res.sendStatus(400);
    const file = path.resolve(legacyRoot, relative.slice(10));
    if (!file.startsWith(legacyRoot + path.sep) || !/\.(png|jpe?g|webp)$/i.test(file)) return res.sendStatus(400);
    const width = sizes.includes(Number(req.query.width)) ? Number(req.query.width) : 640;
    if (pending >= 2) return res.sendStatus(429);
    pending++;
    try {
        const stat = await fs.stat(file);
        if (stat.size > 12 * 1024 * 1024) return res.sendStatus(413);
        const result = await store(await fs.readFile(file));
        res.redirect(302, result.imagePath.replace("1200.webp", `${width}.webp`));
    } catch { res.sendStatus(404); } finally { pending--; }
}));
router.get("/:id/:variant", (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.id) || !/^(160|640|1200)\.webp$/.test(req.params.variant)) return res.sendStatus(404);
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.sendFile(path.join(root, req.params.id, req.params.variant), { maxAge: "1y", immutable: true }, error => { if (error && !res.headersSent) res.sendStatus(404); });
});
module.exports = router;
