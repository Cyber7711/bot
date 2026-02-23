const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

module.exports = {
  token: process.env.BOT_TOKEN,
  adminId: Number(process.env.ADMIN_ID),
  // LOCALHOST o'rniga Atlas linkini qo'yamiz
  dbUri:
    process.env.MONGO_URI ||
    "mongodb+srv://USER:PAROL@cluster0.abc.mongodb.net/youtube_bot?retryWrites=true&w=majority",
  proxy: process.env.PROXY_URL || null,
};
