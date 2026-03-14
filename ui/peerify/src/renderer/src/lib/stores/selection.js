import { writable } from 'svelte/store';

function createSelectionStore() {
    const { subscribe, set, update } = writable({
        selectedTracks: [], // Array of track objects
        selectedPaths: new Set(), // Set of filePaths for O(1) lookup
        activeView: null    // 'library', 'playlist', 'queue'
    });

    return {
        subscribe,
        toggleTrack: (track) => update(s => {
            const has = s.selectedPaths.has(track.filePath);
            const newPaths = new Set(s.selectedPaths);
            if (has) {
                newPaths.delete(track.filePath);
                return { 
                    ...s, 
                    selectedTracks: s.selectedTracks.filter(t => t.filePath !== track.filePath),
                    selectedPaths: newPaths
                };
            }
            newPaths.add(track.filePath);
            return { 
                ...s, 
                selectedTracks: [...s.selectedTracks, track],
                selectedPaths: newPaths
            };
        }),
        selectMultiple: (tracks) => update(s => {
            const newPaths = new Set(s.selectedPaths);
            const toAdd = tracks.filter(t => !newPaths.has(t.filePath));
            toAdd.forEach(t => newPaths.add(t.filePath));
            return { 
                ...s, 
                selectedTracks: [...s.selectedTracks, ...toAdd],
                selectedPaths: newPaths
            };
        }),
        clear: () => set({ selectedTracks: [], selectedPaths: new Set(), activeView: null }),
        setTracks: (tracks) => update(s => ({ 
            ...s, 
            selectedTracks: tracks,
            selectedPaths: new Set(tracks.map(t => t.filePath))
        }))
    };
}

export const selection = createSelectionStore();
