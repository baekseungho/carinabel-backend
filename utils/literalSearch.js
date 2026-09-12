module.exports = value => new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
