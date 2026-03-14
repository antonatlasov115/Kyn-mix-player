import { library } from '../stores/library';
import { playback } from '../stores/playback';
import { settings } from '../stores/settings';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { playbackManager } from './PlaybackManager';
import { fixPath } from '../utils';

class LibraryManager {
    constructor() {
        this.cleanupHandlers = [];
    }

    init() {
        // Clear existing handlers if any
        this.cleanupHandlers.forEach(fn => fn());
        this.cleanupHandlers = [];

        if (window.peerifyAPI?.onLibraryUpdated) {
            this.cleanupHandlers.push(window.peerifyAPI.onLibraryUpdated(() => this.loadLibrary()));
        }

        if (window.peerifyAPI?.onLibraryProgress) {
            this.cleanupHandlers.push(
                window.peerifyAPI.onLibraryProgress((data) => {
                    if (data.status === 'done') {
                        library.update(s => ({ ...s, isScanning: false, scanProgress: 0 }));
                        this.loadLibrary();
                    }
                })
            );
        }

        this.loadLibrary();
        this.loadPlaylists();
    }

    destroy() {
        this.cleanupHandlers.forEach(fn => fn());
        this.cleanupHandlers = [];
    }

    async loadLibrary() {
        if (window.peerifyAPI?.getLocalLibrary) {
            try {
                const tracks = (await window.peerifyAPI.getLocalLibrary()) || [];
                const indexedTracks = tracks.map(t => ({
                    ...t,
                    fixedThumbnail: t.thumbnail ? fixPath(t.thumbnail) : null,
                    // Pre-compute search index with all fields including filename
                    search_index: `${t.title || ''} ${t.artist || ''} ${t.album || ''} ${t.genre || ''} ${t.query || ''} ${t.filePath.split(/[\\/]/).pop()}`.toLowerCase()
                }));
                library.update(s => ({ ...s, tracks: indexedTracks }));
            } catch (e) {
                console.error('Failed to load library:', e);
            }
        }
    }

    async loadPlaylists() {
        if (window.peerifyAPI?.getPlaylists) {
            const playlists = await window.peerifyAPI.getPlaylists();
            library.update(s => ({ ...s, playlists: playlists || [] }));
        }
    }

    async createEmptyPlaylist(name) {
        if (window.peerifyAPI?.savePlaylist) {
            const resultName = await window.peerifyAPI.savePlaylist(name, []);
            if (resultName) {
                await this.loadPlaylists();
                const playlists = get(library).playlists;
                // Match by name or index as fallback
                const newPlaylist = playlists.find(p => p.name === resultName) || playlists[0];
                if (newPlaylist) {
                    this.openPlaylist(newPlaylist);
                }
            }
            return !!resultName;
        }
        return false;
    }

    async createPlaylistFromTracks(name, tracks) {
        if (window.peerifyAPI?.savePlaylist) {
            const resultName = await window.peerifyAPI.savePlaylist(name, tracks);
            if (resultName) {
                await this.loadPlaylists();
                const playlists = get(library).playlists;
                const newPlaylist = playlists.find(p => p.name === resultName) || playlists[0];
                if (newPlaylist) {
                    this.openPlaylist(newPlaylist);
                }
            }
            return !!resultName;
        }
        return false;
    }

    async createPlaylistFromSelection(selectionTracks, name) {
        if (!selectionTracks?.length) return false;
        const playlistName = name || `Mix ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        const tracksForPlaylist = selectionTracks.map((t, i) => ({
            track: t,
            id: Date.now() + i + Math.random(),
            crossfade: 4,
            curve: 'equal',
            offset: 0
        }));

        return await this.createPlaylistFromTracks(playlistName, tracksForPlaylist);
    }

    openPlaylist(playlist) {
        library.update(s => ({
            ...s,
            activeTab: 'playlists',
            selectedPlaylist: playlist
        }));
        playback.update(s => ({
            ...s,
            statusMessage: `${get(t)('playlist_saved')}: ${playlist.name}`
        }));
    }

    async savePlaylist(name, tracks) {
        if (window.peerifyAPI?.savePlaylist) {
            const resultName = await window.peerifyAPI.savePlaylist(name, tracks);
            if (resultName) {
                await this.loadPlaylists();
                playback.update(s => ({
                    ...s,
                    statusMessage: `${get(t)('playlist_saved') || 'Saved Playlist'}: ${resultName}`
                }));
            }
            return !!resultName;
        }
        return false;
    }

    async handleAddFolder() {
        const path = await window.peerifyAPI?.selectDirectory();
        const currentFolders = get(settings).libraryFolders;
        if (path && !currentFolders.includes(path)) {
            const newFolders = [...currentFolders, path];
            settings.update(s => ({ ...s, libraryFolders: newFolders }));
            library.update(s => ({ ...s, isScanning: true }));
            playback.update(s => ({ ...s, statusMessage: get(t)('starting_ai_scan') }));
            try {
                const found = await window.peerifyAPI.buildLibrary(path);
                if (found >= 0) {
                    playback.update(s => ({ ...s, statusMessage: `${get(t)('indexed_tracks_count')} ${found}` }));
                    await this.loadLibrary();
                }
            } finally {
                library.update(s => ({ ...s, isScanning: false }));
            }
        }
    }

    async handleScan() {
        const libraryFolders = get(settings).libraryFolders;
        if (!libraryFolders.length) return;
        playback.update(s => ({ ...s, statusMessage: get(t)('starting_ai_scan') }));
        library.update(s => ({ ...s, isScanning: true }));
        try {
            let total = 0;
            for (const folder of libraryFolders) {
                const count = await window.peerifyAPI.buildLibrary(folder);
                if (count >= 0) total += count;
            }
            playback.update(s => ({ ...s, statusMessage: `${get(t)('indexed_tracks_count')} ${total}` }));
            await this.loadLibrary();
        } finally {
            library.update(s => ({ ...s, isScanning: false }));
        }
    }

    async handleRemoveFolder(path) {
        if (!confirm(get(t)('confirm_delete_folder'))) return;
        playback.update(s => ({ ...s, statusMessage: get(t)('deleting_folder') }));
        const libraryFolders = get(settings).libraryFolders;
        const newFolders = libraryFolders.filter((f) => f !== path);
        settings.update(s => ({ ...s, libraryFolders: newFolders }));
        if (window.peerifyAPI.removeFolderTracks) await window.peerifyAPI.removeFolderTracks(path);
        await this.loadLibrary();
        playback.update(s => ({ ...s, statusMessage: get(t)('folder_deleted') }));
    }

    async handleDeleteTrack(track) {
        if (!window.peerifyAPI.removeTrackFromLibrary) return;
        if (confirm(get(t)('confirm_delete_track'))) {
            if (await window.peerifyAPI.removeTrackFromLibrary(track.filePath)) {
                playback.update(s => ({ ...s, statusMessage: get(t)('track_deleted_msg') }));
                await this.loadLibrary();
            }
        }
    }

    async handleDeleteMultiple(tracks) {
        if (!tracks?.length || !window.peerifyAPI.removeTrackFromLibrary) return;
        
        const confirmMsg = get(t)('confirm_delete_multiple').replace('{count}', tracks.length);
        if (confirm(confirmMsg)) {
            let deletedCount = 0;
            for (const track of tracks) {
                const success = await window.peerifyAPI.removeTrackFromLibrary(track.filePath);
                if (success) deletedCount++;
            }
            
            if (deletedCount > 0) {
                playback.update(s => ({ 
                    ...s, 
                    statusMessage: `${get(t)('track_deleted_msg')} (${deletedCount})` 
                }));
                await this.loadLibrary();
            }
        }
    }

    async handleDeletePlaylist(playlist) {
        if (!window.peerifyAPI.deletePlaylist) return;
        if (confirm(get(t)('confirm_delete_playlist'))) {
            if (await window.peerifyAPI.deletePlaylist(playlist.name)) {
                playback.update(s => ({ ...s, statusMessage: get(t)('playlist_deleted') }));
                await this.loadPlaylists();
            }
        }
    }

    async duplicatePlaylist(playlist) {
        if (!window.peerifyAPI?.savePlaylist) return;
        const newName = `${playlist.name} (Copy)`;
        const result = await window.peerifyAPI.savePlaylist(newName, playlist.tracks || []);
        if (result) {
            await this.loadPlaylists();
            playback.update(s => ({ ...s, statusMessage: `Duplicated: ${newName}` }));
        }
    }

    async renamePlaylist(playlist, newName) {
        if (!newName?.trim() || newName.trim() === playlist.name) return false;
        if (!window.peerifyAPI?.savePlaylist || !window.peerifyAPI?.deletePlaylist) return false;
        const trimmedName = newName.trim();
        const saved = await window.peerifyAPI.savePlaylist(trimmedName, playlist.tracks || []);
        if (saved) {
            await window.peerifyAPI.deletePlaylist(playlist.name);
            await this.loadPlaylists();
            playback.update(s => ({ ...s, statusMessage: `Renamed to: ${trimmedName}` }));
            return true;
        }
        return false;
    }

    async handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropPaths = Array.from(e.dataTransfer.files)
            .map((f) => f.path)
            .filter((p) => p?.length > 0);
        if (dropPaths.length > 0) {
            playback.update(s => ({ ...s, statusMessage: get(t)('starting_ai_scan') }));
            library.update(s => ({ ...s, isScanning: true }));
            try {
                const found = await window.peerifyAPI.buildLibrary(dropPaths);
                if (found >= 0) {
                    playback.update(s => ({ ...s, statusMessage: get(t)('indexed_tracks_count') + found }));
                    await this.loadLibrary();
                    library.update(s => ({ ...s, activeTab: 'library' }));
                }
            } finally {
                library.update(s => ({ ...s, isScanning: false }));
            }
        }
    }

    async saveCurrentQueue(name) {
        const p = get(playback);
        if (await window.peerifyAPI?.savePlaylist(name, p.playQueue)) {
            playback.update(s => ({ ...s, statusMessage: get(t)('playlist_saved') }));
            await this.loadPlaylists();
        }
    }

    async handleImportM3U() {
        const path = await window.peerifyAPI?.selectAudioFile(); // Re-using audio file picker for .m3u
        if (path) {
            const imported = await window.peerifyAPI.importM3U(path);
            if (imported) {
                await this.createPlaylistFromTracks(imported.name, imported.tracks);
                playback.update(s => ({ ...s, statusMessage: `Imported: ${imported.name}` }));
            }
        }
    }

    async handleExportM3U(playlist) {
        // Implementation might need a Save Dialog, assuming selectDirectory or similar for now
        const targetDir = await window.peerifyAPI?.selectDirectory();
        if (targetDir && playlist) {
            const fileName = `${playlist.name.replace(/[<>:"/\\|?*➜]/g, '_')}.m3u8`;
            const fullPath = `${targetDir}/${fileName}`;
            const success = await window.peerifyAPI.exportM3U(playlist.name, playlist.tracks, fullPath);
            if (success) {
                playback.update(s => ({ ...s, statusMessage: `Exported to ${fileName}` }));
            }
        }
    }

    async loadPlaylistToQueue(tracks) {
        if (!tracks?.length) return;
        const s = get(settings);

        const standardized = tracks
            .map((item, i) => {
                const trackObj = item.track || item;
                return {
                    track: trackObj,
                    crossfade: item.crossfade ?? s.crossfadeSeconds,
                    pitch: item.pitch,
                    reverb: item.reverb,
                    curve: item.curve || 'equal',
                    automation: item.automation || null,
                    offset: item.offset || 0,
                    id: item.id || Date.now() + i + Math.random()
                };
            })
            .filter((item) => item.track?.filePath || item.track?.filepath);

        if (standardized.length === 0) return;

        library.update(s => ({ ...s, activeTab: 'queue' }));
        const first = standardized[0];
        const remaining = standardized.slice(1);

        playback.update(s => ({
            ...s,
            playQueue: remaining,
            statusMessage: `${get(t)('mix_started')} (${standardized.length})`
        }));
        await playbackManager.playLocalTrack(first.track, {
            pitch: first.pitch,
            reverb: first.reverb,
            automation: first.automation
        });
    }

    handleEditMix(tracks, setEditorTracks) {
        if (!tracks || tracks.length < 2) return;
        setEditorTracks(tracks[0].track.filePath, tracks[1].track.filePath);
        library.update(s => ({ ...s, activeTab: 'studio' }));
    }

    async handleSaveRecipe(detail) {
        const { track1, track2, curveType: transitionCurve, offset, crossfadeDuration, pitch2, automation } = detail;
        const l = get(library);
        const s = get(settings);

        if (!track1 || !track2) {
            playback.update(s => ({ ...s, statusMessage: get(t)('need_two_tracks') }));
            return;
        }

        const t1Obj = l.tracks.find((t) => t.filePath === track1) || { filePath: track1, title: track1.split(/[\\/]/).pop(), genre: 'Mix' };
        const t2Obj = l.tracks.find((t) => t.filePath === track2) || { filePath: track2, title: track2.split(/[\\/]/).pop(), genre: 'Mix' };

        const mixName = prompt(get(t)('playlist_name_placeholder')) || `${t1Obj.title} ➜ ${t2Obj.title}`;

        const tracksForPlaylist = [
            {
                id: Date.now(),
                track: t1Obj,
                crossfade: 4,
                curve: 'equal',
                pitch: 1.0,
                reverb: false
            },
            {
                id: Date.now() + 1,
                track: t2Obj,
                crossfade: crossfadeDuration || s.crossfadeSeconds,
                curve: transitionCurve || 'equal',
                offset: offset || 0,
                pitch: pitch2 || 1.0,
                automation: automation || null
            }
        ];

        const success = await this.savePlaylist(mixName, tracksForPlaylist);
        if (success) {
            playback.update(s => ({ ...s, statusMessage: get(t)('playlist_saved') }));
            library.update(s => ({ ...s, activeTab: 'playlists' }));
        }
    }
}

export const libraryManager = new LibraryManager();
