import { promises as fs } from 'fs'
import fsSync from 'fs'
import path from 'path'
import 'dotenv/config'
import { app, nativeImage } from 'electron'
import { parseFile } from 'music-metadata'
import { normalizeGenre } from './MarkovEngine.js'

const LASTFM_KEY = process.env.LASTFM_API_KEY
const LASTFM_URL = 'http://ws.audioscrobbler.com/2.0/'

// Динамические пути (зависят от состояния app)
const getCacheFile = () => path.join(app.getPath('userData'), 'database', 'metadata_cache.json')
const getThumbDir = () => path.join(app.getPath('userData'), 'thumbnails')

const TRASH_TAGS = new Set([
  'seen live', 'favorite', 'love', 'awesome', 'tracks', 'catchy', 'beautiful',
  'amazing', 'good', 'best', 'masterpiece', 'loved', 'favorites', 'favourite',
  'rock', 'pop' // skip generic if we want specific
])

/**
 * Saves both full and mini versions of an image buffer
 * Returns { full, mini } paths
 */
async function _saveArtworkTiered(buffer, basePath) {
  try {
    const fullPath = basePath.replace(/\.(jpg|jpeg|png|webp)$/i, '.full.jpg')
    const miniPath = basePath.replace(/\.(jpg|jpeg|png|webp)$/i, '.mini.jpg')

    const img = nativeImage.createFromBuffer(buffer)
    if (img.isEmpty()) return null

    // Save Full (Max 1024 for reasonable size)
    const fullImg = img.resize({ width: 1024, height: 1024, quality: 'good' })
    await fs.writeFile(fullPath, fullImg.toJPEG(85))

    // Save Mini (128x128 for list)
    const miniImg = img.resize({ width: 128, height: 128, quality: 'better' })
    await fs.writeFile(miniPath, miniImg.toJPEG(75))

    return { fullPath, miniPath }
  } catch (e) {
    console.error('[MetadataService] Resize failed:', e)
    return null
  }
}

let genreCache = null

async function loadCache() {
  if (genreCache) return
  try {
    const data = await fs.readFile(getCacheFile(), 'utf-8')
    genreCache = JSON.parse(data)
  } catch {
    genreCache = {}
  }
}

async function saveToCache(query, genre) {
  if (!genreCache) genreCache = {}
  const normalizedQuery = query.toLowerCase().trim()
  const cleanGenre = normalizeGenre(genre)
  genreCache[normalizedQuery] = cleanGenre
  try {
    const cachePath = getCacheFile()
    const dir = path.dirname(cachePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(genreCache, null, 2), 'utf-8')
  } catch (e) { }
  return cleanGenre
}

function isSimilar(s1, s2) {
  if (!s1 || !s2) return false
  const a = s1.toLowerCase().replace(/[^a-z0-9]/g, '')
  const b = s2.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (a.length < 3 || b.length < 3) return false
  return a.includes(b) || b.includes(a)
}

const BANNED_GENRES = new Set(['documentary', 'podcast', 'speech', 'audiobook', 'spoken word', 'other'])

async function fetchWithRetry(url, options = {}, retries = 2) {
  const { net } = await import('electron')
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await net.fetch(url, options)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return await resp.json()
    } catch (e) {
      if (i === retries) throw e
      console.log(`[MetadataService] Retry ${i + 1}/${retries} for: ${url} (${e.message})`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

export class MetadataService {
  /**
   * Полный цикл определения жанра: Тэги -> Last.fm -> MusicBrainz -> iTunes
   */
  static async getGenreForFile(filePath) {
    if (!filePath) return 'Unknown'
    const fileName = path.basename(filePath)
    let artist = ''
    let title = ''

    // 1. Пытаемся считать данные из встроенных тегов
    try {
      const meta = await parseFile(filePath)
      artist = meta.common.artist || ''
      title = meta.common.title || ''

      if (meta.common.genre && meta.common.genre.length > 0) {
        const embedded = meta.common.genre[0]
        if (embedded && embedded !== 'Unknown' && embedded !== 'other' && !BANNED_GENRES.has(embedded.toLowerCase())) {
          return await saveToCache(fileName, embedded)
        }
      }
    } catch (e) { }

    // 2. Фолбэк на онлайн-поиск (используем теги если есть, иначе имя файла)
    if (artist && title) {
      return await this.getTrackGenre(`${artist} - ${title}`, artist, title)
    }

    const cleanName = fileName.replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '')
    return await this.getTrackGenre(cleanName)
  }

  static async getTrackGenre(query, explicitArtist = '', explicitTrack = '') {
    await loadCache()
    const cacheKey = (explicitArtist && explicitTrack)
      ? `${explicitArtist} - ${explicitTrack}`.toLowerCase().trim()
      : query.toLowerCase().trim()

    // Check cache
    if (genreCache[cacheKey]) {
      const cached = genreCache[cacheKey].toLowerCase()
      if (!BANNED_GENRES.has(cached)) return genreCache[cacheKey]
    }

    let artist = explicitArtist
    let track = explicitTrack

    if (!artist || !track) {
      [artist, track] = ['', query]
      const separators = [' - ', ' ~ ', ' | ']
      for (const sep of separators) {
        if (query.includes(sep)) {
          [artist, track] = query.split(sep).map(s => s.trim())
          break
        }
      }
    }

    // CLEANING: Remove [Official Video], (Official Audio), extensions, etc.
    const junkRegex = /\[.*?\]|\(.*?\)|\b(official|video|visualizer|audio|lyric|lyrics|hq|hd|4k)\b|\.(mp3|wav|flac|m4a|ogg|aac)$/gi;
    track = track.replace(junkRegex, '').replace(/\s+/g, ' ').trim();

    if (artist) {
      artist = artist.replace(junkRegex, '').replace(/\s+/g, ' ').trim();
      // If multiple artists (ODETARI, Ayesha Erotica), try taking only the first one for better API matching
      if (artist.includes(',')) artist = artist.split(',')[0].trim();
      if (artist.includes('&')) artist = artist.split('&')[0].trim();
      if (artist.toLowerCase().includes(' feat.')) artist = artist.split(/ feat\./i)[0].trim();
    }

    console.log(`[MetadataService] Cleaned query: "${artist}" - "${track}"`)

    // LAYER 1: Last.fm
    if (LASTFM_KEY) {
      try {
        const { net } = await import('electron')
        const url = `${LASTFM_URL}?method=track.getinfo&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&api_key=${LASTFM_KEY}&format=json`
        const resp = await net.fetch(url).then(r => r.json())
        const info = resp?.track
        const tags = info?.toptags?.tag || []
        for (const t of tags) {
          const name = t.name.toLowerCase()
          if (!TRASH_TAGS.has(name) && name.length > 2) {
            console.log(`[Last.fm] Found genre: ${name}`)
            return await saveToCache(query, name)
          }
        }
      } catch (e) {
        console.warn(`[Last.fm] Failed: ${e.message}`)
      }
    }

    // LAYER 2: MusicBrainz (Search)
    try {
      let mbQuery = artist ? `recording:${encodeURIComponent(track)} AND artist:${encodeURIComponent(artist)}` : `recording:${encodeURIComponent(track)}`
      let mbUrl = `https://musicbrainz.org/ws/2/recording/?query=${mbQuery}&fmt=json&limit=1`
      console.log(`[MusicBrainz] Query: ${mbUrl}`)
      let resp = await fetchWithRetry(mbUrl, { headers: { 'User-Agent': 'Kyn Mix/1.1' } })

      // Fallback: If no match with artist, try track only
      if ((!resp.recordings || resp.recordings.length === 0) && artist) {
        console.log(`[MusicBrainz] No match with artist. Trying track only...`)
        mbQuery = `recording:${encodeURIComponent(track)}`
        mbUrl = `https://musicbrainz.org/ws/2/recording/?query=${mbQuery}&fmt=json&limit=5`
        resp = await fetchWithRetry(mbUrl, { headers: { 'User-Agent': 'Kyn Mix/1.1' } })
      }

      if (resp.recordings?.length > 0) {
        for (const rec of resp.recordings) {
          const tags = rec.tags || []
          if (tags.length > 0) {
            tags.sort((a, b) => b.count - a.count)
            console.log(`[MusicBrainz] Found match: ${rec.title} with tag: ${tags[0].name}`)
            return await saveToCache(query, tags[0].name)
          }
        }
        console.log(`[MusicBrainz] Recordings found but no tags.`)
      } else {
        console.log(`[MusicBrainz] No recordings found for: ${track}`)
      }
    } catch (e) {
      console.warn(`[MusicBrainz] Error: ${e.message}`)
    }

    // LAYER 3: iTunes (Apple Music)
    try {
      const itunesTerms = [artist + ' ' + track, query]

      for (const term of itunesTerms) {
        if (!term.trim() || term.length < 3) continue
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=3`
        console.log(`[iTunes] Query: ${itunesUrl}`)
        const data = await fetchWithRetry(itunesUrl)

        if (data.resultCount > 0) {
          for (const result of data.results) {
            const resArtist = result.artistName || ''
            const resTrack = result.trackName || ''
            const genre = (result.primaryGenreName || '').toLowerCase()

            // Strict Validation: Artist and Track must match loosely
            const artistMatches = !artist || isSimilar(resArtist, artist)
            const trackMatches = isSimilar(resTrack, track)

            if (artistMatches && trackMatches && !BANNED_GENRES.has(genre)) {
              console.log(`[iTunes] Match validated: ${genre} (${resTrack} by ${resArtist})`)
              return await saveToCache(query, genre)
            } else {
              if (BANNED_GENRES.has(genre)) {
                console.log(`[iTunes] Skipping banned genre: ${genre}`)
              } else {
                console.log(`[iTunes] Skipping mismatch: ${resTrack} by ${resArtist} - ${genre}`)
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[iTunes] Error: ${e.message}`)
    }

    return 'Unknown'
  }

  /**
   * Extracts full metadata including cover art (saved as a temporary file)
   */
  static async getMetadata(filePath) {
    if (!filePath || !fsSync.existsSync(filePath)) return null

    try {
      const meta = await parseFile(filePath)
      let title = meta.common.title || path.basename(filePath, path.extname(filePath))
      if (this.isTechnicalString(title)) {
        title = path.basename(filePath, path.extname(filePath))
      }

      const result = {
        title: title,
        artist: meta.common.artist || 'Unknown Artist',
        album: meta.common.album || '',
        year: meta.common.year || '',
        genre: (meta.common.genre && meta.common.genre[0]) || 'Unknown Genre',
        duration: meta.format.duration || 0,
        bpm: (meta.common.bpm) || null,
        thumbnail: null
      }

      // Handle Cover Art
      if (meta.common.picture && meta.common.picture.length > 0) {
        const pic = meta.common.picture[0]
        const thumbDir = getThumbDir()
        if (!fsSync.existsSync(thumbDir)) fsSync.mkdirSync(thumbDir, { recursive: true })

        const crypto = await import('crypto')
        const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase()
        const newHash = crypto.createHash('md5').update(normalizedPath).digest('hex')
        const oldHash = crypto.createHash('md5').update(filePath).digest('hex')

        const ext = (pic.format.includes('png') ? 'png' : 'jpg')
        const thumbBase = path.join(thumbDir, `${newHash}.${ext}`)
        const oldThumbPath = path.join(thumbDir, `${oldHash}.${ext}`)

        const miniPath = thumbBase.replace(/\.(jpg|jpeg|png|webp)$/i, '.mini.jpg')
        const fullPath = thumbBase.replace(/\.(jpg|jpeg|png|webp)$/i, '.full.jpg')

        if (fsSync.existsSync(miniPath)) {
          result.thumbnail = miniPath
          result.originalCover = fsSync.existsSync(fullPath) ? fullPath : miniPath
        } else {
          // Fallback to legacy if mini doesn't exist yet but old hash does
          if (fsSync.existsSync(oldThumbPath)) {
            result.thumbnail = oldThumbPath
            result.originalCover = oldThumbPath
          } else {
            const saved = await _saveArtworkTiered(pic.data, thumbBase)
            if (saved) {
              result.thumbnail = saved.miniPath
              result.originalCover = saved.fullPath
            }
          }
        }
      } else {
        // FALLBACK: Look for local files like folder.jpg, cover.jpg
        const dir = path.dirname(filePath)
        const commonNames = ['cover.jpg', 'folder.jpg', 'album.jpg', 'cover.png', 'folder.png', 'artwork.jpg']
        for (const name of commonNames) {
          const fullPath = path.join(dir, name)
          if (fsSync.existsSync(fullPath)) {
            console.log(`[MetadataService] Found local cover file: ${fullPath}`)
            result.thumbnail = fullPath
            break
          }
        }
      }

      return result
    } catch (e) {
      console.error(`[MetadataService] Failed to extract metadata for ${filePath}:`, e.message)
      return null
    }
  }

  static isTechnicalString(str) {
    if (!str) return true
    const s = str.toLowerCase().trim()
    return (
      s.includes('bpm:') ||
      /^\d+(\.\d+)?$/.test(s) || // Just a number
      ['unknown', 'other', 'dsp-ready', 'unknown artist', 'unknown genre', ''].includes(s)
    )
  }

  /**
   * Searches for metadata and cover art online
   */
  static async getOnlineMetadata(artist, track) {
    if (this.isTechnicalString(artist) && this.isTechnicalString(track)) return null

    // CLEANING: Ensure we don't send garbage to search APIs
    const junkRegex = /\[.*?\]|\(.*?\)|\b(official|video|visualizer|audio|lyric|lyrics|hq|hd|4k)\b|\.(mp3|wav|flac|m4a|ogg|aac)$/gi;
    const cleanTrack = track.replace(junkRegex, '').replace(/\s+/g, ' ').trim();
    const cleanArtist = this.isTechnicalString(artist) ? '' : artist.replace(junkRegex, '').replace(/\s+/g, ' ').trim();

    // LAYER 1: Last.fm
    if (LASTFM_KEY) {
      try {
        const { net } = await import('electron')
        const url = `${LASTFM_URL}?method=track.getinfo&artist=${encodeURIComponent(cleanArtist)}&track=${encodeURIComponent(cleanTrack)}&api_key=${LASTFM_KEY}&format=json`
        const resp = await net.fetch(url).then(r => r.json())
        const info = resp?.track
        if (info) {
          const images = info.album?.image || []
          const largeImage = images.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text']
          if (largeImage) {
            console.log(`[Last.fm] Found online metadata for: ${artist} - ${track}`)
            const cleanArtist = this.isTechnicalString(info.artist?.name) ? artist : info.artist.name
            const cleanTitle = this.isTechnicalString(info.name) ? track : info.name

            return {
              thumbnailUrl: largeImage,
              artist: cleanArtist,
              title: cleanTitle,
              album: info.album?.title || '',
              genre: (info.toptags?.tag && info.toptags.tag[0]?.name) || null
            }
          }
        }
      } catch (e) { }
    }

    // LAYER 2: iTunes
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanArtist + ' ' + cleanTrack)}&entity=song&limit=1`
      const data = await fetchWithRetry(itunesUrl)
      if (data.resultCount > 0) {
        const result = data.results[0]
        const artwork = result.artworkUrl100 ? result.artworkUrl100.replace('100x100', '600x600') : null
        if (artwork) {
          console.log(`[iTunes] Found online metadata for: ${artist} - ${track}`)
          return {
            thumbnailUrl: artwork,
            artist: result.artistName || artist,
            title: result.trackName || track,
            album: result.collectionName || '',
            genre: result.primaryGenreName || null
          }
        }
      }
    } catch (e) { }

    return null
  }

  /**
   * Downloads an image from a URL and saves it to the thumbnails directory
   */
  static async downloadThumbnail(url, identifier) {
    try {
      if (!url) return null
      const thumbDir = getThumbDir()
      if (!fsSync.existsSync(thumbDir)) fsSync.mkdirSync(thumbDir, { recursive: true })

      const crypto = await import('crypto')
      const normalizedIdentifier = identifier.replace(/\\/g, '/').toLowerCase()
      const newHash = crypto.createHash('md5').update(normalizedIdentifier).digest('hex')
      const oldHash = crypto.createHash('md5').update(identifier).digest('hex')

      const ext = url.split('.').pop().split('?')[0] || 'jpg'
      const thumbBase = path.join(thumbDir, `online_${newHash}.${ext}`)
      const oldThumbPath = path.join(thumbDir, `online_${oldHash}.${ext}`)

      const miniPath = thumbBase.replace(/\.(jpg|jpeg|png|webp)$/i, '.mini.jpg')
      const fullPath = thumbBase.replace(/\.(jpg|jpeg|png|webp)$/i, '.full.jpg')

      if (fsSync.existsSync(miniPath)) {
        return {
          thumbnail: miniPath,
          originalCover: fsSync.existsSync(fullPath) ? fullPath : miniPath
        }
      }

      if (fsSync.existsSync(oldThumbPath)) {
        return { thumbnail: oldThumbPath, originalCover: oldThumbPath }
      }

      const { net } = await import('electron')
      const resp = await net.fetch(url)
      if (!resp.ok) return null

      const buffer = Buffer.from(await resp.arrayBuffer())
      const saved = await _saveArtworkTiered(buffer, thumbBase)

      if (saved) {
        return {
          thumbnail: saved.miniPath,
          originalCover: saved.fullPath
        }
      }
      return null
    } catch (e) {
      console.error(`[MetadataService] Failed to download thumbnail:`, e.message)
      return null
    }
  }
}
