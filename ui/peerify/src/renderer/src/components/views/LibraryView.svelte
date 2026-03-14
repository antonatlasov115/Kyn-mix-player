<script>
  export let libraryTracks = []
  export let trackPath = ''
  export let isPlaying = false
  export let onPlayTrack
  export let onAddToQueue
  export let onDeleteTrack

  import { t } from '../../lib/i18n'
  import { fly, fade } from 'svelte/transition'
  import { libraryManager } from '../../lib/managers/LibraryManager'
  import { selection } from '../../lib/stores/selection'

  export let searchQuery = ''

  import TrackList from '../layout/TrackList.svelte'

  // Ultra-fast search using pre-computed index in LibraryManager.js
  let lastSearch = ''
  let q = ''
  $: {
    if (searchQuery !== lastSearch) {
      lastSearch = searchQuery
      q = searchQuery.toLowerCase()
    }
  }

  $: filteredTracks = libraryTracks.filter((track) => {
    if (!q) return true
    return track.search_index?.includes(q)
  })

</script>

<div
  class="p-6 h-full flex flex-col glass-container text-white overflow-hidden glass-noise relative"
  style="-webkit-app-region: no-drag;"
>
  <div class="mb-4 flex justify-between items-end gap-4 shrink-0 relative z-10 px-4">
    <div>
      <h1 class="text-5xl font-black tracking-tighter mb-2 drop-shadow-2xl">{$t('library')}</h1>
      <p class="text-[11px] font-black text-text-main uppercase tracking-[0.4em] opacity-40">
        {$t('local_tracks')} ({libraryTracks.length})
      </p>
    </div>

    <div class="flex items-center gap-6">
      <div class="relative w-80 group">
        <div class="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
          <svg
            class="w-5 h-5 text-accent-primary opacity-40 group-focus-within:opacity-100 transition-opacity"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            /></svg
          >
        </div>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={$t('search_placeholder')}
          class="w-full bg-white/5 backdrop-blur-3xl border border-white/10 text-white font-bold text-sm rounded-2xl pl-14 pr-6 py-4 outline-none focus:border-accent-primary/40 focus:bg-white/10 transition-all placeholder-text-main/30 shadow-2xl glass-noise"
        />
      </div>
    </div>
  </div>

  {#if libraryTracks.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-[#B8C5D6] pb-32">
      <div
        class="w-32 h-32 bg-white/5 border border-white/10 backdrop-blur-3xl rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl glass-noise"
      >
        <svg
          class="w-16 h-16 text-accent-primary opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          /></svg
        >
      </div>
      <p class="text-3xl font-black text-white mb-3 tracking-tighter">{$t('library_empty')}</p>
      <p class="text-[11px] font-black uppercase tracking-[0.2em] opacity-40">
        {$t('library_empty_hint')}
      </p>
    </div>
  {:else if filteredTracks.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-[#B8C5D6] pb-32">
      <p class="text-3xl font-black text-white mb-3 tracking-tighter">{$t('no_results')}</p>
      <p class="text-[11px] font-black uppercase tracking-[0.2em] opacity-40">
        {$t('no_results_hint')} «{searchQuery}»
      </p>
    </div>
  {:else}
    <TrackList
      tracks={filteredTracks}
      {trackPath}
      {isPlaying}
      onPlay={onPlayTrack}
      onAddQueue={onAddToQueue}
      onDelete={onDeleteTrack}
      onRowClick={(track) => selection.setTracks([track])}
      mode="library"
    />
  {/if}
</div>
