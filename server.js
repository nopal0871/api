// streaming-backend/server.js
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = 3001; // Port untuk API backend
// Sesuaikan VIDEOS_ROOT_DIR berdasarkan lokasi folder 'videos' Anda
// Contoh: 'path.join(__dirname, '..', '..', 'videos')' berarti dari 'streaming-backend', naik 2 level, lalu masuk ke 'videos'
const VIDEOS_ROOT_DIR = path.join(__dirname, '..', 'videos');
console.log('Resolved VIDEOS_ROOT_DIR:', VIDEOS_ROOT_DIR); // Tambahkan ini

// Middleware CORS
app.use(cors({
    origin: 'http://localhost:8000' // <--- SESUAIKAN DENGAN PORT FRONTEND ANDA (misal: python -m http.server menggunakan 8000)
}));

// Endpoint API untuk mendapatkan semua data video
app.get('/api/videos', async (req, res) => {
    try {
        const videoData = await scanVideos(VIDEOS_ROOT_DIR);
        res.json(videoData);
    } catch (error) {
        console.error('Error scanning videos:', error);
        res.status(500).json({ message: 'Failed to scan videos', error: error.message });
    }
});

// Endpoint untuk menyajikan file statis (thumbnail, video) dari folder 'videos'
// Ini penting agar frontend bisa memuat gambar dan video
app.use('/static/videos', express.static(VIDEOS_ROOT_DIR));

// Fungsi untuk memindai folder video dan mengumpulkan metadata
async function scanVideos(baseDir) {
    const videoList = [];
    let mainFolders;
    try {
        mainFolders = await fs.readdir(baseDir, { withFileTypes: true });
    } catch (error) {
        console.error(`Error reading base directory ${baseDir}:`, error);
        return []; // Return empty list if base directory not found or unreadable
    }


    for (const mainFolder of mainFolders) {
        if (mainFolder.isDirectory()) {
            const videoId = mainFolder.name;
            const videoPath = path.join(baseDir, videoId);
            let files;
            try {
                files = await fs.readdir(videoPath, { withFileTypes: true });
            } catch (error) {
                console.warn(`Could not read directory ${videoPath}:`, error.message);
                continue; // Skip this folder if it's unreadable
            }


            let thumbnail = null;
            let movieFile = null;
            const episodes = [];

            for (const file of files) {
                const filePath = path.join(videoPath, file.name);
                const fileExt = path.extname(file.name).toLowerCase();

                if (file.isFile()) {
                    if (file.name.toLowerCase().includes('thumbnail') && (fileExt === '.jpg' || fileExt === '.png')) {
                        thumbnail = `/static/videos/${videoId}/${file.name}`;
                    } else if (['.mp4', '.mkv', '.avi', '.mov'].includes(fileExt)) {
                        const videoFileName = file.name;
                        const episodeObj = {
                            id: `${videoId}-${videoFileName.replace(fileExt, '')}`,
                            title: videoFileName.replace(fileExt, ''),
                            duration: 'Unknown',
                            videoSrc: `/static/videos/${videoId}/${videoFileName}`,
                            thumbnail: `/static/videos/${videoId}/${videoFileName.replace(fileExt, '.jpg')}` // Fallback thumbnail
                        };
                        episodes.push(episodeObj);
                    }
                }
            }

            // Pilih thumbnail terbaik
            const actualThumbnailPath = thumbnail || (episodes.length > 0 ? episodes[0].thumbnail : null);

            // Dapatkan metadata untuk setiap episode/film
            for (let i = 0; i < episodes.length; i++) {
                const episode = episodes[i];
                const episodeFilePath = path.join(videoPath, path.basename(episode.videoSrc.split('/static/videos/')[1]));
                const episodeMetaData = await getVideoMetadata(episodeFilePath);
                if (episodeMetaData && episodeMetaData.format && episodeMetaData.format.duration) {
                    episode.duration = formatDuration(episodeMetaData.format.duration);
                }
            }

            // Tentukan apakah ini film atau serial
            const isSeries = episodes.length > 1;
            const finalEpisodes = isSeries ? episodes : (episodes.length === 1 ? [episodes[0]] : []);

            // Jika ini film tunggal, gunakan judul folder atau nama file utama
            let displayTitle = mainFolder.name;
            if (!isSeries && finalEpisodes.length === 1) {
                displayTitle = finalEpisodes[0].title;
            }


            videoList.push({
                id: videoId,
                title: displayTitle,
                description: `A great ${isSeries ? 'series' : 'movie'} titled "${displayTitle}".`, // Deskripsi dummy
                thumbnail: actualThumbnailPath,
                heroBackground: actualThumbnailPath, // Bisa juga thumbnail
                isSeries: isSeries,
                episodes: finalEpisodes
            });
        }
    }
    return videoList;
}

// Fungsi pembantu untuk mendapatkan metadata video menggunakan ffprobe
function getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.error(`Error getting metadata for ${filePath}:`, err.message);
                resolve(null); // Resolusi dengan null jika ada error, jangan reject
            } else {
                resolve(metadata);
            }
        });
    });
}

// Fungsi pembantu untuk memformat durasi dari detik ke HH:MM:SS
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s]
        .map(v => v < 10 ? '0' + v : v)
        .filter((v, i) => v !== '00' || i > 0)
        .join(':') || '00s';
}


app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});