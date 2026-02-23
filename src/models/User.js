const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  firstName: String,
  username: String,
  downloadCount: { type: Number, default: 0 }, // Yuklagan videolari soni
  lastActiveAt: { type: Date, default: Date.now }, // Oxirgi kirgan vaqti
  joinedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
