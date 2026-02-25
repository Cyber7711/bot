const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

const logError = (context, error) => {
  console.error(`\n❌ [YouTube Service - ${context}] Xatolik!`);
  console.error(`👉 Sabab: ${error.message}`);
  console.error(`--------------------------------------------------\n`);
};

// Kutish funksiyasi (API ni zo'riqtirib qoymaslik uchun)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 🌐 LOADER API (O'lmas tizim) ---
const fetchFromLoader = async (url, format) => {
  try {
    console.log(`📡 Loader API'ga so'rov ketdi... (Format: ${format})`);

    // 1-qadam: Yuklashga buyurtma berish
    const initRes = await axios.get(
      `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(url)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0",
        },
      },
    );

    if (!initRes.data || !initRes.data.id) {
      throw new Error("API linkni qabul qilmadi. Yopiq video bo'lishi mumkin.");
    }

    const taskId = initRes.data.id;
    console.log(`⏳ Tayyorlanmoqda (ID: ${taskId})... Kutamiz...`);

    // 2-qadam: Tayyor bo'lishini kutish (Polling - max 60 soniya)
    for (let i = 0; i < 30; i++) {
      await delay(2000); // 2 soniya kutib, tekshiramiz

      const progRes = await axios.get(
        `https://loader.to/ajax/progress.php?id=${taskId}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0",
          },
        },
      );

      if (
        progRes.data &&
        progRes.data.success === 1 &&
        progRes.data.download_url
      ) {
        console.log(`✅ Fayl tayyor! URL olindi.`);
        return progRes.data.download_url;
      }
    }

    throw new Error("Kutish vaqti tugadi. Video hajmi juda katta!");
  } catch (error) {
    throw error;
  }
};

// --- 1. VIDEO MA'LUMOTI (OEMBED) ---
const getVideoInfo = async (url) => {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const { data } = await axios.get(oembedUrl);
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*vi=|.*v%3D))([\w-]{11})/,
    );

    return {
      id: videoIdMatch ? videoIdMatch[1] : Date.now().toString(),
      title: data.title || "YouTube Video",
      author: data.author_name || "Noma'lum",
      thumbnail:
        data.thumbnail_url || "https://via.placeholder.com/640x360.png",
      url: url,
    };
  } catch (e) {
    return null; // Yopiq videolarda null qaytadi
  }
};

// --- 2. AUDIO YUKLASH ---
const downloadAudio = async (url, videoId) => {
  const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);
  try {
    console.log(`🎵 Audio jarayoni boshlandi...`);

    // Loader API da audio formati uchun "m4a" so'raymiz
    const downloadUrl = await fetchFromLoader(url, "m4a");

    console.log(`📥 Fayl serverga saqlanmoqda...`);
    const audioStream = await axios.get(downloadUrl, {
      responseType: "stream",
      timeout: 60000, // 60 soniya vaqt beramiz
    });

    const writer = fs.createWriteStream(filePath);
    audioStream.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log(`✅ Audio muvaffaqiyatli saqlandi!`);
        resolve(filePath);
      });
      writer.on("error", reject);
    });
  } catch (error) {
    logError("downloadAudio", error);
    throw error;
  }
};

// --- 3. VIDEO YUKLASH ---
const getYouTubeStream = async (url, quality = "720") => {
  try {
    // Loader API da video formati uchun sifatni yuboramiz (masalan: "360" yoki "720")
    return await fetchFromLoader(url, quality);
  } catch (error) {
    logError("getYouTubeStream", error);
    throw error;
  }
};

const isValidYouTubeUrl = (url) =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|shorts)\/.+$/.test(
    url,
  );

module.exports = {
  getYouTubeStream,
  downloadAudio,
  isValidYouTubeUrl,
  getVideoInfo,
};
