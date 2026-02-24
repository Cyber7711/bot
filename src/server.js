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

// --- 0. WEB SERVER (Bot uxlab qolmasligi uchun) ---
app.get("/", (req, res) => res.send("Bot is completely ALIVE and RUNNING! 🚀"));
app.listen(PORT, () => console.log(`🌍 Web server is running on port ${PORT}`));

// --- 1. KESH, NAVBAT VA SOZLAMALAR ---
const statsCache = { users: new Map(), downloads: new Map() };
const activeTasks = new Set();
const REQUIRED_CHANNEL = "@EchoesOfPeace_1"; // To'g'ri format; // 🔴 SHU YERGA KANALINGIZ YUZERINI YOZING! (masalan: @my_channel)

if (!config.token) {
  console.error("🚨 XATO: BOT_TOKEN topilmadi!");
  process.exit(1);
}

const botOptions = {};
if (config.proxy)
  botOptions.telegram = { agent: new HttpsProxyAgent(config.proxy) };
const bot = new Telegraf(config.token, botOptions);

// --- 2. DATABASEGA ULANISH ---
mongoose
  .connect(config.dbUri)
  .then(() => console.log("✅ MongoDB Atlas (Cloud) ulandi!"))
  .catch((err) => console.error("❌ Baza xatosi:", err));

// --- 3. YORDAMCHI FUNKSIYALAR ---
const mainMenu = Markup.keyboard([["📊 Statistikam", "📚 Yordam"]]).resize();

function logToCache(ctx, isDownload = false) {
  if (!ctx.from) return;
  const { id, first_name, username } = ctx.from;
  statsCache.users.set(id, {
    telegramId: id,
    firstName: first_name,
    username,
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

// Bazani har 5 daqiqada yangilash
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

// --- 🌟 4. MAJBURIY OBUNA (MIDDLEWARE) ---
const checkSubscription = async (ctx, next) => {
  if (ctx.from.id === config.adminId) return next(); // Admin tekshiruvdan ozod
  if (!REQUIRED_CHANNEL || REQUIRED_CHANNEL === "@sizning_kanalingiz")
    return next(); // Kanal sozlanmagan bo'lsa

  try {
    const member = await ctx.telegram.getChatMember(
      REQUIRED_CHANNEL,
      ctx.from.id,
    );
    if (member.status === "left" || member.status === "kicked") {
      return ctx.reply(
        `🛑 <b>Botdan foydalanish uchun kanalimizga obuna bo'lishingiz kerak!</b>\n\nIltimos, pastdagi tugma orqali kanalga a'zo bo'ling va qidiruvni davom ettiring.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📢 Kanalga a'zo bo'lish",
                  url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`,
                },
              ],
              [{ text: "✅ Obunani tekshirish", callback_data: "check_sub" }],
            ],
          },
        },
      );
    }
    return next();
  } catch (error) {
    // Agar bot kanalga admin bo'lmasa, xato beradi va foydalanuvchini o'tkazib yuboradi
    return next();
  }
};

bot.action("check_sub", async (ctx) => {
  try {
    const member = await ctx.telegram.getChatMember(
      REQUIRED_CHANNEL,
      ctx.from.id,
    );
    if (member.status === "left" || member.status === "kicked") {
      return ctx.answerCbQuery(
        "❌ Hali obuna bo'lmapsiz! Iltimos obuna bo'ling.",
        { show_alert: true },
      );
    }
    await ctx.answerCbQuery("✅ Rahmat! Endi botdan foydalanishingiz mumkin.", {
      show_alert: true,
    });
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(
      "👋 Yana bir bor salom! Qanday video yoki audio yuklab olamiz?",
      mainMenu,
    );
  } catch (e) {
    ctx.answerCbQuery("⚠️ Xatolik yuz berdi.", { show_alert: true });
  }
});

// Barcha xabarlarga "Majburiy obuna" tekshiruvini ulaymiz
bot.use(checkSubscription);

// --- 5. ASOSIY KOMANDALAR ---
bot.start(async (ctx) => {
  logToCache(ctx);
  await ctx.reply(
    `👋 <b>Salom, ${ctx.from.first_name}!</b>\n\n🎬 Men YouTube'dan eng yuqori sifatda <b>Video</b> va <b>Audio</b> yuklab beruvchi aqlli botman.\n\n👇 Menga istalgan YouTube yoki Shorts linkini yuboring!`,
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
  const downloads = await User.aggregate([
    { $group: { _id: null, sum: { $sum: "$downloadCount" } } },
  ]);
  ctx.reply(
    `📊 Jami a'zolar: <b>${total}</b>\n📥 Jami yuklashlar: <b>${downloads[0]?.sum || 0}</b>`,
    { parse_mode: "HTML" },
  );
});

bot.command("send", async (ctx) => {
  if (ctx.from.id !== config.adminId) return;
  await ctx.reply(
    "📢 <b>Reklama rejimi:</b>\nXabarni yuboring (rasm, video, matn). Bekor qilish: /cancel",
    { parse_mode: "HTML" },
  );
  activeTasks.add("mailing_" + ctx.from.id);
});

bot.hears("📊 Statistikam", async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  await ctx.reply(
    `👤 Sizning yuklashlaringiz: <b>${user ? user.downloadCount : 0} ta</b>`,
    { parse_mode: "HTML" },
  );
});

bot.hears("📚 Yordam", (ctx) =>
  ctx.reply("💡 Link yuboring ➡️ Format tanlang ➡️ Yuklab oling!", {
    parse_mode: "HTML",
  }),
);

// --- 6. REKLAMA (BROADCAST) ---
bot.on(
  ["message", "photo", "video", "audio", "document"],
  async (ctx, next) => {
    if (!activeTasks.has("mailing_" + ctx.from.id)) return next();

    if (ctx.message?.text === "/cancel") {
      activeTasks.delete("mailing_" + ctx.from.id);
      return ctx.reply("❌ Reklama bekor qilindi.");
    }

    const allUsers = await User.find({}, "telegramId");
    let success = 0;
    const msg = await ctx.reply(`🚀 Tarqatilmoqda... (0/${allUsers.length})`);

    for (const user of allUsers) {
      try {
        await ctx.telegram.copyMessage(
          user.telegramId,
          ctx.chat.id,
          ctx.message.message_id,
        );
        success++;
      } catch (e) {}
      if (success % 50 === 0)
        await ctx.telegram
          .editMessageText(
            ctx.chat.id,
            msg.message_id,
            null,
            `🚀 Tarqatilmoqda... (${success}/${allUsers.length})`,
          )
          .catch(() => {});
    }

    activeTasks.delete("mailing_" + ctx.from.id);
    ctx.reply(`✅ Tarqatish tugadi! Yetib bordi: <b>${success}</b>`, {
      parse_mode: "HTML",
    });
  },
);

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

// --- 8. YOUTUBE LINK QABUL QILISH ---
bot.on("text", async (ctx) => {
  const url = ctx.message.text;
  if (!youtubeService.isValidYouTubeUrl(url)) return;

  if (activeTasks.has(ctx.from.id))
    return ctx.reply(
      "⏳ <b>Iltimos kuting</b>, oldingi jarayon yakunlanmoqda...",
      { parse_mode: "HTML" },
    );

  activeTasks.add(ctx.from.id);
  let statusMsg = await ctx.reply("🔍 <i>Video tahlil qilinmoqda...</i>", {
    parse_mode: "HTML",
  });

  try {
    const info = await youtubeService.getVideoInfo(url);
    if (!info)
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        "❌ Video yopiq yoki topilmadi.",
      );

    await ctx.replyWithPhoto(info.thumbnail, {
      caption: `🎬 <b>${info.title}</b>\n👤 <b>Kanal:</b> ${info.author}\n⏱ <b>Vaqti:</b> ${formatTime(info.duration)}\n\n👇 <i>Kerakli formatni tanlang:</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎬 Video (Kichik)", callback_data: `vid_360_${info.id}` },
            { text: "🎬 Video (HD)", callback_data: `vid_720_${info.id}` },
          ],
          [
            {
              text: "🎵 Audio formatida (M4A)",
              callback_data: `aud_${info.id}`,
            },
          ],
        ],
      },
    });
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
  } catch (error) {
    ctx.reply("❌ Xatolik yuz berdi.");
  } finally {
    activeTasks.delete(ctx.from.id);
  }
});

// --- 9. TUGMALAR (VIDEO YUKLASH) ---
bot.action(/^vid_(360|720)_(.+)/, async (ctx) => {
  if (activeTasks.has(ctx.from.id))
    return ctx.answerCbQuery("⏳ Kuting!", { show_alert: true });
  const quality = ctx.match[1];
  const videoId = ctx.match[2];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  activeTasks.add(ctx.from.id);
  await ctx.answerCbQuery(`Video yuklanmoqda...`);
  await ctx.editMessageCaption(
    `📥 <b>Video yuklanmoqda (${quality}p)...</b>\nIltimos, biroz kuting ⏳`,
    { parse_mode: "HTML" },
  );

  try {
    const stream = youtubeService.getYouTubeStream(url);
    const info = await youtubeService.getVideoInfo(url);

    await ctx.replyWithVideo(
      { source: stream },
      {
        caption: `🎬 <b>${info.title}</b>\n🤖 @${ctx.botInfo.username}`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⤴️ Do'stlarga ulashish",
                url: `https://t.me/share/url?url=Ushbu%20botni%20sinab%20ko'ring:%20@${ctx.botInfo.username}`,
              },
            ],
          ],
        },
      },
    );
    logToCache(ctx, true);
    await ctx.deleteMessage().catch(() => {});
  } catch (e) {
    ctx.reply(
      "❌ Videoni yuklab bo'lmadi (Hajmi 50MB dan katta bo'lishi mumkin).",
    );
  } finally {
    activeTasks.delete(ctx.from.id);
  }
});

// --- 10. TUGMALAR (AUDIO YUKLASH - PRO METADATA) ---
bot.action(/^aud_(.+)/, async (ctx) => {
  if (activeTasks.has(ctx.from.id))
    return ctx.answerCbQuery("⏳ Kuting!", { show_alert: true });
  const videoId = ctx.match[1];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  activeTasks.add(ctx.from.id);
  await ctx.answerCbQuery("Audio tayyorlanmoqda...");
  await ctx.editMessageCaption(
    `🎵 <b>Audio yuklanmoqda...</b>\nIltimos, biroz kuting ⏳`,
    { parse_mode: "HTML" },
  );

  try {
    const info = await youtubeService.getVideoInfo(url);
    const filePath = await youtubeService.downloadAudio(url, videoId);

    // 🔥 PRO AUDIO METADATA
    await ctx.replyWithAudio(
      { source: filePath, filename: `${info.title}.m4a` },
      {
        title: info.title, // Qo'shiq nomi pleyerda chiqadi
        performer: info.author, // Ijrochi pleyerda chiqadi
        duration: info.duration, // Vaqti
        thumb: { url: info.thumbnail }, // Rasm pleyerda chiqadi
        caption: `🎵 <b>${info.title}</b>\n\n🤖 @${ctx.botInfo.username}`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎧 Do'stlarga ulashish",
                url: `https://t.me/share/url?url=Musiqa%20ko'chirish%20uchun%20zo'r%20bot:%20@${ctx.botInfo.username}`,
              },
            ],
          ],
        },
      },
    );
    logToCache(ctx, true);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await ctx.deleteMessage().catch(() => {});
  } catch (e) {
    ctx.reply("❌ Audioni yuklab bo'lmadi.");
  } finally {
    activeTasks.delete(ctx.from.id);
  }
});

// Global Xato ushlagich (Spamlardan himoya)
bot.catch(async (err, ctx) => {
  console.log(`Error: ${err.message}`);
  // Xatolik bersa ham navbatdan o'chirib yuboramiz, tok user qotib qolmasin
  if (ctx && ctx.from) activeTasks.delete(ctx.from.id);
});

// QOTIB QOLGAN XABARLARNI TOZALAB YOQISH
bot
  .launch({ dropPendingUpdates: true })
  .then(() => console.log("🚀 BOT TELEGRAMGA MUVAFFAQIYATLI ULANDI!"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
