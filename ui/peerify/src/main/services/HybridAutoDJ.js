import { db, normalizeGenre } from './MarkovEngine.js'

// ==========================================
// HYBRID RANKING ENGINE (STOCHASTIC)
// ==========================================

export class HybridAutoDJ {
  constructor() {
    this.weights = {
      markov: 0.4,
      content: 0.25,
      harmonic: 0.25,
      context: 0.1
    }
  }

  getHarmonicScore(key1, key2) {
    if (!key1 || !key2) return 0.5; // Neutral if missing

    // Normalize to Camelot if possible
    const k1 = this.toCamelot(key1);
    const k2 = this.toCamelot(key2);

    if (!k1 || !k2) return 0.5;
    if (k1 === k2) return 1.0;

    const n1 = parseInt(k1);
    const n2 = parseInt(k2);
    const l1 = k1.slice(-1);
    const l2 = k2.slice(-1);

    const dist = Math.abs(n1 - n2);
    const numDist = Math.min(dist, 12 - dist); // Circular distance

    if (l1 === l2) {
      if (numDist === 1) return 0.9;
    } else {
      if (numDist === 0) return 0.8; // Relative Major/Minor
    }

    return 0.0;
  }

  toCamelot(key) {
    if (!key) return null;
    if (/^[0-9]{1,2}[AB]$/i.test(key)) return key.toUpperCase();

    const map = {
      'Abm': '1A', 'B': '1B', 'Ebm': '2A', 'Gb': '2B', 'Bbm': '3A', 'Db': '3B',
      'Fm': '4A', 'Ab': '4B', 'Cm': '5A', 'Eb': '5B', 'Gm': '6A', 'Bb': '6B',
      'Dm': '7A', 'F': '7B', 'Am': '8A', 'C': '8B', 'Em': '9A', 'G': '9B',
      'Bm': '10A', 'D': '10B', 'Gbm': '11A', 'A': '11B', 'Dbm': '12A', 'E': '12B',
      // Common variations
      'G#m': '1A', 'D#m': '2A', 'A#m': '3A', 'C#': '3B', 'F#': '2B'
    };
    return map[key] || null;
  }

  getMarkovProbability(transitions, candidateKey) {
    if (!transitions || Object.keys(transitions).length === 0) return 0.0
    const totalWeight = Object.values(transitions).reduce((sum, w) => sum + w, 0)
    if (totalWeight === 0) return 0.0
    return (transitions[candidateKey] || 0.0) / totalWeight
  }

  //  СТОХАСТИЧЕСКИЙ ВЫБОР (с Temperature Control)
  stochasticSelect(candidates, alpha = 1.5) {
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]

    // Возводим скоры в степень alpha.
    // alpha > 1 усиливает разрыв между лидерами и аутсайдерами
    const adjusted = candidates.map((c) => Math.pow(c.scores.final, alpha))
    const totalWeight = adjusted.reduce((a, b) => a + b, 0)

    let randomNum = Math.random() * totalWeight
    for (let i = 0; i < candidates.length; i++) {
      randomNum -= adjusted[i]
      if (randomNum <= 0) return candidates[i]
    }
    return candidates[candidates.length - 1]
  }

  async getNextBestTrack(context, dspCandidates) {
    const { userId, prevGenre, genre: currentGenre, artist: currentArtist, biorhythmPool } = context

    const genreDb = await db.loadMarkov(userId, false)
    const artistDb = await db.loadMarkov(userId, true)

    const normPrevGenre = normalizeGenre(prevGenre)
    const normCurrGenre = normalizeGenre(currentGenre)

    // 1. ⚡ ИСПОЛЬЗУЕМ 2-Й ПОРЯДОК МАРКОВА (A|B -> C)
    const state2 = `${normPrevGenre}|${normCurrGenre}`
    const genreTransitions =
      genreDb[state2] && Object.keys(genreDb[state2]).length > 0
        ? genreDb[state2]
        : genreDb[normCurrGenre] || {} // Fallback на 1-й порядок

    const artistTransitions = artistDb[currentArtist] || {}

    const rankedCandidates = []

    // 2. СЧИТАЕМ FinalScore ДЛЯ КАЖДОГО КАНДИДАТА
    for (const track of dspCandidates) {
      const normCandidateGenre = normalizeGenre(track.genre)

      // A. Content Similarity
      const contentScore = track.contentSimilarity || 0.0

      // B. Markov Score (Взвешенный: 70% Жанр, 30% Артист)
      const genreProb = this.getMarkovProbability(genreTransitions, normCandidateGenre)
      const artistProb = this.getMarkovProbability(artistTransitions, track.artist)

      // Защита от деления на 0 и занижения скора
      let markovScore = genreProb
      if (track.artist && track.artist !== 'Unknown Artist') {
        markovScore = 0.7 * genreProb + 0.3 * artistProb
      }

      // C. Harmonic Score (NEW: Camelot compatibility)
      const harmonicScore = this.getHarmonicScore(context.key, track.key);

      // D. Context Score (Мягкая ступенчатая функция)
      let contextScore = 0.3
      if (biorhythmPool.includes(normCandidateGenre)) {
        contextScore = 1.0 // Точное попадание
      } else if (
        biorhythmPool.some((g) => g.includes(normCandidateGenre) || normCandidateGenre.includes(g))
      ) {
        contextScore = 0.6 // Родственный/Родительский жанр
      }

      const finalScore =
        this.weights.markov * markovScore +
        this.weights.content * contentScore +
        this.weights.harmonic * harmonicScore +
        this.weights.context * contextScore

      rankedCandidates.push({
        ...track,
        scores: {
          markov: markovScore,
          content: contentScore,
          harmonic: harmonicScore,
          context: contextScore,
          final: finalScore
        }
      })
    }

    // 3. РАНЖИРУЕМ И ВЫБИРАЕМ
    rankedCandidates.sort((a, b) => b.scores.final - a.scores.final)

    // Берем Top-10 и делаем стохастический (случайный с весами) выбор
    const topN = rankedCandidates.slice(0, 10)
    return this.stochasticSelect(topN, 1.5) // alpha = 1.5 (слегка склоняемся к лидерам)
  }
}
