import { ipcMain, powerSaveBlocker } from 'electron'

export class AudioIPC {
    constructor(mainWindow, lib, players) {
        this.mainWindow = mainWindow
        this.lib = lib
        this.players = players
        this.powerId = -1
    }

    register() {
        const {
            Player_LoadAndPlay, Player_TogglePlay, Player_SetVolume, Player_GetPlaybackTime,
            Player_GetDuration, Player_GetState, Player_SeekTo, Player_GetStats,
            Player_GetAudioDevices, Player_SetAudioConfig, Player_SetLatency,
            Player_SetEngine, Player_GetEngine, Mixer_SetPitch, Mixer_SetReverb,
            Mixer_LoadTrack, Mixer_PlayTrack, Mixer_PauseTrack, Mixer_StopTrack,
            Mixer_SetVolume, Mixer_SetEq, Mixer_SetFilters, Mixer_SeekTrack,
            Mixer_GetTime, Mixer_GetDuration, Mixer_IsPlaying, Mixer_GetLevel,
            Mixer_GetFFT, Mixer_GetActiveFFT, Mixer_GetWaveform, DJ_PreloadNext, DJ_Automix,
            Mixer_SetEcho, Mixer_SetLoop, Player_SetNormalization,
            fftBuffer, waveformBuffer
        } = this.players

        ipcMain.handle('set-normalization', async (e, enabled) => {
            try {
                if (Player_SetNormalization) Player_SetNormalization(enabled)
                return true
            } catch (err) {
                console.error('[AudioIPC] set-normalization error:', err)
                return false
            }
        })

        ipcMain.handle('playTrack', async (e, filepath, bpm) => {
            try {
                const cleanPath = filepath.replace(/(^"|"$)/g, '').replace(/\\/g, '/')
                return await new Promise((resolve) => Player_LoadAndPlay.async(cleanPath, bpm, (err, res) => resolve(res || false)))
            } catch (err) {
                console.error(`[AudioIPC] Failed to playTrack '${filepath}':`, err)
                return false
            }
        })

        ipcMain.handle('automix', async (e, filepath, bpm, fadeMs, curveTypeStr, dropSwapMs, inSeekMs) => {
            try {
                let curveType = 0
                if (curveTypeStr === 'linear') curveType = 1
                else if (curveTypeStr === 'cut') curveType = 2
                const cleanPath = filepath.replace(/(^"|"$)/g, '').replace(/\\/g, '/')
                const isPreloaded = await new Promise((resolve) => DJ_PreloadNext.async(cleanPath, bpm, (err, res) => resolve(res || false)))
                if (isPreloaded) {
                    return await new Promise((resolve) => DJ_Automix.async(fadeMs ?? 4000, curveType, dropSwapMs ?? 0, inSeekMs ?? 0, (err, res) => resolve(res || false)))
                }
                return false
            } catch (err) {
                console.error(`[AudioIPC] Failed automix for '${filepath}':`, err)
                return false
            }
        })

        ipcMain.handle('togglePlay', async () => { try { Player_TogglePlay() } catch (err) { console.error('[AudioIPC] togglePlay error:', err) } })
        ipcMain.handle('setVolume', async (e, volume) => { try { Player_SetVolume(volume) } catch (err) { console.error(`[AudioIPC] setVolume(${volume}) error:`, err) } })
        ipcMain.handle('getCurrentTime', async () => { try { return Player_GetPlaybackTime() } catch (err) { console.error('[AudioIPC] getCurrentTime error:', err); return 0 } })
        ipcMain.handle('getDuration', async () => { try { return Player_GetDuration() } catch (err) { console.error('[AudioIPC] getDuration error:', err); return 0 } })

        ipcMain.handle('isPlaying', async () => {
            try {
                const state = await new Promise((resolve) => Player_GetState.async((err, res) => resolve(res)))
                const playing = state === 2
                if (playing && this.powerId === -1) {
                    this.powerId = powerSaveBlocker.start('prevent-app-suspension')
                } else if (!playing && this.powerId !== -1) {
                    powerSaveBlocker.stop(this.powerId)
                    this.powerId = -1
                }
                return playing
            } catch (err) {
                console.error('[AudioIPC] isPlaying error:', err)
                return false
            }
        })

        ipcMain.handle('seekTo', async (e, seconds) => { try { Player_SeekTo(seconds) } catch (err) { console.error(`[AudioIPC] seekTo(${seconds}) error:`, err) } })
        ipcMain.handle('setPitch', async (e, pitch) => { try { Mixer_SetPitch(0, pitch); Mixer_SetPitch(1, pitch); } catch (err) { console.error(`[AudioIPC] setPitch(${pitch}) error:`, err) } })
        ipcMain.handle('setReverb', async (e, level) => { try { Mixer_SetReverb(0, level); Mixer_SetReverb(1, level); } catch (err) { console.error(`[AudioIPC] setReverb(${level}) error:`, err) } })

        ipcMain.handle('getStats', async () => {
            try {
                const bufferSize = 512
                const outBuffer = Buffer.alloc(bufferSize, 0)
                Player_GetStats(outBuffer, bufferSize)

                // Stop at the first null terminator to avoid parsing trailing junk
                const nullIdx = outBuffer.indexOf(0)
                const jsonStr = nullIdx !== -1
                    ? outBuffer.toString('utf8', 0, nullIdx).trim()
                    : outBuffer.toString('utf8').trim()

                return jsonStr ? JSON.parse(jsonStr) : null
            } catch (err) {
                console.error('[AudioIPC] getStats format error:', err)
                return null
            }
        })

        ipcMain.handle('getAudioDevices', async () => {
            try {
                const bufferSize = 8192
                const outBuffer = Buffer.alloc(bufferSize)
                Player_GetAudioDevices(outBuffer, bufferSize)
                const jsonStr = outBuffer.toString('utf8').replace(/\0/g, '')
                return JSON.parse(jsonStr)
            } catch (err) {
                console.error('[AudioIPC] getAudioDevices logic error:', err)
                return []
            }
        })

        ipcMain.handle('setAudioConfig', async (e, exclusive, latencyMs, deviceIndex) => {
            try {
                return await new Promise((resolve) => Player_SetAudioConfig.async(exclusive, latencyMs, deviceIndex ?? -1, (err, res) => resolve(res || false)))
            } catch (err) {
                console.error(`[AudioIPC] setAudioConfig(i=${deviceIndex}, ex=${exclusive}, lat=${latencyMs}) error:`, err)
                return false
            }
        })

        ipcMain.handle('setLatency', async (e, ms) => { try { Player_SetLatency(ms); return true } catch (err) { console.error(`[AudioIPC] setLatency(${ms}) error:`, err); return false } })
        ipcMain.handle('setEngine', async (e, usePro) => { try { Player_SetEngine(usePro); return true } catch (err) { console.error(`[AudioIPC] setEngine(${usePro}) error:`, err); return false } })
        ipcMain.handle('getEngine', async () => { try { return Player_GetEngine() } catch (err) { console.error('[AudioIPC] getEngine error:', err); return true } })

        // Mixer batch sync
        ipcMain.handle('mixer-sync-all', async (e, state) => {
            try {
                for (let ch = 0; ch <= 1; ch++) {
                    const p = `c${ch}`
                    Mixer_SetVolume(ch, state[`${p}Vol`] ?? 1.0)
                    Mixer_SetPitch(ch, state[`${p}Pitch`] ?? 1.0)
                    Mixer_SetReverb(ch, state[`${p}Reverb`] ?? 0)
                    Mixer_SetEq(ch, state[`${p}Bass`] ?? 0, state[`${p}Mid`] ?? 0, state[`${p}High`] ?? 0)
                    Mixer_SetFilters(ch, state[`${p}HPF`] ?? 0)
                }
                return true
            } catch (err) {
                console.error('[AudioIPC] mixer-sync-all mapping error:', err)
                return false
            }
        })

        // Echo and Loop controls
        ipcMain.handle('mixer-set-echo', async (e, ch, wet, feedback, delayMs) => {
            try { if (Mixer_SetEcho) Mixer_SetEcho(ch, wet, feedback, delayMs); return true } catch (err) { return false }
        })
        ipcMain.handle('mixer-set-loop', async (e, ch, startSec, endSec) => {
            try { if (Mixer_SetLoop) Mixer_SetLoop(ch, startSec, endSec); return true } catch (err) { return false }
        })

        // Individual mixer controls
        ipcMain.handle('mixer-load', async (e, ch, path) => {
            return await new Promise((res) => Mixer_LoadTrack.async(ch, path.replace(/(^"|"$)/g, '').replace(/\\/g, '/'), 120.0, (err, r) => res(r)))
        })
        ipcMain.handle('mixer-play', async (e, ch) => { Mixer_PlayTrack(ch); return true })
        ipcMain.handle('mixer-pause', async (e, ch) => { Mixer_PauseTrack(ch); return true })
        ipcMain.handle('mixer-stop', async (e, ch) => { Mixer_StopTrack(ch); return true })
        ipcMain.handle('mixer-set-volume', async (e, ch, vol) => { Mixer_SetVolume(ch, vol); return true })
        ipcMain.handle('mixer-seek', async (e, ch, sec) => { Mixer_SeekTrack(ch, sec); return true })
        ipcMain.handle('mixer-get-time', async (e, ch) => { return Mixer_GetTime(ch) })
        ipcMain.handle('mixer-get-duration', async (e, ch) => { return Mixer_GetDuration(ch) })
        ipcMain.handle('mixer-is-playing', async (e, ch) => { return Mixer_IsPlaying(ch) })
        ipcMain.handle('mixer-get-level', async (e, ch) => { return Mixer_GetLevel(ch) })
        ipcMain.handle('mixer-get-waveform', async (e, ch) => {
            try {
                const count = Mixer_GetWaveform(ch, waveformBuffer, 4000)
                if (count > 0) {
                    const waveView = new Float32Array(waveformBuffer.buffer, waveformBuffer.byteOffset, count)
                    const copy = new Float32Array(count)
                    copy.set(waveView)
                    return Array.from(copy)
                }
            } catch (err) {
                console.error(`[AudioIPC] mixer-get-waveform(ch=${ch}) error:`, err)
            }
            return []
        })

        ipcMain.handle('mixer-get-fft', async (e, ch) => {
            try {
                if (Mixer_GetFFT(ch, fftBuffer) > 0) {
                    const fftView = new Float32Array(fftBuffer.buffer, fftBuffer.byteOffset, 256)
                    const copy = new Float32Array(256)
                    copy.set(fftView)
                    return copy
                }
            } catch (err) {
                console.error(`[AudioIPC] mixer-get-fft(ch=${ch}) memory access error:`, err)
            }
            return null
        })

        ipcMain.handle('mixer-get-active-fft', async () => {
            try {
                if (Mixer_GetActiveFFT(fftBuffer) > 0) {
                    const fftView = new Float32Array(fftBuffer.buffer, fftBuffer.byteOffset, 256)
                    const copy = new Float32Array(256)
                    copy.set(fftView)
                    return copy
                }
            } catch (err) {
                console.error('[AudioIPC] mixer-get-active-fft memory access error:', err)
            }
            return null
        })
    }
}
