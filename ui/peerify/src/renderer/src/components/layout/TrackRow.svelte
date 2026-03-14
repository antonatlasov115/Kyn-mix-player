<script>
  import { t } from '../../lib/i18n'
  import { selection } from '../../lib/stores/selection'
  import { fly } from 'svelte/transition'

  export let track
  export let index
  export let isCurrent = false
  export let isPlaying = false
  export let onPlay
  export let onAddQueue
  export let onDelete
  export let onRowClick = () => {}
  export let mode = 'library' // 'library' or 'playlist'
  export let playlistItemIdx = -1

  // If in playlist mode, the 'track' prop might be a trackItem wrap
  $: actualTrack = mode === 'playlist' && track.track ? track.track : track
  $: pitch = mode === 'playlist' ? track.pitch : null

  $: isSelected = $selection.selectedPaths.has(actualTrack.filePath || '')

  function toggleSelect(e) {
    if (e.ctrlKey || e.metaKey) {
      selection.toggleTrack(actualTrack)
    } else if (e.shiftKey) {
      // Shift logic is handled by parent TrackList
      const event = new CustomEvent('shiftSelect', { detail: { track: actualTrack, index } })
      document.dispatchEvent(event)
    } else {
      onRowClick(actualTrack, index)
    }
  }

  const formatDuration = (sec) => {
    if (!sec) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getBpm = (t) => {
    if (!t) return '120'
    if (t.bpm) return t.bpm.toString()
    if (t.title && typeof t.title === 'string') {
      return t.title.replace('BPM: ', '')
    }
    return '120'
  }

  import { openContextMenu } from '../../lib/stores/ui'

  function handleContextMenu(e) {
    e.preventDefault()
    openContextMenu(e.clientX, e.clientY, actualTrack, mode, playlistItemIdx)
  }

  let showNamingInput = false
  let newName = ''

  function startNaming(e) {
    if (e) e.stopPropagation()
    showNamingInput = true
    newName = ''
  }

  async function handleCreate(e) {
    if (e) e.stopPropagation()
    const finalName = newName.trim() || $t('new_playlist')
    await libraryManager.createPlaylistFromSelection([actualTrack], finalName)
    closeMenu()
  }

  function handleInputKeydown(e) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') closeMenu()
  }

  import { libraryManager } from '../../lib/managers/LibraryManager'
  import { library } from '../../lib/stores/library'

  async function addToExisting(playlist) {
    closeMenu()
    const updatedTracks = [
      ...playlist.tracks,
      {
        track: actualTrack,
        id: Date.now() + Math.random(),
        crossfade: 4
      }
    ]
    await libraryManager.savePlaylist(playlist.name, updatedTracks)
  }

  import { fixPath } from '../../lib/utils'

  function focusOnMount(node) {
    node.focus()
  }
</script>

<div
  role="button"
  aria-pressed={isSelected}
  tabindex="0"
  class="group grid gap-6 px-4 py-1.5 h-[52px] rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 hover:backdrop-blur-3xl transition-all duration-200 items-center text-sm
  {mode === 'library'
    ? 'grid-cols-[30px_40px_1fr_120px_80px_100px] max-[1000px]:grid-cols-[30px_40px_1fr_100px]'
    : 'grid-cols-[30px_40px_1fr_100px_100px]'}
  {isCurrent ? 'bg-accent-primary/5 backdrop-blur-3xl border-accent-primary/20 shadow-lg' : ''} 
  {isSelected ? 'bg-white/5 border-white/20' : ''}"
  on:click={toggleSelect}
  on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSelect(e)}
  on:contextmenu={handleContextMenu}
>
  <!-- Selection Checkbox -->
  <div class="flex items-center justify-center">
    <button
      class="w-4 h-4 rounded border {isSelected
        ? 'bg-accent-primary border-accent-primary'
        : 'border-white/20 hover:border-white/40'} transition-all flex items-center justify-center"
      on:click|stopPropagation={() => selection.toggleTrack(actualTrack)}
      aria-label="{isSelected ? 'Deselect' : 'Select'} track"
    >
      {#if isSelected}
        <svg
          class="w-3 h-3 text-black"
          fill="none"
          stroke="currentColor"
          stroke-width="4"
          viewBox="0 0 24 24"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      {/if}
    </button>
  </div>

  <!-- Index / Play Button -->
  <div class="text-center flex items-center justify-center relative w-full h-full">
    {#if isCurrent && isPlaying}
      <div class="flex items-end justify-center gap-[4px] h-5 w-6">
        <div
          class="w-1.5 bg-accent-primary rounded-t-sm animate-[bounce_0.8s_infinite] h-full shadow-[0_0_15px_var(--accent-glow)]"
        ></div>
        <div
          class="w-1.5 bg-accent-primary rounded-t-sm animate-[bounce_0.8s_infinite_0.1s] h-2/3 shadow-[0_0_15px_var(--accent-glow)]"
        ></div>
        <div
          class="w-1.5 bg-accent-primary rounded-t-sm animate-[bounce_0.8s_infinite_0.2s] h-full shadow-[0_0_15px_var(--accent-glow)]"
        ></div>
      </div>
    {:else}
      <span
        class="text-[11px] font-black text-text-main group-hover:hidden opacity-40 {isCurrent
          ? 'text-accent-primary opacity-100'
          : ''}"
      >
        {index + 1}
      </span>
      <button
        on:click|stopPropagation={() => onPlay(actualTrack, playlistItemIdx)}
        class="hidden group-hover:flex items-center justify-center text-black focus:outline-none bg-accent-primary w-7 h-7 rounded-lg shadow-[0_0_15px_var(--accent-glow)]"
        aria-label="Play"
      >
        <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Main Info (Title/Query) -->
  <div class="flex items-center gap-4 min-w-0">
    <div
      class="w-10 h-10 bg-black/40 border border-white/5 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xl overflow-hidden relative max-[600px]:hidden"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-accent-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
      ></div>
      {#if actualTrack.fixedThumbnail}
        <img
          src={actualTrack.fixedThumbnail}
          alt=""
          class="w-full h-full object-cover"
          loading="lazy"
          on:error={(e) =>
            console.error(
              '[Image Error] TrackRow thumb failed:',
              fixPath(actualTrack.thumbnail),
              e
            )}
        />
      {:else}
        <svg
          class="w-5 h-5 text-text-main group-hover:text-accent-primary transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      {/if}
    </div>
    <div class="flex flex-col min-w-0">
      <span
        class="truncate font-black text-[14px] tracking-tight transition-colors {isCurrent
          ? 'text-accent-primary drop-shadow-[0_0_8px_var(--accent-glow)]'
          : 'text-white group-hover:text-accent-primary'}"
      >
        {actualTrack.title || actualTrack.query || 'Unknown Track'}
      </span>
      <span
        class="text-[9px] font-black text-[#B8C5D6] mt-0.5 uppercase tracking-[0.2em] opacity-30"
      >
        {actualTrack.artist || (mode === 'library' ? $t('local_file') : actualTrack.genre || 'MIX')}
        {#if actualTrack.album}
          <span class="mx-1.5 opacity-50">•</span>
          {actualTrack.album}
        {/if}
      </span>
    </div>
  </div>

  <!-- Genre (Library Only) -->
  {#if mode === 'library'}
    <div
      class="text-left text-[#B8C5D6] font-black text-[10px] truncate uppercase tracking-[0.2em] opacity-60 max-[1000px]:hidden"
    >
      {actualTrack.genre || 'DSP-READY'}
    </div>
  {/if}

  <!-- BPM -->
  <div
    class="text-right font-mono font-black text-[14px] text-white {mode === 'library'
      ? 'max-[1000px]:hidden'
      : ''} opacity-80 group-hover:opacity-100 transition-opacity whitespace-nowrap"
  >
    {#if pitch && pitch !== 1}
      <span class="text-accent-primary mr-2">{(actualTrack.bpm * pitch).toFixed(1)}</span>
    {:else}
      {actualTrack.bpm_display || (actualTrack.bpm ? actualTrack.bpm.toFixed(1) : '120.0')}
    {/if}
  </div>

  <!-- Actions -->
  <div class="text-center flex items-center justify-end gap-2 pr-2">
    {#if mode === 'library'}
      <button
        on:click|stopPropagation={() => onDelete(actualTrack)}
        title={$t('remove_from_lib')}
        class="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-500 transition-all focus:outline-none w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 2 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
      <button
        on:click|stopPropagation={() => onAddQueue(actualTrack)}
        title={$t('add_to_queue')}
        class="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-accent-primary transition-all focus:outline-none w-7 h-7 rounded-lg hover:bg-accent-primary/10 flex items-center justify-center"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
    {:else}
      <!-- Playlist Actions -->
      <span class="text-[10px] font-mono opacity-40">{formatDuration(actualTrack.duration)}</span>
      <button
        on:click|stopPropagation={() => onDelete(playlistItemIdx)}
        aria-label="Delete from playlist"
        class="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-500 transition-all w-7 h-7 rounded-lg flex items-center justify-center focus:outline-none"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>
</div>
