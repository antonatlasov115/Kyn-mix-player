<script>
  import { t } from '../../lib/i18n'
  import { selection } from '../../lib/stores/selection'
  import TrackRow from './TrackRow.svelte'
  import { onMount, onDestroy } from 'svelte'
  import { comparePaths } from '../../lib/utils'
  import { flip } from 'svelte/animate'
  import { fade, fly } from 'svelte/transition'

  export let tracks = []
  export let trackPath = ''
  export let isPlaying = false
  export let onPlay
  export let onAddQueue
  export let onDelete
  export let onRowClick = () => {}
  export let mode = 'library'
  // For shift-select coordination
  function handleShiftSelect(e) {
    const { track, index } = e.detail
    const selected = $selection.selectedTracks
    if (selected.length === 0) {
      selection.toggleTrack(track)
      return
    }

    const lastTrack = selected[selected.length - 1]
    const lastIdx = tracks.findIndex((t) => comparePaths(t.filePath, lastTrack.filePath))

    if (lastIdx !== -1) {
      const start = Math.min(lastIdx, index)
      const end = Math.max(lastIdx, index)
      const toSelect = tracks.slice(start, end + 1)
      selection.selectMultiple(toSelect)
    }
  }

  const ITEM_HEIGHT = 64 // Increased from 52 to accommodate transition zone
  let scrollTop = 0
  let viewportHeight = 800
  let scrollContainer

  export let onOpenTransitionEditor = () => {}

  // Derived visible items (Zero-allocation slice)
  $: visibleStartIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 5)
  $: visibleEndIndex = Math.min(tracks.length, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + 5)
  $: visibleTracks = tracks.slice(visibleStartIndex, visibleEndIndex)
  $: totalHeight = tracks.length * ITEM_HEIGHT

  function handleScroll(e) {
    scrollTop = e.target.scrollTop
  }

  function handleResize() {
    if (scrollContainer) viewportHeight = scrollContainer.clientHeight
  }

  onMount(() => {
    document.addEventListener('shiftSelect', handleShiftSelect)
    handleResize()
    window.addEventListener('resize', handleResize)
  })

  onDestroy(() => {
    document.removeEventListener('shiftSelect', handleShiftSelect)
    window.removeEventListener('resize', handleResize)
  })

  const isCurrentTrack = (path, currentPath) => {
    return comparePaths(path, currentPath)
  }

  let totalDuration = 0
  $: {
    if (tracks.length > 0) {
      totalDuration = tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0)
    } else {
      totalDuration = 0
    }
  }

  function formatTotalTime(seconds) {
    if (!seconds) return '0:00'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0)
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
</script>

<div class="flex flex-col h-full bg-transparent overflow-hidden">
  {#if tracks.length > 0}
    <div class="px-4 mb-4 flex items-center gap-3 opacity-40">
      <span class="text-[10px] font-black uppercase tracking-[0.2em] text-white">
        {tracks.length}
        {$t('tracks')}
      </span>
      <div class="w-1 h-1 rounded-full bg-white/20"></div>
      <span class="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
        {formatTotalTime(totalDuration)}
      </span>
    </div>
  {/if}

  <!-- Headers -->
  <div
    role="grid"
    class="grid gap-4 px-4 py-2 text-[9px] font-black text-[#B8C5D6] border-b border-white/5 uppercase tracking-[0.4em] mb-2 shrink-0 opacity-30
    {mode === 'library'
      ? 'grid-cols-[30px_40px_1fr_120px_80px_100px] max-[1000px]:grid-cols-[30px_40px_1fr_100px]'
      : 'grid-cols-[30px_40px_1fr_100px_100px]'}"
  >
    <div class="text-center"></div>
    <div class="text-center">#</div>
    <div>{$t('title')}</div>
    {#if mode === 'library'}
      <div class="text-left max-[1000px]:hidden">{$t('genre')}</div>
    {/if}
    <div class="text-right {mode === 'library' ? 'max-[1000px]:hidden' : ''}">{$t('bpm')}</div>
    <div class="text-center"></div>
  </div>

  <!-- Scrollable List -->
  <div 
    bind:this={scrollContainer}
    on:scroll={handleScroll}
    class="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-48 relative z-10"
  >
    <div class="relative" style="height: {totalHeight}px;">
      <div 
        class="absolute top-0 left-0 right-0"
        style="transform: translateY({visibleStartIndex * ITEM_HEIGHT}px); will-change: transform; contain: content;"
      >
        {#each visibleTracks as track, i (track.id || track.filePath + '-' + (visibleStartIndex + i))}
            <TrackRow
              {track}
              index={visibleStartIndex + i}
              isCurrent={isCurrentTrack(track.filePath, trackPath)}
              {isPlaying}
              {onPlay}
              {onAddQueue}
              {onDelete}
              {onRowClick}
              {mode}
              playlistItemIdx={visibleStartIndex + i}
            />
            {#if mode === 'playlist' && (visibleStartIndex + i) < tracks.length - 1}
              <div class="relative h-2 -my-1 z-20 flex justify-center group/trans-btn opacity-0 hover:opacity-100 transition-opacity">
                <div class="absolute inset-x-0 top-1/2 h-[1px] bg-accent-primary/30"></div>
                <button 
                  on:click={() => onOpenTransitionEditor(tracks[visibleStartIndex + i], tracks[visibleStartIndex + i + 1], visibleStartIndex + i, visibleStartIndex + i + 1)}
                  class="relative bg-[#0a0f19] border border-accent-primary/50 text-accent-primary text-[10px] px-4 py-1.5 rounded-full font-black uppercase tracking-widest shadow-[0_0_20px_rgba(0,229,255,0.2)] hover:bg-accent-primary hover:text-black hover:scale-105 active:scale-95 transition-all"
                >
                  ✂️ {$t('customize_transition') || 'Настроить переход'}
                </button>
              </div>
            {/if}
        {/each}
      </div>
    </div>
  </div>
</div>
