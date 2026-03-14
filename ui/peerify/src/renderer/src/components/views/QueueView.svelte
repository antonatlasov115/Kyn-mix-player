<script>
  import { t } from '../../lib/i18n'
  import { flip } from 'svelte/animate'
  import { fly, fade } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'

  export let playQueue = []
  export let currentFileName = ''
  export let onRemoveFromQueue
  export let onSavePlaylist
  export let onPlayFromQueue // Новая функция для моментального старта

  let playlistName = ''

  async function handleSave() {
    if (playlistName.trim() && playQueue.length > 0) {
      await onSavePlaylist(playlistName)
      playlistName = ''
    }
  }

  function toggleCurve(index) {
    const curves = ['equal', 'linear', 'cut']
    const item = playQueue[index]
    let currentIdx = curves.indexOf(item.curve || 'equal')
    if (currentIdx === -1) currentIdx = 0
    item.curve = curves[(currentIdx + 1) % curves.length]
    playQueue = [...playQueue]
  }
  import QueueRow from '../layout/QueueRow.svelte'
  import { onMount, onDestroy } from 'svelte'

  const ITEM_HEIGHT = 130
  let scrollTop = 0
  let viewportHeight = 800
  let scrollContainer

  function handleScroll(e) {
    scrollTop = e.target.scrollTop
  }

  function handleResize() {
    if (scrollContainer) viewportHeight = scrollContainer.clientHeight
  }

  $: visibleStartIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3)
  $: visibleEndIndex = Math.min(playQueue.length, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + 3)
  $: visibleItems = playQueue.slice(visibleStartIndex, visibleEndIndex)
  $: totalHeight = playQueue.length * ITEM_HEIGHT

  onMount(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
  })

  onDestroy(() => {
    window.removeEventListener('resize', handleResize)
  })
</script>

<div
  class="p-10 h-full flex flex-col glass-container text-white overflow-hidden relative z-0"
>
  <div class="mb-10 flex justify-between items-end gap-6 relative z-10 shrink-0">
    <div>
      <h1 class="text-4xl font-black tracking-tighter mb-2 drop-shadow-md">
        {$t('play_queue')}
      </h1>
      <p class="text-[13px] text-text-main font-bold uppercase tracking-widest opacity-80">
        {$t('queue_desc')}
      </p>
    </div>

    {#if playQueue.length > 0}
      <div class="flex gap-3">
        <input
          type="text"
          bind:value={playlistName}
          placeholder={$t('playlist_name_placeholder')}
          class="bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-5 py-2.5 text-[13px] font-bold outline-none focus:border-accent-primary focus:bg-white/10 transition-all text-white placeholder-text-main/50 shadow-inner"
        />
        <button
          on:click={handleSave}
          class="bg-accent-primary text-black font-black uppercase tracking-wider px-6 py-2.5 rounded-full text-[13px] hover:bg-white transition-all shadow-[0_0_15px_var(--accent-glow)] hover:shadow-[0_0_20px_rgba(255,255,255,0.6)]"
        >
          {$t('save_button')}
        </button>
      </div>
    {/if}
  </div>

  <div class="mb-12 relative z-10 shrink-0">
    <h2
      class="text-[#B8C5D6] text-[11px] font-black uppercase tracking-[0.2em] mb-4 border-b border-white/10 pb-3 opacity-80"
    >
      {$t('now_playing')}
    </h2>
    <div
      class="flex items-center gap-4 px-6 py-4 bg-white/10 backdrop-blur-lg rounded-2xl border-l-[6px] border-accent-primary shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
    >
      <div
        class="w-10 h-10 flex items-center justify-center bg-accent-primary/20 rounded-xl border border-accent-primary/30"
      >
        <div
          class="w-2.5 h-2.5 rounded-full bg-accent-primary animate-pulse shadow-[0_0_12px_var(--accent-glow)]"
        ></div>
      </div>
      <div class="font-black text-white text-lg truncate drop-shadow-sm">
        {currentFileName || $t('playlist_frozen')}
      </div>
    </div>
  </div>

  <div class="relative z-10 flex-1 flex flex-col overflow-hidden">
    <h2
      class="text-[#B8C5D6] text-[11px] font-black uppercase tracking-[0.2em] mb-4 border-b border-white/10 pb-3 opacity-80 shrink-0"
    >
      {$t('next_tracks')} ({playQueue.length})
    </h2>

    {#if playQueue.length === 0}
      <div
        class="text-[#B8C5D6] text-sm mt-12 flex flex-col items-center justify-center opacity-60 flex-1"
      >
        <svg
          class="w-16 h-16 mb-4 text-white/50"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          /></svg
        >
        <span class="font-bold tracking-wider uppercase">{$t('queue_empty')}</span>
      </div>
    {:else}
      <div 
        bind:this={scrollContainer}
        on:scroll={handleScroll}
        class="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-48"
      >
        <div class="relative" style="height: {totalHeight}px;">
          <div 
            class="absolute top-0 left-0 right-0 space-y-4"
            style="transform: translateY({visibleStartIndex * ITEM_HEIGHT}px); will-change: transform; contain: content;"
          >
            {#each visibleItems as item, i (item.id)}
              <QueueRow
                {item}
                index={visibleStartIndex + i}
                {onPlayFromQueue}
                {onRemoveFromQueue}
                onToggleCurve={toggleCurve}
              />
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
