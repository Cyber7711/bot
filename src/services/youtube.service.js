const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 🛠 MAXSUS XATO YOZUVCHI FUNKSIYA ---
// Bu loglarda xatoni chiroyli va tushunarli qilib ko'rsatib beradi
const logError = (context, error) => {
  console.error(`\n❌ [YouTube Service - ${context}] Xatolik yuz berdi!`);
  console.error(`👉 Sabab: ${error.message}`);
  if (error.statusCode) console.error(`📡 Status Code: ${error.statusCode}`);
  console.error(`--------------------------------------------------\n`);
};

const getVideoInfo = async (url) => {
  try {
    console.log(`🔍 Ma'lumot qidirilmoqda: ${url}`);
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;

    return {
      id: details.videoId,
      title: details.title,
      author: details.author.name,
      duration: parseInt(details.lengthSeconds) || 0,
      // Ba'zida video rasmsiz bo'lishi mumkin, shuning uchun xavfsizlik tekshiruvi (fallback)
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
    console.log(`🎬 Video oqimi (stream) tayyorlanmoqda: ${url}`);

    const stream = ytdl(url, {
      filter: "audioandvideo",
      // highestvideo o'rniga highest ishlatamiz, chunki ba'zida highestvideo ovozsiz bo'lib qoladi
      quality: "highest",
      highWaterMark: 1 << 25, // 32 MB buffer (kattaroq videolar uchun yaxshi)
    });

    // Eng muhimi: Oqim (stream) yuklanayotganda uzilib qolsa xatoni ushlash
    stream.on("error", (err) => {
      logError("getYouTubeStream (Stream uzildi)", err);
    });

    return stream;
  } catch (error) {
    logError("getYouTubeStream (Boshlashda xato)", error);
    throw error; // Telegram handler xabardor bo'lishi uchun xatoni yuqoriga uzatamiz
  }
};

const downloadAudio = async (url, videoId) => {
  const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);

  return new Promise((resolve, reject) => {
    try {
      console.log(`🎵 Audio yuklash boshlandi: ${url}`);

      const stream = ytdl(url, {
        filter: "audioonly",
        quality: "highestaudio",
      });
      const writer = fs.createWriteStream(filePath);

      stream.pipe(writer);

      // 1. YouTube'dan kelayotgan ma'lumot uzilsa
      stream.on("error", (err) => {
        logError("downloadAudio (YouTube Stream xatosi)", err);
        reject(err);
      });

      // 2. Server xotirasiga yozishda xato bo'lsa (masalan joy qolmasa)
      writer.on("error", (err) => {
        logError("downloadAudio (Faylga yozish xatosi)", err);
        reject(err);
      });

      // 3. Muvaffaqiyatli yakunlansa
      writer.on("finish", () => {
        console.log(`✅ Audio muvaffaqiyatli saqlandi: ${filePath}`);
        resolve(filePath);
      });
    } catch (error) {
      logError("downloadAudio (Asosiy xato)", error);
      reject(error);
    }
  });
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
};
