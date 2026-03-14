import { writable } from 'svelte/store'

export const contextMenu = writable({
    show: false,
    x: 0,
    y: 0,
    track: null,
    mode: 'library',
    playlistItemIdx: -1
})

export function openContextMenu(x, y, track, mode, playlistItemIdx) {
    contextMenu.set({
        show: true,
        x,
        y,
        track,
        mode,
        playlistItemIdx
    })
}

export function closeContextMenu() {
    contextMenu.update(s => ({ ...s, show: false }))
}

export const isModalOpen = writable(false)
