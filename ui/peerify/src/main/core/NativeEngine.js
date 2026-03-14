import { app, dialog } from 'electron'
import path from 'path'
import fsSync from 'fs'
import koffi from 'koffi'

class NativeEngine {
    constructor() {
        this.lib = null;
        this.functions = {};
        this.fftBuffer = Buffer.alloc(256 * 4);
        this.waveformBuffer = Buffer.alloc(4000 * 4);
        this.eventPollerId = null;
    }

    init() {
        const isProd = app.isPackaged;
        const CORE_DIR = isProd
            ? path.join(process.resourcesPath, 'core')
            : path.join(process.cwd(), 'core');

        if (process.platform === 'win32') {
            process.env.PATH = `${CORE_DIR};${process.env.PATH}`;
        }

        const DLL_PATH = path.join(CORE_DIR, 'peerify_core.dll');

        try {
            if (!fsSync.existsSync(DLL_PATH)) {
                throw new Error(`peerify_core.dll not found at ${DLL_PATH}`);
            }
            this.lib = koffi.load(DLL_PATH);
            this._loadFunctions();

            if (this.functions.Player_Init) {
                this.functions.Player_Init.async((err, success) => {
                    if (!success && app.isReady()) dialog.showErrorBox('Audio Engine Error', 'The audio engine failed to initialize.');
                });
            }
            return true;
        } catch (err) {
            console.error('[FATAL] Failed to load peerify_core.dll:', err);
            app.whenReady().then(() => {
                dialog.showErrorBox(
                    'Audio Engine Load Failure',
                    `Failed to load the audio engine.\n\nPath: ${DLL_PATH}\nError: ${err.message}\n\nIMPORTANT: Please install "Microsoft Visual C++ Redistributable 2022 (x64)".`
                );
                app.quit();
            });
            return false;
        }
    }

    _loadFunctions() {
        const PlayerEvent = koffi.struct('PlayerEvent', { type: 'int', state: 'int' });
        this.PlayerEventType = PlayerEvent;

        this.functions = {
            AI_AnalyzeLibrary: this.lib.func('AI_AnalyzeLibrary', 'int', ['str']),
            AI_GetProgress: this.lib.func('AI_GetProgress', 'void', [koffi.out('int*'), koffi.out('int*')]),
            AI_GetNextSimilar: this.lib.func('AI_GetNextSimilar', 'int', ['str', koffi.out('char*'), 'int']),

            Player_Init: this.lib.func('Player_Init', 'bool', []),
            Player_Shutdown: this.lib.func('Player_Shutdown', 'void', []),
            Player_PollEvent: this.lib.func('Player_PollEvent', 'bool', [koffi.out(koffi.pointer(PlayerEvent))]),
            Player_LoadAndPlay: this.lib.func('Player_LoadAndPlay', 'bool', ['str', 'float']),
            Player_TogglePlay: this.lib.func('Player_TogglePlay', 'void', []),
            Player_SetVolume: this.lib.func('Player_SetVolume', 'void', ['float']),
            Player_SeekTo: this.lib.func('Player_SeekTo', 'void', ['float']),
            Player_GetDuration: this.lib.func('Player_GetDuration', 'float', []),
            Player_GetPlaybackTime: this.lib.func('Player_GetPlaybackTime', 'float', []),
            Player_GetState: this.lib.func('Player_GetState', 'int', []),
            Player_GetStats: this.lib.func('Player_GetStats', 'void', [koffi.out('char*'), 'int']),
            Player_SetAudioConfig: this.lib.func('Player_SetAudioConfig', 'bool', ['bool', 'int', 'int']),
            Player_GetAudioDevices: this.lib.func('Player_GetAudioDevices', 'void', [koffi.out('char*'), 'int']),
            Player_SetLatency: this.lib.func('Player_SetLatency', 'void', ['int']),
            Player_SetEngine: this.lib.func('Player_SetEngine', 'void', ['bool']),
            Player_GetEngine: this.lib.func('Player_GetEngine', 'bool', []),
            Mixer_SetPitch: this.lib.func('Mixer_SetPitch', 'void', ['int', 'float']),
            Mixer_SetReverb: this.lib.func('Mixer_SetReverb', 'void', ['int', 'float']),
            Mixer_LoadTrack: this.lib.func('Mixer_LoadTrack', 'bool', ['int', 'str', 'float']),
            Mixer_PlayTrack: this.lib.func('Mixer_PlayTrack', 'void', ['int']),
            Mixer_PauseTrack: this.lib.func('Mixer_PauseTrack', 'void', ['int']),
            Mixer_StopTrack: this.lib.func('Mixer_StopTrack', 'void', ['int']),
            Mixer_SetVolume: this.lib.func('Mixer_SetVolume', 'void', ['int', 'float']),
            Mixer_SetEq: this.lib.func('Mixer_SetEq', 'void', ['int', 'float', 'float', 'float']),
            Mixer_SetFilters: this.lib.func('Mixer_SetFilters', 'void', ['int', 'float']),
            Mixer_SeekTrack: this.lib.func('Mixer_SeekTrack', 'void', ['int', 'float']),
            Mixer_GetTime: this.lib.func('Mixer_GetTime', 'float', ['int']),
            Mixer_GetDuration: this.lib.func('Mixer_GetDuration', 'float', ['int']),
            Mixer_IsPlaying: this.lib.func('Mixer_IsPlaying', 'bool', ['int']),
            Mixer_GetLevel: this.lib.func('Mixer_GetLevel', 'float', ['int']),
            Mixer_GetFFT: this.lib.func('Mixer_GetFFT', 'int', ['int', koffi.out('void*')]),
            Mixer_GetActiveFFT: this.lib.func('Mixer_GetActiveFFT', 'int', [koffi.out('void*')]),
            Mixer_GetWaveform: this.lib.func('Mixer_GetWaveform', 'int', ['int', koffi.out('void*'), 'int']),
            DJ_PreloadNext: this.lib.func('DJ_PreloadNext', 'bool', ['str', 'float']),
            DJ_Automix: this.lib.func('DJ_Automix', 'bool', ['int', 'int', 'int', 'int']),
            Player_LoadVst: this.lib.func('Player_LoadVst', 'bool', ['str']),
            Player_RemoveVst: this.lib.func('Player_RemoveVst', 'void', []),
            Player_OpenVstEditor: this.lib.func('Player_OpenVstEditor', 'void', []),
            Mixer_SetEcho: this.lib.func('Mixer_SetEcho', 'void', ['int', 'float', 'float', 'float']),
            Mixer_SetLoop: this.lib.func('Mixer_SetLoop', 'void', ['int', 'float', 'float']),
            Player_SetNormalization: this.lib.func('Player_SetNormalization', 'void', ['bool'])
        };
    }

    startEventPoller(webContents) {
        if (!this.functions.Player_PollEvent) return;

        const eventBuffer = Buffer.alloc(koffi.sizeof(this.PlayerEventType));
        this.eventPollerId = setInterval(() => {
            if (!webContents || webContents.isDestroyed()) {
                this.stopEventPoller();
                return;
            }
            try {
                while (this.functions.Player_PollEvent(eventBuffer)) {
                    const event = koffi.decode(eventBuffer, this.PlayerEventType);
                    if (event.type === 1) {
                        webContents.send('player:stateChanged', event.state);
                    }
                }
            } catch (e) {
                // Ignore silent poll faults
            }
        }, 50);
    }

    stopEventPoller() {
        if (this.eventPollerId) {
            clearInterval(this.eventPollerId);
            this.eventPollerId = null;
        }
    }

    shutdown() {
        this.stopEventPoller();
        if (this.functions.Player_Shutdown) {
            try {
                console.log('[NativeEngine] Invoking Player_Shutdown...');
                this.functions.Player_Shutdown();
                console.log('[NativeEngine] Player_Shutdown completed');
            } catch (e) {
                console.error('[NativeEngine] Shutdown error:', e);
            }
        }
    }

    getAudioMap() {
        return {
            ...this.functions,
            fftBuffer: this.fftBuffer,
            waveformBuffer: this.waveformBuffer
        };
    }
}

export const nativeEngine = new NativeEngine();
