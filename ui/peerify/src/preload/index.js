import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  playTrack: (filepath, bpm) => ipcRenderer.invoke('playTrack', filepath, bpm),
  automix: (filepath, bpm, fadeMs, curveType, dropSwapMs, inSeekMs) =>
    ipcRenderer.invoke('automix', filepath, bpm, fadeMs, curveType, dropSwapMs, inSeekMs),
  togglePlay: () => ipcRenderer.invoke('togglePlay'),
  setVolume: (volume) => ipcRenderer.invoke('setVolume', volume),
  getCurrentTime: () => ipcRenderer.invoke('getCurrentTime'),
  getDuration: () => ipcRenderer.invoke('getDuration'),
  isPlaying: () => ipcRenderer.invoke('isPlaying'),
  seekTo: (seconds) => ipcRenderer.invoke('seekTo', seconds),
  setPitch: (pitch) => ipcRenderer.invoke('setPitch', pitch),
  setReverb: (level) => ipcRenderer.invoke('setReverb', level),

  getStats: () => ipcRenderer.invoke('getStats'),
  getAudioDevices: () => ipcRenderer.invoke('getAudioDevices'),
  setAudioConfig: (exclusive, ms, deviceIndex) => ipcRenderer.invoke('setAudioConfig', exclusive, ms, deviceIndex),
  setLatency: (ms) => ipcRenderer.invoke('setLatency', ms),

  setEngine: (usePro) => ipcRenderer.invoke('setEngine', usePro),
  getEngine: () => ipcRenderer.invoke('getEngine'),

  selectDirectory: () => ipcRenderer.invoke('selectDirectory'),
  selectAudioFile: () => ipcRenderer.invoke('selectAudioFile'),
  selectImageFile: () => ipcRenderer.invoke('selectImageFile'),

  // ФУНКЦИИ VST (включая интерфейс)
  selectVstPlugin: () => ipcRenderer.invoke('selectVstPlugin'),
  loadVst: (dllPath) => ipcRenderer.invoke('loadVst', dllPath),
  removeVst: () => ipcRenderer.invoke('removeVst'),
  openVstEditor: () => ipcRenderer.invoke('openVstEditor'),

  buildLibrary: (filepath) => ipcRenderer.invoke('buildLibrary', filepath),
  refineOnline: () => ipcRenderer.invoke('library:refine-online'),
  getLocalLibrary: () => ipcRenderer.invoke('getLocalLibrary'),
  getHybridNextTrack: (currentPath) => ipcRenderer.invoke('getHybridNextTrack', currentPath),
  getTrackMetadata: (filepath) => ipcRenderer.invoke('getTrackMetadata', filepath),
  getLyrics: (filepath) => ipcRenderer.invoke('getLyrics', filepath),

  deleteTrack: (filepath) => ipcRenderer.invoke('deleteTrack', filepath),
  removeFolderTracks: (folderPath) => ipcRenderer.invoke('removeFolderTracks', folderPath),

  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),

  savePlaylist: (name, tracks) => ipcRenderer.invoke('savePlaylist', name, tracks),
  deletePlaylist: (name) => ipcRenderer.invoke('deletePlaylist', name),
  getPlaylists: () => ipcRenderer.invoke('getPlaylists'),
  importM3U: (filePath) => ipcRenderer.invoke('importM3U', filePath),
  exportM3U: (name, tracks, targetPath) => ipcRenderer.invoke('exportM3U', name, tracks, targetPath),
  setZoomFactor: (val) => ipcRenderer.invoke('setZoomFactor', val),

  setContextMenu: (enable) => ipcRenderer.invoke('setContextMenu', enable),

  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  onOpenFiles: (callback) => {
    const handler = (_event, files) => callback(files)
    ipcRenderer.on('open-files', handler)
    return () => ipcRenderer.removeListener('open-files', handler)
  },
  showMiniPlayer: () => ipcRenderer.send('show-mini-player'),
  setTrackData: (data) => ipcRenderer.send('player:setTrackData', data),
  onTrackChanged: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('player:trackChanged', handler)
    return () => ipcRenderer.removeListener('player:trackChanged', handler)
  },
  onStateChanged: (callback) => {
    const handler = (_event, value) => callback(value)
    ipcRenderer.on('player:stateChanged', handler)
    return () => ipcRenderer.removeListener('player:stateChanged', handler)
  },
  onLibraryProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('library:progress', handler)
    return () => ipcRenderer.removeListener('library:progress', handler)
  },

  mixer: {
    load: (channel, filepath) => ipcRenderer.invoke('mixer-load', channel, filepath),
    play: (channel) => ipcRenderer.invoke('mixer-play', channel),
    pause: (channel) => ipcRenderer.invoke('mixer-pause', channel),
    stop: (channel) => ipcRenderer.invoke('mixer-stop', channel),
    setVolume: (channel, volume) => ipcRenderer.invoke('mixer-set-volume', channel, volume),
    setEq: (channel, bassAmount, midAmount, highAmount) => ipcRenderer.invoke('mixer-set-eq', channel, bassAmount, midAmount, highAmount),
    setFilters: (channel, hpfAmount) => ipcRenderer.invoke('mixer-set-filters', channel, hpfAmount),
    setPitch: (channel, pitch) => ipcRenderer.invoke('mixer-set-pitch', channel, pitch),
    setReverb: (channel, level) => ipcRenderer.invoke('mixer-set-reverb', channel, level),
    seek: (channel, seconds) => ipcRenderer.invoke('mixer-seek', channel, seconds),
    getTime: (channel) => ipcRenderer.invoke('mixer-get-time', channel),
    getDuration: (channel) => ipcRenderer.invoke('mixer-get-duration', channel),
    isPlaying: (channel) => ipcRenderer.invoke('mixer-is-playing', channel),
    getLevel: (channel) => ipcRenderer.invoke('mixer-get-level', channel),
    getFFT: (channel) => ipcRenderer.invoke('mixer-get-fft', channel),
    getActiveFFT: () => ipcRenderer.invoke('mixer-get-active-fft'),
    syncAll: (state) => ipcRenderer.invoke('mixer-sync-all', state),
    setEcho: (channel, wet, feedback, delayMs) => ipcRenderer.invoke('mixer-set-echo', channel, wet, feedback, delayMs),
    setLoop: (channel, startSec, endSec) => ipcRenderer.invoke('mixer-set-loop', channel, startSec, endSec),
    ping: (msg) => ipcRenderer.invoke('mixer-ping', msg),
    getWaveform: (channel) => ipcRenderer.invoke('mixer-get-waveform', channel)
  },

  // YouTube Addon
  ytSearch: (query, platform) => ipcRenderer.invoke('yt:search', query, platform),
  ytDownload: (urlOrQuery) => ipcRenderer.invoke('yt:download', urlOrQuery),
  onLibraryUpdated: (callback) => ipcRenderer.on('library:updated', (_event) => callback()),

  // Download Manager
  getDownloadTasks: () => ipcRenderer.invoke('dl:get-tasks'),
  cancelDownload: (taskId) => ipcRenderer.send('dl:cancel', taskId),
  clearFinishedDownloads: () => ipcRenderer.send('dl:clear-finished'),
  onDownloadQueueUpdated: (callback) => ipcRenderer.on('dl:queue-updated', (_event, queue) => callback(queue)),
  onDownloadProgress: (callback) => ipcRenderer.on('dl:progress', (_event, data) => callback(data)),

  onMediaPlayPause: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('media-play-pause', handler)
    return () => ipcRenderer.removeListener('media-play-pause', handler)
  },
  onMediaNextTrack: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('media-next-track', handler)
    return () => ipcRenderer.removeListener('media-next-track', handler)
  },
  onMediaPreviousTrack: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('media-previous-track', handler)
    return () => ipcRenderer.removeListener('media-previous-track', handler)
  },
  saveDebugLog: (data) => ipcRenderer.invoke('saveDebugLog', data),
  getResourceUsage: () => ipcRenderer.invoke('getResourceUsage')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('peerifyAPI', api)
  } catch (error) { console.error(error) }
} else {
  window.electron = electronAPI
  window.peerifyAPI = api
}
