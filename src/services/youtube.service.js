const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 🛠 MAXSUS XATO YOZUVCHI FUNKSIYA ---
const logError = (context, error) => {
  console.error(`\n❌ [YouTube Service - ${context}] Xatolik yuz berdi!`);
  console.error(`👉 Sabab: ${error.message}`);
  if (error.statusCode) console.error(`📡 Status Code: ${error.statusCode}`);
  console.error(`--------------------------------------------------\n`);
};

// --- 🛡 YOUTUBE BLOKLARINI AYLANIB O'TISH ---
const agent = ytdl.createAgent();
const antiBlockOptions = {
  agent,
  // YouTube'ni aldash: Web brauzer emas, faqat mobil ilovalar orqali ma'lumot so'raymiz
  playerClients: ["ANDROID", "IOS", "WEB_EMBEDDED"],
  requestOptions: {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    },
  },
};

const getVideoInfo = async (url) => {
  try {
    console.log(`🔍 Ma'lumot qidirilmoqda (Mobil Niqob bilan): ${url}`);

    // antiBlockOptions ni qo'shamiz
    const info = await ytdl.getInfo(url, antiBlockOptions);
    const details = info.videoDetails;

    return {
      id: details.videoId,
      title: details.title,
      author: details.author.name,
      duration: parseInt(details.lengthSeconds) || 0,
      thumbnail:
        details.thumbnails && details.thumbnails.length > 0
          ? details.thumbnails[details.thumbnails.length - 1].url
          : "https://via.placeholder.com/640x360.png?text=No+Thumbnail",
      url: details.video_url,
    };
  } catch (error) {
    logError("getVideoInfo", error);
    return null;
  }
};

const getYouTubeStream = (url) => {
  try {
    console.log(`🎬 Video stream tayyorlanmoqda...`);

    const stream = ytdl(url, {
      ...antiBlockOptions,
      filter: "audioandvideo",
      quality: "highest",
      highWaterMark: 1 << 25, // 32 MB buffer
    });

    stream.on("error", (err) => logError("getYouTubeStream (Uzildi)", err));
    return stream;
  } catch (error) {
    logError("getYouTubeStream (Boshlashda xato)", error);
    throw error;
  }
};

const downloadAudio = async (url, videoId) => {
  const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);

  return new Promise((resolve, reject) => {
    try {
      console.log(`🎵 Audio yuklanmoqda...`);

      const stream = ytdl(url, {
        ...antiBlockOptions,
        filter: "audioonly",
        quality: "highestaudio",
      });
      const writer = fs.createWriteStream(filePath);

      stream.pipe(writer);

      stream.on("error", (err) => {
        logError("downloadAudio (YouTube xatosi)", err);
        reject(err);
      });

      writer.on("error", (err) => {
        logError("downloadAudio (Faylga yozish xatosi)", err);
        reject(err);
      });

      writer.on("finish", () => {
        console.log(`✅ Audio tayyor: ${filePath}`);
        resolve(filePath);
      });
    } catch (error) {
      logError("downloadAudio (Asosiy xato)", error);
      reject(error);
    }
  });
};

// Inline qidiruv buzilmasligi uchun bo'sh (dummy) funksiya
const searchVideos = async (query) => {
  return []; // ytdl-core faqat link bilan ishlaydi
};

const isValidYouTubeUrl = (url) => {
  try {
    return ytdl.validateURL(url);
  } catch (error) {
    return false;
  }
};

module.exports = {
  getYouTubeStream,
  downloadAudio,
  isValidYouTubeUrl,
  getVideoInfo,
  searchVideos,
};
