import fs from 'fs'
import path from 'path'
import ffmpeg from 'ffmpeg-static'
import { app } from 'electron'
import { spawn } from 'child_process'

// ХАК ДЛЯ ELECTRON: Исправляем путь к ffmpeg в собранном приложении
const ffmpegPath = app.isPackaged ? ffmpeg.replace('app.asar', 'app.asar.unpacked') : ffmpeg

//  ХАК ДЛЯ ELECTRON: Исправляем путь к yt-dlp бинарнику
let ytdlpPath = require('youtube-dl-exec/src/constants').YOUTUBE_DL_PATH
if (app.isPackaged) {
  ytdlpPath = ytdlpPath.replace('app.asar', 'app.asar.unpacked')
}

// Хранилище активных процессов для возможности отмены
const activeProcesses = new Map()

// Вспомогательная функция для запуска yt-dlp напрямую через spawn
function runYtDlp(args, onProgress, taskId = null) {
  return new Promise((resolve, reject) => {
    console.log(`[YouTube] Spawning: ${ytdlpPath} ${args.join(' ')}`)
    const proc = spawn(ytdlpPath, args)

    if (taskId) {
      activeProcesses.set(taskId, proc)
    }

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk

      if (onProgress) {
        // [download]  10.0% of 10.00MiB at  1.00MiB/s ETA 00:09
        const match = chunk.match(/\[download\]\s+(\d+\.\d+)%/)
        if (match) {
          onProgress(parseFloat(match[1]))
        }
      }
    })

    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (taskId) activeProcesses.delete(taskId)
      if (code === 0 || (code === 1 && stdout.trim())) {
        resolve({ stdout, stderr, code })
      } else {
        const error = new Error(`yt-dlp exited with code ${code}`)
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      }
    })

    proc.on('error', (err) => {
      err.stdout = stdout
      err.stderr = stderr
      reject(err)
    })
  })
}

export class YouTubeService {
  static stopDownload(taskId) {
    const proc = activeProcesses.get(taskId)
    if (proc) {
      console.log(`[YouTube] Killing process for task: ${taskId}`)
      proc.kill()
      activeProcesses.delete(taskId)
      return true
    }
    return false
  }

  static async getPlaylistEntries(playlistUrl) {
    try {
      const { stdout } = await runYtDlp([
        playlistUrl,
        '--dump-single-json',
        '--flat-playlist',
        '--no-check-certificates',
        '--no-warnings',
        '--ignore-errors'
      ])
      if (!stdout) return { title: 'Downloaded Playlist', entries: [] }

      const data = JSON.parse(stdout)
      const entries = (data.entries || []).map(entry => ({
        title: entry.title || 'Untitled',
        url: entry.webpage_url || entry.url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null),
        id: entry.id
      }))

      return {
        title: data.title || 'Downloaded Playlist',
        entries: entries
      }
    } catch (err) {
      console.error('[YouTube] Failed to get playlist entries:', err)
      return { title: 'Downloaded Playlist', entries: [] }
    }
  }

  static async searchTracks(query, limit = 8, platform = 'youtube') {
    try {
      const isPlaylist = query.includes('list=') || query.includes('/playlist')
      let prefix = 'ytsearch'
      if (platform === 'soundcloud') prefix = 'scsearch'
      if (platform === 'music') prefix = 'ytmsearch'

      const target = query.startsWith('http') ? query : `${prefix}${limit}:${query}`
      console.log(`[YouTube] search request: ${query} (Platform: ${platform}, Playlist: ${isPlaylist})`)

      const args = [
        target,
        '--dump-json',
        '--flat-playlist',
        '--no-check-certificates',
        '--no-warnings',
        '--ignore-errors'
      ]

      if (isPlaylist) {
        args.push('--yes-playlist')
      } else {
        args.push('--no-playlist')
      }

      const { stdout } = await runYtDlp(args)

      if (!stdout) return []

      const results = []
      const lines = stdout.trim().split('\n')

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          // Handle both single entries and playlist objects
          const entries = data.entries || (Array.isArray(data) ? data : [data])

          for (const entry of entries) {
            if (entry && (entry.id || entry.url)) {
              // Try to find the best thumbnail
              let thumbnail = entry.thumbnail
              if (entry.thumbnails && entry.thumbnails.length > 0) {
                thumbnail = entry.thumbnails[entry.thumbnails.length - 1].url
              } else if (!thumbnail && entry.id) {
                thumbnail = `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`
              }

              results.push({
                id: entry.id || entry.url,
                title: entry.title || 'Untitled',
                url: entry.webpage_url || entry.url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null),
                uploader: entry.uploader || entry.channel || 'Unknown',
                duration: entry.duration || 0,
                thumbnail: thumbnail
              })
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      // Filter out invalid results and apply limit
      return results.filter(r => r.url).slice(0, isPlaylist ? 100 : limit)
    } catch (error) {
      console.error('[YouTube] search failed:', error.message)
      return []
    }
  }

  static async downloadAudio(query, downloadDir, onProgress, taskId = null, cookiesBrowser = 'none') {
    if (!downloadDir || downloadDir === 'Директория не выбрана') {
      throw new Error('Папка для скачивания не задана')
    }

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }

    const isYouTube = query.includes('youtube.com') || query.includes('youtu.be')
    const target = (query.startsWith('http') || isYouTube) ? query : `ytsearch1:${query}`
    console.log(`[YouTube] query work: ${query} (IsYouTube: ${isYouTube})`)

    try {
      const metadataArgs = [
        target,
        '--dump-json',
        '--no-check-certificates',
        '--no-warnings',
        '--ignore-errors'
      ]
      if (cookiesBrowser && cookiesBrowser !== 'none') {
        metadataArgs.push('--cookies-from-browser', cookiesBrowser)
      }
      let stdout, stderr
      try {
        const res = await runYtDlp(metadataArgs, null, taskId)
        stdout = res.stdout
        stderr = res.stderr
      } catch (err) {
        console.error('[YouTube] Metadata fetch failed:', err.message)
        if (err.stderr) console.error('[YouTube] Metadata stderr:', err.stderr)

        // Metadata Fallback
        if (cookiesBrowser && cookiesBrowser !== 'none') {
          console.warn(`[YouTube] Retrying metadata fetch WITHOUT cookies...`)
          return this.downloadAudio(query, downloadDir, onProgress, taskId, 'none')
        }
        throw err
      }

      if (!stdout) throw new Error('Трек не найден на YouTube')
      let trackInfo;
      try {
        trackInfo = JSON.parse(stdout);
      } catch (e) {
        throw new Error('Ошибка парсинга данных с YouTube');
      }

      // Improve Metadata: Try to split Title and Artist
      let title = trackInfo.title || 'Unknown Title'
      let artist = trackInfo.uploader || trackInfo.channel || 'Unknown Artist'

      // Detect Artist - Title format
      if (title.includes(' - ')) {
        const parts = title.split(' - ')
        artist = parts[0].trim()
        title = parts[1].trim()
      }

      // Clean Title (remove (Official Video), [Music Video], lyrics, etc.)
      const junkTags = [
        /\(.*?video.*?\)/gi, /\[.*?video.*?\]/gi,
        /\(.*?official.*?\)/gi, /\[.*?official.*?\]/gi,
        /\(.*?audio.*?\)/gi, /\[.*?audio.*?\]/gi,
        /\(.*?lyrics.*?\)/gi, /\[.*?lyrics.*?\]/gi,
        /\(.*?hd.*?\)/gi, /\[.*?hd.*?\]/gi,
        /\(.*?4k.*?\)/gi, /\[.*?4k.*?\]/gi,
        /\|\s+official\s+video/gi,
        /feat\..*$/gi, /ft\..*$/gi // Removed features from filename for better matching
      ];

      junkTags.forEach(tag => {
        title = title.replace(tag, '').trim();
      });

      const cleanTitle = title.replace(/[/\\?%*:|"<>]/g, '').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').trim() || 'Track'
      const cleanArtist = artist.replace(/[/\\?%*:|"<>]/g, '').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').trim() || 'Artist'
      const fileName = `${cleanArtist} - ${cleanTitle}.mp3`
      const finalPath = path.join(downloadDir, fileName)

      if (fs.existsSync(finalPath)) {
        console.log(`[YouTube] music already in library: ${finalPath}`)
        // We'll allow re-downloading if it's explicitly requested 
        // (for now just returning existing path to save time/bandwidth)
        if (onProgress) onProgress(100)
        return finalPath
      }

      console.log(`[YouTube] downloading: ${cleanArtist} - ${cleanTitle}...`)

      const downloadArgs = [
        target,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--output', path.join(downloadDir, `${cleanArtist} - ${cleanTitle}.%(ext)s`),
        '--ffmpeg-location', ffmpegPath,
        '--embed-thumbnail',
        '--add-metadata',
        '--convert-thumbnails', 'jpg',
        '--no-check-certificates',
        '--no-warnings',
        '--ignore-errors',
        '--newline'
      ]
      if (cookiesBrowser && cookiesBrowser !== 'none') {
        downloadArgs.push('--cookies-from-browser', cookiesBrowser)
      }
      await runYtDlp(downloadArgs, onProgress, taskId)

      console.log(`[YouTube] yeep downloaded: ${finalPath}`)
      return finalPath
    } catch (error) {
      console.error('[YouTube] downloading error:', error.message)
      if (error.stderr) console.error('[YouTube] yt-dlp stderr:', error.stderr)

      // FALLBACK: If failed with cookies, try one last time without them
      if (cookiesBrowser && cookiesBrowser !== 'none') {
        console.warn(`[YouTube] Retrying download WITHOUT cookies (previous attempt with ${cookiesBrowser} failed)`)
        return this.downloadAudio(query, downloadDir, onProgress, taskId, 'none')
      }

      return null
    }
  }
}
