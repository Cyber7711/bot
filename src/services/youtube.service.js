const youtubedl = require("youtube-dl-exec");
const fs = require("fs");
const path = require("path");
const os = require("os");

const antiBanOptions = {
  noCheckCertificates: true,
  jsRuntimes: "node",
  noWarnings: true,
  preferFreeFormats: true,
  addHeader: [
    "referer:youtube.com",
    "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  ], // Ban yemaslik uchun
};

const searchVideos = async (query) => {
  try {
    const results = await youtubedl(`ytsearch5:${query}`, {
      dumpSingleJson: true,
      ...antiBanOptions,
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
      duration: info.duration,
      thumbnail: info.thumbnail,
      url: info.webpage_url,
    };
  } catch (error) {
    return null;
  }
};

const getYouTubeStream = (url) => {
  // Telegram 50MB dan katta faylni API orqali qabul qilmaydi, shuning uchun filesize limit qo'shamiz
  return youtubedl.exec(
    url,
    {
      output: "-",
      format:
        "bestvideo[ext=mp4][height<=480][filesize<50M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<50M]/best",
      ...antiBanOptions,
    },
    { stdio: ["ignore", "pipe", "ignore"] },
  ).stdout;
};

const downloadAudio = async (url, videoId) => {
  const filePath = path.join(os.tmpdir(), `${videoId}.m4a`);
  await youtubedl(url, {
    output: filePath,
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
