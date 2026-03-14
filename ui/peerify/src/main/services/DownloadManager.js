import { EventEmitter } from 'events'
import { YouTubeService } from './YouTubeService'
import path from 'path'
import fs from 'fs'

export class DownloadManager extends EventEmitter {
    constructor() {
        super()
        this.queue = []
        this.activeDownloads = 0
        this.maxConcurrent = 3
        this.cookiesBrowser = 'none'
    }

    setConfig(config = {}) {
        if (config.maxConcurrent !== undefined) this.maxConcurrent = config.maxConcurrent
        if (config.cookiesBrowser !== undefined) this.cookiesBrowser = config.cookiesBrowser
        this.processQueue()
    }

    async addTask(url, title, downloadDir, options = {}) {
        if (url.includes('list=') || url.includes('playlist?list=')) {
            return this.addPlaylist(url, downloadDir)
        }

        const taskId = Math.random().toString(36).substr(2, 9)
        const task = {
            id: taskId,
            url,
            title: title || 'Fetching info...',
            progress: 0,
            status: 'PENDING',
            error: null,
            downloadDir,
            startTime: null,
            endTime: null,
            ...options
        }

        this.queue.push(task)
        this.emit('queue-updated', this.queue)
        this.processQueue()
        return taskId
    }


    async addPlaylist(playlistUrl, downloadDir) {
        try {
            const { title, entries } = await YouTubeService.getPlaylistEntries(playlistUrl)
            const playlistTracks = []

            for (const entry of entries) {
                // Predict filename for the playlist
                let artist = 'YouTube'
                let trackTitle = entry.title || 'Untitled'
                if (trackTitle.includes(' - ')) {
                    const parts = trackTitle.split(' - ')
                    artist = parts[0].trim()
                    trackTitle = parts[1].trim()
                }
                const cleanTitle = trackTitle.replace(/[/\\?%*:|"<>]/g, '').replace(/\(.*?video.*?\)|\[.*?video.*?\]|\(.*?official.*?\)|\[.*?official.*?\]/gi, '').trim()
                const cleanArtist = artist.replace(/[/\\?%*:|"<>]/g, '')
                const fileName = `${cleanArtist} - ${cleanTitle}.mp3`
                const predictedPath = path.join(downloadDir, fileName)

                const entryTaskId = Math.random().toString(36).substr(2, 9)
                const task = {
                    id: entryTaskId,
                    url: entry.url,
                    title: entry.title || 'Fetching info...',
                    progress: 0,
                    status: 'PENDING',
                    error: null,
                    downloadDir,
                    startTime: null,
                    endTime: null,
                    playlistUrl
                }
                this.queue.push(task)

                playlistTracks.push({
                    title: cleanTitle,
                    artist: cleanArtist,
                    filePath: predictedPath
                })
            }

            if (playlistTracks.length > 0) {
                this.emit('create-playlist', { name: title, tracks: playlistTracks })
            }
            this.emit('queue-updated', this.queue)
            this.processQueue()
            return entries.length
        } catch (err) {
            console.error('[DownloadManager] Playlist expansion failed:', err)
            return 0
        }
    }

    async processQueue() {
        if (this.activeDownloads >= this.maxConcurrent) return

        const nextTask = this.queue.find(t => t.status === 'PENDING')
        if (!nextTask) return

        this.startDownload(nextTask)
    }

    async startDownload(task) {
        task.status = 'DOWNLOADING'
        task.startTime = Date.now()
        this.activeDownloads++
        this.emit('queue-updated', this.queue)

        try {
            const result = await YouTubeService.downloadAudio(task.url, task.downloadDir, (progress) => {
                task.progress = progress
                this.emit('progress', { id: task.id, progress })
            }, task.id, this.cookiesBrowser)

            if (result) {
                task.status = 'COMPLETED'
                task.progress = 100
                this.emit('download-finished', task)
            } else {
                task.status = 'FAILED'
                task.error = 'Download failed'
            }
        } catch (err) {
            if (task.status === 'CANCELED') {
                console.log(`[DownloadManager] Task ${task.id} was canceled.`)
            } else {
                task.status = 'FAILED'
                task.error = err.message
            }
        } finally {
            task.endTime = Date.now()
            this.activeDownloads--
            this.emit('queue-updated', this.queue)
            this.processQueue()
        }
    }

    cancelTask(taskId) {
        const task = this.queue.find(t => t.id === taskId)
        if (!task) return

        if (task.status === 'PENDING') {
            task.status = 'CANCELED'
        } else if (task.status === 'DOWNLOADING') {
            task.status = 'CANCELED'
            YouTubeService.stopDownload(taskId)
        }
        this.emit('queue-updated', this.queue)
    }

    getTasks() {
        return this.queue
    }

    clearFinished() {
        this.queue = this.queue.filter(t => t.status !== 'COMPLETED' && t.status !== 'FAILED' && t.status !== 'CANCELED')
        this.emit('queue-updated', this.queue)
    }
}

export const downloadManager = new DownloadManager()
