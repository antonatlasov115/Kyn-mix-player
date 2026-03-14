import * as musicMetadata from 'music-metadata'
import path from 'path'

export class MusicBrainzService {
    /**
     * Пытается найти жанр трека через MusicBrainz API
     */
    static async fetchGenre(filePath) {
        try {
            let artist = ''
            let title = ''

            // 1. Пробуем прочитать существующие теги
            try {
                const metadata = await musicMetadata.parseFile(filePath)
                artist = metadata.common.artist || ''
                title = metadata.common.title || ''

                // Если жанр уже есть в тегах, возвращаем его (но нормализуем позже)
                if (metadata.common.genre && metadata.common.genre.length > 0) {
                    return metadata.common.genre[0]
                }
            } catch (e) {
                console.warn(`[MusicBrainz] Could not parse tags for ${filePath}:`, e.message)
            }

            // 2. Если тегов нет, парсим имя файла
            if (!artist || !title) {
                const fileName = path.basename(filePath, path.extname(filePath))
                if (fileName.includes(' - ')) {
                    const parts = fileName.split(' - ')
                    artist = parts[0].trim()
                    title = parts[1].trim()
                } else {
                    title = fileName.trim()
                }
            }

            if (!title) return null

            // 3. Запрос к MusicBrainz API
            const query = `recording:${encodeURIComponent(title)}${artist ? ` AND artist:${encodeURIComponent(artist)}` : ''}`
            const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=1`

            console.log(`[MusicBrainz] Searching: ${url}`)

            const response = await fetch(url, {
                headers: { 'User-Agent': 'Kyn Mix/1.0.0 ( anton@example.com )' }
            })

            if (!response.ok) {
                throw new Error(`MusicBrainz API error: ${response.status}`)
            }

            const data = await response.json()

            if (data.recordings && data.recordings.length > 0) {
                const recording = data.recordings[0]
                console.log(`[MusicBrainz] Match found: ${recording.title} by ${recording['artist-credit']?.[0]?.name}`)

                // Собираем все теги (жанры обычно там)
                const tags = []
                if (recording.tags) tags.push(...recording.tags)
                if (recording['artist-credit']) {
                    recording['artist-credit'].forEach(ac => {
                        if (ac.artist && ac.artist.tags) tags.push(...ac.artist.tags)
                    })
                }

                if (tags.length > 0) {
                    // Сортируем по количеству голосов (count)
                    tags.sort((a, b) => b.count - a.count)
                    const bestGenre = tags[0].name
                    console.log(`[MusicBrainz] Best tag match: ${bestGenre}`)
                    return bestGenre
                } else {
                    console.warn(`[MusicBrainz] No tags found for recording: ${recording.id}`)
                }
            } else {
                console.warn(`[MusicBrainz] No recordings found for query: ${query}`)
            }

            return null
        } catch (err) {
            console.error('[MusicBrainz] Fetch failed:', err.message)
            return null
        }
    }
}
