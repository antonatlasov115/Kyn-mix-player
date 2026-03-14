import { YouTubeService } from './YouTubeService'

export class SearchManager {
    static async search(query, platform = 'youtube') {
        if (platform === 'youtube' || platform === 'soundcloud' || platform === 'music') {
            return await YouTubeService.searchTracks(query, 8, platform)
        }

        return []
    }
}
