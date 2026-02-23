const { Telegraf, Markup } = require("telegraf");
const { HttpsProxyAgent } = require("https-proxy-agent");
const mongoose = require("mongoose");
const config = require("./config");
const youtubeService = require("./services/youtube.service");
const User = require("./models/User");
const fs = require("fs");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is running...");
});

app.listen(PORT, () => {
  console.log(`Web server is running on port ${PORT}`);
});

// --- 1. KESH VA NAVBAT TIZIMI ---
const statsCache = { users: new Map(), downloads: new Map() };
const activeTasks = new Set();

// --- 2. SOZLAMALAR ---
if (!config.token) {
  console.error("🚨 XATO: BOT_TOKEN topilmadi!");
  process.exit(1);
}

const botOptions = {};
if (config.proxy) {
  botOptions.telegram = { agent: new HttpsProxyAgent(config.proxy) };
}

const bot = new Telegraf(config.token, botOptions);

// --- 3. DATABASEGA ULANISH ---
mongoose
  .connect(config.dbUri) // config ichidagi yangi dbUri ishlatiladi
  .then(() => console.log("✅ MongoDB Atlas (Cloud) ulandi!"))
  .catch((err) => console.error("❌ Baza xatosi:", err));

// --- 4. YORDAMCHI FUNKSIYALAR ---
const mainMenu = Markup.keyboard([["📊 Statistikam", "📚 Yordam"]]).resize();

function logToCache(ctx, isDownload = false) {
  const { id, first_name, username } = ctx.from;
  statsCache.users.set(id, {
    telegramId: id,
    firstName: first_name,
    username: username,
    lastActiveAt: new Date(),
  });
  if (isDownload) {
    const current = statsCache.downloads.get(id) || 0;
    statsCache.downloads.set(id, current + 1);
  }
}

function formatTime(seconds) {
  if (!seconds) return "Noma'lum";
  return new Date(seconds * 1000)
    .toISOString()
    .slice(11, 19)
    .replace(/^00:/, "");
}

setInterval(
  async () => {
    if (statsCache.users.size === 0 && statsCache.downloads.size === 0) return;
    const bulkOps = [];
    statsCache.users.forEach((data, id) => {
      bulkOps.push({
        updateOne: {
          filter: { telegramId: id },
          update: { $set: data },
          upsert: true,
        },
      });
    });
    statsCache.downloads.forEach((count, id) => {
      bulkOps.push({
        updateOne: {
          filter: { telegramId: id },
          update: { $inc: { downloadCount: count } },
        },
      });
    });
    try {
      await User.bulkWrite(bulkOps);
      statsCache.users.clear();
      statsCache.downloads.clear();
    } catch (err) {}
  },
  5 * 60 * 1000,
);

// --- 5. KOMANDALAR (ENG TEPADA BO'LISHI KERAK) ---
bot.start(async (ctx) => {
  logToCache(ctx);
  await ctx.reply(
    `👋 <b>Salom, ${ctx.from.first_name}!</b>\n\n🎬 YouTube linkini yuboring va Video yoki Audio formatini tanlang!`,
    { parse_mode: "HTML", ...mainMenu },
  );
});

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== config.adminId) return;
  await ctx.reply(
    "👨‍💻 <b>Admin Panel</b>\n/send - Reklama tarqatish\n/stats - Baza statistikasi",
    { parse_mode: "HTML" },
  );
});

bot.command("stats", async (ctx) => {
  if (ctx.from.id !== config.adminId) return;
  const total = await User.countDocuments();
  const totalDownloads = await User.aggregate([
    { $group: { _id: null, sum: { $sum: "$downloadCount" } } },
  ]);
  ctx.reply(
    `📊 Jami a'zolar: ${total}\n📥 Jami yuklashlar: ${totalDownloads[0]?.sum || 0}`,
  );
});

bot.command("send", async (ctx) => {
  if (ctx.from.id !== config.adminId) return;
  await ctx.reply(
    "📢 <b>Reklama yuborish rejimi:</b>\n\n" +
      "Xabarni yuboring (rasm, video, matn). Bekor qilish uchun /cancel",
    { parse_mode: "HTML" },
  );
  activeTasks.add("mailing_" + ctx.from.id);
});

bot.hears("📊 Statistikam", async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const totalUsers = await User.countDocuments();
  const mau = await User.countDocuments({
    lastActiveAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });
  await ctx.reply(
    `👤 Siz: ${user ? user.downloadCount : 0} ta | 📈 Bot: ${totalUsers} a'zo`,
    { parse_mode: "HTML" },
  );
});

bot.hears("📚 Yordam", (ctx) =>
  ctx.reply("YouTube link yuboring ➡️ Tanlang ➡️ Yuklang!", {
    parse_mode: "HTML",
  }),
);

// --- 6. REKLAMA TARQATISH HANDLERI (Linklardan oldin bo'lishi kerak) ---
bot.on(["message", "photo", "video", "audio"], async (ctx, next) => {
  if (!activeTasks.has("mailing_" + ctx.from.id)) return next(); // Agar reklama rejimi bo'lmasa, keyingi handlerga (YouTube) o't

  if (ctx.message?.text === "/cancel") {
    activeTasks.delete("mailing_" + ctx.from.id);
    return ctx.reply("❌ Bekor qilindi.");
  }

  const allUsers = await User.find({}, "telegramId");
  let success = 0;
  ctx.reply(`🚀 Tarqatilmoqda... (Jami: ${allUsers.length})`);

  for (const user of allUsers) {
    try {
      await ctx.telegram.copyMessage(
        user.telegramId,
        ctx.chat.id,
        ctx.message.message_id,
      );
      success++;
    } catch (e) {}
  }

  activeTasks.delete("mailing_" + ctx.from.id);
  ctx.reply(`✅ Tugadi! ${success} kishiga yetib bordi.`);
});

// --- 7. INLINE QIDIRUV ---
bot.on("inline_query", async (ctx) => {
  const query = ctx.inlineQuery.query;
  if (!query || query.length < 3) return ctx.answerInlineQuery([]);
  try {
    const searchResults = await youtubeService.searchVideos(query);
    const results = searchResults.map((v) => ({
      type: "article",
      id: v.id,
      title: v.title,
      description: `👤 ${v.author} | ⏱ ${v.duration}`,
      thumb_url: v.thumbnail,
      input_message_content: {
        message_text: `https://www.youtube.com/watch?v=${v.id}`,
      },
    }));
    await ctx.answerInlineQuery(results, { cache_time: 300 });
  } catch (e) {}
});

// --- 8. YOUTUBE LINK QABUL QILISH (ENG OXIRIDA) ---
bot.on("text", async (ctx) => {
  const url = ctx.message.text;
  if (!youtubeService.isValidYouTubeUrl(url)) {
    if (!url.startsWith("/"))
      return ctx.reply("⚠️ Faqat YouTube linkini yuboring.");
    return;
  }

  if (activeTasks.has(ctx.from.id))
    return ctx.reply("⏳ Kuting, avvalgisi bajarilmoqda...");

  activeTasks.add(ctx.from.id);
  let statusMsg = await ctx.reply("🔍 <i>Tahlil qilinmoqda...</i>", {
    parse_mode: "HTML",
  });

  try {
    const info = await youtubeService.getVideoInfo(url);
    if (!info)
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        "❌ Topilmadi.",
      );

    await ctx.replyWithPhoto(info.thumbnail, {
      caption: `🎬 <b>${info.title}</b>\n⏱ ${formatTime(info.duration)}\n\nSifatni tanlang:`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎬 360p", callback_data: `vid_360_${info.id}` },
            { text: "🎬 720p", callback_data: `vid_720_${info.id}` },
          ],
          [{ text: "🎵 Audio (M4A)", callback_data: `aud_${info.id}` }],
        ],
      },
    });
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
  } catch (error) {
    ctx.reply("❌ Xatolik.");
  } finally {
    activeTasks.delete(ctx.from.id);
  }
});

// --- 9. TUGMALAR (ACTION) ---
bot.action(/^vid_(360|720)_(.+)/, async (ctx) => {
  if (activeTasks.has(ctx.from.id))
    return ctx.answerCbQuery("⏳ Kuting!", { show_alert: true });
  const quality = ctx.match[1];
  const videoId = ctx.match[2];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  activeTasks.add(ctx.from.id);
  await ctx.answerCbQuery(`${quality}p yuklanmoqda...`);
  await ctx.editMessageCaption(`📥 <b>Video yuklanmoqda...</b>`, {
    parse_mode: "HTML",
  });

  try {
    const stream = youtubeService.getYouTubeStream(url);
    const info = await youtubeService.getVideoInfo(url);
    await ctx.replyWithVideo(
      { source: stream },
      {
        caption: `🎬 ${info.title}\n🤖 @${ctx.botInfo.username}`,
        parse_mode: "HTML",
      },
    );
    logToCache(ctx, true);
    await ctx.deleteMessage().catch(() => {});
  } catch (e) {
    ctx.reply("❌ Xato.");
  } finally {
    activeTasks.delete(ctx.from.id);
  }
});

bot.action(/^aud_(.+)/, async (ctx) => {
  if (activeTasks.has(ctx.from.id))
    return ctx.answerCbQuery("⏳ Kuting!", { show_alert: true });
  const videoId = ctx.match[1];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  activeTasks.add(ctx.from.id);
  await ctx.answerCbQuery("Audio tayyorlanmoqda...");
  try {
    const info = await youtubeService.getVideoInfo(url);
    const filePath = await youtubeService.downloadAudio(url, videoId);
    await ctx.replyWithAudio(
      { source: filePath, filename: `${info.title}.m4a` },
      {
        title: info.title,
        performer: info.author,
        thumb: { url: info.thumbnail },
      },
    );
    logToCache(ctx, true);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await ctx.deleteMessage().catch(() => {});
  } catch (e) {
    ctx.reply("❌ Xato.");
  } finally {
    activeTasks.delete(ctx.from.id);
  }
});

// Global Xato ushlagich
bot.catch(async (err, ctx) => {
  try {
    await ctx.telegram.sendMessage(config.adminId, `🚨 Xato: ${err.message}`);
  } catch (e) {}
});

bot.launch().then(() => console.log("🚀 BOT ISHLADI!"));
