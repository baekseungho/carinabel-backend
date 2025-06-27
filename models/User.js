const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    memberId: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    },
    birthday: {
        type: Date,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
    },
    membershipLevel: {
        type: String,
        enum: ["일반회원", "회원", "대리점", "총판"],
        default: "일반회원",
    },
    totalPurchaseAmount: {
        type: Number,
        default: 0,
    },
    totalPromotionAmount: {
        type: Number,
        default: 0,
    },
    firstPurchaseDate: {
        type: Date,
        default: null,
    },
    agreedToTerms: {
        type: Boolean,
        default: false,
    },
    accountNumber: {
        type: String,
        trim: true,
        default: "",
    },
    socialSecurityNumber: {
        type: String,
        trim: true,
        default: "",
    },
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    totalReferralEarnings: {
        type: Number,
        default: 0,
    },
    paidReferralEarnings: {
        type: Number,
        default: 0,
    },
    unpaidReferralEarnings: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    bankName: {
        type: String,
        trim: true,
        default: "-",
    },
    address: {
        type: String,
        trim: true,
        default: "",
    },
});

// 비밀번호 암호화 (Pre-save Hook)
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// 비밀번호 비교 메서드
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
