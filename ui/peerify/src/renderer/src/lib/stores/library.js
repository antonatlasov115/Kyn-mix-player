import { writable } from 'svelte/store';

export const library = writable({
    activeTab: 'home',
    tracks: [],
    playlists: [],
    isScanning: false,
    scanProgress: 0,
    searchQuery: '',
    selectedPlaylist: null
});
