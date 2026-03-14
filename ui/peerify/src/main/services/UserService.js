import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'

// Безопасный путь для данных
const DB_DIR = path.join(app.getPath('userData'), 'database')

async function ensureDbDir() {
  try {
    await fs.access(DB_DIR)
  } catch {
    await fs.mkdir(DB_DIR, { recursive: true })
  }
}

async function getUserData(userId) {
  await ensureDbDir()
  const filePath = path.join(DB_DIR, `user_${userId}.json`)
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'))
  } catch (error) {
    return {
      user_id: userId,
      genre: 'pop',
      use_bio: true,
      timezone_offset: 3,
      cloud_library: {},
      favorites: [],
      history: []
    }
  }
}

async function saveUserData(userId, data) {
  await ensureDbDir()
  const filePath = path.join(DB_DIR, `user_${userId}.json`)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export class UserService {
  static async getProfile(userId) {
    const user = await getUserData(userId)
    return { genre: user.genre, use_bio: user.use_bio, timezone_offset: user.timezone_offset }
  }

  static async saveProfile(userId, genre) {
    const user = await getUserData(userId)
    user.genre = genre
    await saveUserData(userId, user)
  }

  static async toggleBiorhythm(userId) {
    const user = await getUserData(userId)
    user.use_bio = !user.use_bio
    await saveUserData(userId, user)
    return user.use_bio
  }

  static extractArtist(youtubeTitle) {
    if (!youtubeTitle) return 'Unknown Artist'
    let cleanTitle = youtubeTitle.replace(/\(.*?\)|\[.*?\]/g, '').trim()
    let artist = cleanTitle
    if (cleanTitle.includes('-')) artist = cleanTitle.split('-')[0].trim()
    else if (cleanTitle.includes('—')) artist = cleanTitle.split('—')[0].trim()
    artist = artist.replace(/\b(vevo|topic|official)\b/gi, '').trim()
    return artist.length < 2 ? 'Unknown Artist' : artist
  }

  static async addHistory(userId, query, genre = 'unknown', filePath = '') {
    const user = await getUserData(userId)

    user.history = user.history.filter((h) => h.filePath !== filePath)

    user.history.push({
      title: this.extractArtist(query),
      query: query,
      genre: genre,
      filePath: filePath,
      timestamp: Math.floor(Date.now() / 1000)
    })

    if (user.history.length > 100) user.history = user.history.slice(-100)
    await saveUserData(userId, user)
  }

  static async getRecentHistory(userId, limit = 50) {
    const user = await getUserData(userId)
    return user.history.slice(-limit).reverse()
  }

  static async addFavorite(userId, title, url) {
    const user = await getUserData(userId)
    if (!user.favorites.some((f) => f.url === url)) {
      user.favorites.push({ title, url })
      await saveUserData(userId, user)
    }
  }

  static async getFavorites(userId) {
    const user = await getUserData(userId)
    return user.favorites
  }
}
