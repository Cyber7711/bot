const youtubedl = require("youtube-dl-exec");
const fs = require("fs");
const path = require("path");
const os = require("os");

// --- YOUTUBE TO'SIQLARINI AYLANIB O'TISH ---
const antiBanOptions = {
  noCheckCertificates: true,
  jsRuntimes: "node", // "nodejs" emas, aynan "node" deb yozing
  noWarnings: true,
  // Player klientini olib tashladik yoki 'web' ga qaytardik
  // Chunki Android hozir PO Token so'rayapti
};

// YouTube'dan qidirish funksiyasi
const searchVideos = async (query) => {
  try {
    const results = await youtubedl(`ytsearch5:${query}`, {
      // 5 ta natija qidirish
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    return results.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      author: entry.uploader,
      thumbnail: entry.thumbnail,
      duration: entry.duration_string,
    }));
  } catch (e) {
    return [];
  }
};

// --- 1. VIDEO MA'LUMOTI ---
const getVideoInfo = async (url) => {
  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      ...antiBanOptions,
    });

    return {
      id: info.id,
      title: info.title,
      author: info.uploader,
      duration: info.duration, // Sekundlarda keladi
      thumbnail: info.thumbnail, // <--- MANA SHU QO'SHILDI (Rasm uchun)
      url: info.webpage_url,
    };
  } catch (error) {
    console.error("Service Info Error:", error.message);
    return null;
  }
};

// --- 2. VIDEO STREAM ---
const getYouTubeStream = (url) => {
  return youtubedl.exec(
    url,
    {
      output: "-",
      // Formatni biroz soddalashtiramiz, muammo chiqmasligi uchun
      format:
        "bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      ...antiBanOptions,
    },
    { stdio: ["ignore", "pipe", "ignore"] },
  ).stdout;
};

// --- 3. AUDIO YUKLASH ---
const downloadAudio = async (url, videoId) => {
  const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);

  await youtubedl(url, {
    output: filePath,
    // Eng barqaror audio formatini tanlaymiz
    format: "bestaudio[ext=m4a]/bestaudio/best",
    ...antiBanOptions,
  });

  return filePath;
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
