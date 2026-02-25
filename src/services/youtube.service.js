const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Cobalt API - Video/Audio yuklash uchun eng barqaror server
const COBALT_API = "https://api.cobalt.tools/api/json";

// --- 🛠 MAXSUS XATO YOZUVCHI FUNKSIYA ---
const logError = (context, error) => {
  console.error(`\n❌ [YouTube Service - ${context}] Xatolik yuz berdi!`);
  console.error(`👉 Sabab: ${error.message || error}`);
  console.error(`--------------------------------------------------\n`);
};

const getVideoInfo = async (url) => {
  try {
    console.log(`🔍 Ma'lumot qidirilmoqda (OEmbed orqali): ${url}`);

    // OEmbed API - Hech qachon bloklanmaydi, "Sign in" so'ramaydi
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const { data } = await axios.get(oembedUrl);

    // URL'dan Video ID ni ajratib olish
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*vi=|.*v%3D))([\w-]{11})/,
    );
    const videoId = videoIdMatch ? videoIdMatch[1] : Date.now().toString();

    return {
      id: videoId,
      title: data.title || "YouTube Video",
      author: data.author_name || "Noma'lum",
      duration: null, // OEmbed davomiylikni bermaydi, biz buni botda yashiramiz
      thumbnail:
        data.thumbnail_url ||
        "https://via.placeholder.com/640x360.png?text=YouTube",
      url: url,
    };
  } catch (error) {
    logError("getVideoInfo", error);
    return null;
  }
};

const getYouTubeStream = async (url, quality = "720") => {
  try {
    console.log(`🎬 Cobalt orqali video yuklanmoqda... (${quality}p)`);

    const response = await axios.post(
      COBALT_API,
      {
        url: url,
        videoQuality: quality, // 360, 720, 1080 va hokazo
        filenameStyle: "basic",
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data && response.data.url) {
      return response.data.url; // Cobalt to'g'ridan-to'g'ri tayyor MP4 link beradi!
    }
    throw new Error("Cobalt serverdan URL qaytmadi.");
  } catch (error) {
    logError("getYouTubeStream", error);
    throw error;
  }
};

const downloadAudio = async (url, videoId) => {
  const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);

  try {
    console.log(`🎵 Cobalt orqali audio tayyorlanmoqda...`);

    const response = await axios.post(
      COBALT_API,
      {
        url: url,
        isAudioOnly: true,
        audioFormat: "m4a", // Telegram uchun eng yaxshi format
        filenameStyle: "basic",
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data && response.data.url) {
      console.log(`📥 Audio fayl yuklab olinmoqda...`);
      // Faylni serverga (Render) vaqtinchalik yuklab olamiz
      const audioStream = await axios.get(response.data.url, {
        responseType: "stream",
      });
      const writer = fs.createWriteStream(filePath);

      audioStream.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          console.log(`✅ Audio tayyor: ${filePath}`);
          resolve(filePath);
        });
        writer.on("error", (err) => {
          logError("downloadAudio (Faylga yozish)", err);
          reject(err);
        });
      });
    }
    throw new Error("Cobalt serverdan Audio URL qaytmadi.");
  } catch (error) {
    logError("downloadAudio", error);
    throw error;
  }
};

// Dummy search function
const searchVideos = async (query) => {
  return [];
};

const isValidYouTubeUrl = (url) => {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|shorts)\/.+$/.test(
    url,
  );
};

module.exports = {
  getYouTubeStream,
  downloadAudio,
  isValidYouTubeUrl,
  getVideoInfo,
  searchVideos,
};
