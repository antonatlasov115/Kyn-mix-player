import { writable } from 'svelte/store';

// Default settings
const defaultSettings = {
    uiScale: 1.0,
    theme: 'default',
    crossfadeSeconds: 4,
    useDropAlignment: true,
    autoCutSilence: true,
    showMascotName: true,
    showMascot: true,
    showDebug: false,
    mascotBlur: 1.0,
    mascotAberration: 1.0,
    mascotRipple: 1.0,
    mascotGhosts: 0.5,
    mascotSensitivity: 1.0,
    latencyMs: 100,
    maxConcurrentDownloads: 3,
    youtubeCookiesBrowser: 'chrome',
    mascotCustomSkin: {},
    mascotSkin: 'default',
    mascotScale: 1.0,
    performanceProfile: 'epic',
    libraryFolders: [],
    mixStyle: 'auto',
    normalization: false,
    intelliGainEnabled: true,
    vibrantBassEnabled: true,
    spatialProfile: 'none',
    doubleDropMode: false,
    autoDownloadCovers: false,
    sidebarCollapsed: false,
    mascotProfaneMode: false,
    mascotLyricsMode: false,
    autoDownloadLyrics: false,
    aiSearchEnabled: true,
    // Pro-Audio Engine Constants
    proBassCrossover: 0.75,
    proMidCrossover: 0.95,
    proHighEntryDelay: 0.45,
    proCurveExpo: 3.5,
    proIncomingSwell: 1.2,
    isLoaded: false
};

function createSettings() {
    const { subscribe, set, update } = writable(defaultSettings);

    // Initial load from Electron API if available
    if (window.peerifyAPI && window.peerifyAPI.getSettings) {
        window.peerifyAPI.getSettings().then(saved => {
            if (saved) {
                update(s => ({ ...s, ...saved, isLoaded: true }));
            } else {
                update(s => ({ ...s, isLoaded: true }));
            }
        }).catch(() => {
            update(s => ({ ...s, isLoaded: true }));
        });
    } else {
        // Fallback for browser testing
        update(s => ({ ...s, isLoaded: true }));
    }

    const save = (val) => {
        if (val.isLoaded && window.peerifyAPI && window.peerifyAPI.saveSettings) {
            window.peerifyAPI.saveSettings(val);
        }
    };

    return {
        subscribe,
        set: (val) => {
            set(val);
            save(val);
        },
        update: (updater) => {
            update(s => {
                const newVal = updater(s);
                save(newVal);
                return newVal;
            });
        }
    };
}

export const settings = createSettings();
