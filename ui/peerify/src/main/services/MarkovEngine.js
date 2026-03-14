import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import { UserService } from './UserService.js'

// Безопасный путь для данных
const DB_DIR = path.join(app.getPath('userData'), 'database')
const memoryCache = new Map()
let saveTimeout = null
const pendingSaves = new Set()

async function ensureDbDir() {
  try {
    await fs.access(DB_DIR)
  } catch {
    await fs.mkdir(DB_DIR, { recursive: true })
  }
}

async function flushToDisk() {
  if (pendingSaves.size === 0) return
  await ensureDbDir()

  for (const key of pendingSaves) {
    const filePath = path.join(DB_DIR, `${key}.json`)
    try {
      const data = memoryCache.get(key)
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      console.error(`fail save markov engine ${key}:`, error)
    }
  }
  pendingSaves.clear()
}

export const db = {
  async loadMarkov(userId, isArtist = false) {
    const key = isArtist ? `markov_artists_${userId}` : `markov_genres_${userId}`

    if (memoryCache.has(key)) return memoryCache.get(key)

    await ensureDbDir()
    const filePath = path.join(DB_DIR, `${key}.json`)
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
      memoryCache.set(key, data)
      return data
    } catch (error) {
      const emptyData = {}
      memoryCache.set(key, emptyData)
      return emptyData
    }
  },

  async saveMarkov(userId, data, isArtist = false) {
    const key = isArtist ? `markov_artists_${userId}` : `markov_genres_${userId}`

    memoryCache.set(key, data)
    pendingSaves.add(key)

    if (!saveTimeout) {
      saveTimeout = setTimeout(() => {
        flushToDisk()
        saveTimeout = null
      }, 3000)
    }
  },

  async getProfile(userId) {
    return await UserService.getProfile(userId)
  }
}

const BANNED_GENRES = new Set([
  'classical_music',
  'opera',
  'symphony',
  'orchestra',
  'podcast',
  'audiobook',
  'sleep_sounds',
  'white_noise',
  'nature_sounds',
  'asmr',
  'comedy',
  'spoken_word'
])

const GENRE_SYNONYMS = {
  'hip hop': 'hip-hop',
  hip_hop: 'hip-hop',
  rap: 'hip-hop',
  'trap music': 'trap',
  'phonk music': 'phonk',
  rnb: 'r&b',
  r_n_b: 'r&b',
  'r&b / hip-hop': 'r&b',
  'rock_n_roll': 'rock',
  'hard rock': 'rock',
  'metal': 'rock',
  'heavy metal': 'rock',
  'electronic': 'electronica',
  'edm': 'dance_pop',
  'deep house': 'house',
  'tech house': 'house',
  'progressive house': 'house',
  'slap house': 'house',
  'future house': 'house',
  'dubstep / trap': 'dubstep',
  'drum & bass': 'drum_and_bass',
  'dnb': 'drum_and_bass',
  'liquid dnb': 'drum_and_bass',
  'neurofunk': 'drum_and_bass',
  'lo-fi / chill': 'lo-fi',
  'lofi': 'lo-fi',
  'chillhop': 'lo-fi',
  'synthwave / retrowave': 'synthwave',
  'vaporwave': 'synthwave',
  'ost': 'soundtrack',
  'score': 'soundtrack',
  'cinematic': 'soundtrack'
}

export function normalizeGenre(genre) {
  if (!genre) return 'pop'
  const cleanGenre = genre.toLowerCase().trim().replace(/ /g, '_')
  return GENRE_SYNONYMS[cleanGenre] || cleanGenre
}

const DEFAULT_MORNING = [
  'rock',
  'pop',
  'dance_pop',
  'drum_and_bass',
  'house',
  'trap',
  'synthwave',
  'hip-hop'
]
const DEFAULT_NIGHT = [
  'lo-fi',
  'chillout',
  'jazz',
  'dreampop',
  'shoegaze',
  'post_rock',
  'downtempo',
  'r&b'
]
const WORK_FOCUS = [
  'lo-fi',
  'synthwave',
  'ambient_techno',
  'post_rock',
  'jazz',
  'neo_classical',
  'deep_house'
]
const COMMUTE_HOME = ['indie_rock', 'pop_rock', 'synth_pop', 'r&b', 'hip-hop', 'classic_rock']
const WEEKEND_DAY = ['pop', 'indie_pop', 'house', 'synthwave', 'hip-hop', 'funk', 'disco']
const FRIDAY_NIGHT = ['dance', 'dance_pop', 'house', 'club', 'tech_house', 'party']
const MONDAY_MORNING = ['phonk', 'hard_rock', 'metalcore', 'workout', 'trap', 'drum_and_bass']
const SUNDAY_CHILL = ['lo-fi', 'acoustic', 'chillout', 'ambient_pop', 'neo_soul', 'indie']

export async function getBiorhythmGenre(userId) {
  const profile = await db.getProfile(userId)
  const tzOffset = profile.timezone_offset || 3
  const userBaseGenre = normalizeGenre(profile.genre || 'pop')
  const useBio = profile.use_bio !== false

  const userDb = await db.loadMarkov(userId, false)
  const bannedObj = userDb['_BANNED_'] || {}
  const userBanned = new Set(Object.keys(bannedObj))

  if (!useBio) {
    const validGenres = Object.keys(userDb).filter(
      (g) =>
        !g.startsWith('_') &&
        g !== 'start' &&
        g !== 'ROOT' &&
        !g.includes('|') &&
        !userBanned.has(g)
    )
    if (validGenres.length > 0) {
      return validGenres[Math.floor(Math.random() * validGenres.length)]
    }
    return userBaseGenre
  }

  const now = new Date()
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000
  const userTime = new Date(utcTime + 3600000 * tzOffset)

  const userHour = userTime.getHours()
  const jsDay = userTime.getDay()

  let pool
  if ((jsDay === 5 || jsDay === 6) && userHour >= 19 && userHour <= 23) pool = FRIDAY_NIGHT
  else if (jsDay === 1 && userHour >= 6 && userHour <= 11) pool = MONDAY_MORNING
  else if (jsDay === 0 && userHour >= 17 && userHour <= 23) pool = SUNDAY_CHILL
  else if (userHour >= 6 && userHour <= 10) pool = DEFAULT_MORNING
  else if (userHour >= 11 && userHour <= 17 && jsDay >= 1 && jsDay <= 5) pool = WORK_FOCUS
  else if (userHour >= 18 && userHour <= 20 && jsDay >= 1 && jsDay <= 5) pool = COMMUTE_HOME
  else if (userHour >= 11 && userHour <= 18 && (jsDay === 6 || jsDay === 0)) pool = WEEKEND_DAY
  else pool = DEFAULT_NIGHT

  pool = pool.filter((g) => !userBanned.has(g))
  if (pool.length === 0) pool = ['pop', 'synthwave']

  if (Math.random() < 0.2 && !userBanned.has(userBaseGenre)) {
    return userBaseGenre
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

export function applyLazyDecay(transitions, threshold = 20, decayFactor = 0.85) {
  const totalWeight = Object.values(transitions).reduce((sum, w) => sum + w, 0)

  if (totalWeight > threshold) {
    const newTransitions = {}
    for (const [tgt, weight] of Object.entries(transitions)) {
      const newWeight = weight * decayFactor
      if (newWeight >= 0.2) {
        newTransitions[tgt] = newWeight
      }
    }
    return newTransitions
  }
  return transitions
}

export async function recordUserTransition(
  userId,
  prevGenre,
  currentGenre,
  nextGenre,
  weight = 1.0
) {
  if (!currentGenre || !nextGenre) return

  const prevG = normalizeGenre(prevGenre)
  const currG = normalizeGenre(currentGenre)
  const nextG = normalizeGenre(nextGenre)

  const userDb = await db.loadMarkov(userId, false)

  const state2 = `${prevG}|${currG}`
  if (!userDb[state2]) userDb[state2] = {}
  userDb[state2][nextG] = (userDb[state2][nextG] || 0.0) + weight
  userDb[state2] = applyLazyDecay(userDb[state2])

  if (!userDb[currG]) userDb[currG] = {}
  userDb[currG][nextG] = (userDb[currG][nextG] || 0.0) + weight
  userDb[currG] = applyLazyDecay(userDb[currG])

  await db.saveMarkov(userId, userDb, false)
}

export async function recordArtistTransition(userId, currentArtist, nextArtist, weight = 1.0) {
  if (!currentArtist || !nextArtist) return

  const userDb = await db.loadMarkov(userId, true)

  if (!userDb[currentArtist]) userDb[currentArtist] = {}
  userDb[currentArtist][nextArtist] = (userDb[currentArtist][nextArtist] || 0.0) + weight
  userDb[currentArtist] = applyLazyDecay(userDb[currentArtist], 15, 0.8)

  await db.saveMarkov(userId, userDb, true)
}

export function weightedRandomChoice(transitions, alpha = 1.0) {
  const keys = Object.keys(transitions)
  if (keys.length === 0) return null

  const adjusted = keys.map((k) => Math.pow(transitions[k], alpha))
  const totalWeight = adjusted.reduce((a, b) => a + b, 0)

  let randomNum = Math.random() * totalWeight
  for (let i = 0; i < keys.length; i++) {
    randomNum -= adjusted[i]
    if (randomNum <= 0) return keys[i]
  }
  return keys[keys.length - 1]
}

export async function getNextUserGenre(userId, prevGenre, currentGenre, recentHistory = []) {
  const userDb = await db.loadMarkov(userId, false)
  const bannedObj = userDb['_BANNED_'] || {}
  const userBanned = new Set(Object.keys(bannedObj))

  const prevG = normalizeGenre(prevGenre)
  const currG = normalizeGenre(currentGenre)

  let epsilon = 0.15

  const realStates = Object.keys(userDb).filter((k) => !k.startsWith('_'))

  if (realStates.length < 10) {
    epsilon = 0.4
  } else if (recentHistory.length >= 3) {
    const lastThree = recentHistory.slice(-3)
    if (lastThree.every((val) => val === lastThree[0])) {
      epsilon = 0.6
    }
  }

  let nextGenre = null

  if (Math.random() < epsilon) {
    nextGenre = await getBiorhythmGenre(userId)
  } else {
    const state2 = `${prevG}|${currG}`
    if (userDb[state2] && Object.keys(userDb[state2]).length > 0) {
      nextGenre = weightedRandomChoice(userDb[state2], 1.2)
    } else if (userDb[currG] && Object.keys(userDb[currG]).length > 0) {
      nextGenre = weightedRandomChoice(userDb[currG], 1.2)
    }
  }

  if (userBanned.has(nextGenre) || BANNED_GENRES.has(nextGenre)) {
    nextGenre = null
  }

  if (!nextGenre) {
    const validHistory = recentHistory.filter(
      (g) => g && !BANNED_GENRES.has(g) && !userBanned.has(g) && g !== 'start'
    )
    if (validHistory.length > 0 && Math.random() < 0.65) {
      return normalizeGenre(validHistory[Math.floor(Math.random() * validHistory.length)])
    } else {
      return await getBiorhythmGenre(userId)
    }
  }

  return nextGenre
}

export async function getNextArtist(userId, currentArtist) {
  const userDb = await db.loadMarkov(userId, true)
  const bannedObj = userDb['_BANNED_'] || {}
  const userBanned = new Set(Object.keys(bannedObj))

  if (userDb[currentArtist] && Object.keys(userDb[currentArtist]).length > 0) {
    const validTransitions = {}
    for (const [artist, weight] of Object.entries(userDb[currentArtist])) {
      if (!userBanned.has(artist) && !artist.startsWith('_')) {
        validTransitions[artist] = weight
      }
    }

    if (Object.keys(validTransitions).length > 0) {
      return weightedRandomChoice(validTransitions, 1.1)
    }
  }
  return null
}
