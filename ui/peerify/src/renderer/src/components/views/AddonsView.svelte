<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { t } from '../../lib/i18n'
  import { fixPath } from '../../lib/utils'

  const dispatch = createEventDispatcher()
  let platform = 'youtube' // youtube, spotify, soundcloud
  let query = ''
  let results = []
  let searching = false
  let downloadProgresses = {} // { [query]: progress }

  let showUrlHint = false

  $: {
    showUrlHint = query.startsWith('http')
  }

  onMount(() => {
    // We no longer track progress locally in AddonsView;
    // it's handled by the Download Manager view.
  })

  async function handleSearch() {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return
    searching = true
    results = [] // Clear previous results
    try {
      results = await window.peerifyAPI.ytSearch(trimmedQuery, platform)
    } catch (e) {
      console.error(e)
    } finally {
      searching = false
    }
  }

  async function handleDownload(track) {
    try {
      await window.peerifyAPI.ytDownload(track.url)
      dispatch('navigate', 'downloads')
    } catch (e) {
      console.error(e)
    }
  }

  async function handlePlaylistDownload() {
    if (!showUrlHint || !query.includes('list=')) return
    try {
      await window.peerifyAPI.ytDownload(query)
      dispatch('navigate', 'downloads')
    } catch (e) {
      console.error(e)
    }
  }

  async function handleBatchDownload() {
    const tracksToDownload = results.filter((t) => downloadProgresses[t.url] === undefined)
    if (tracksToDownload.length === 0) return
    tracksToDownload.forEach((track) => handleDownload(track))
  }

  function getPlatformColor() {
    switch (platform) {
      case 'spotify':
        return '#1DB954'
      case 'soundcloud':
        return '#FF5500'
      case 'youtube':
        return '#FF0000'
      default:
        return 'var(--accent-primary)'
    }
  }
</script>

<div class="h-full w-full p-8 flex flex-col gap-8 overflow-y-auto mix-scrollbar">
  <div class="flex flex-col gap-2">
    <h2 class="text-4xl font-black tracking-tighter text-white">{$t('addons')}</h2>
    <p class="text-white/40 text-sm font-medium uppercase tracking-widest">
      {$t('external_integration')}
    </p>
  </div>

  <!-- Platform Selector -->
  <div class="flex gap-3 max-w-2xl px-1">
    <button
      on:click={() => (platform = 'youtube')}
      class="flex-1 p-4 rounded-3xl transition-all flex flex-col items-center gap-3 border {platform ===
      'youtube'
        ? 'bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}"
    >
      <svg class="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
        />
      </svg>
      <span class="text-[10px] font-black uppercase tracking-widest">{$t('platform_youtube')}</span>
    </button>

    <button
      on:click={() => (platform = 'music')}
      class="flex-1 p-4 rounded-3xl transition-all flex flex-col items-center gap-3 border {platform ===
      'music'
        ? 'bg-[#FF0033]/10 border-[#FF0033] text-[#FF0033] shadow-[0_0_30px_rgba(255,0,51,0.2)]'
        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}"
    >
      <svg class="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 18.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span class="text-[10px] font-black uppercase tracking-widest">{$t('platform_music')}</span>
    </button>

    <button
      on:click={() => (platform = 'soundcloud')}
      class="flex-1 p-4 rounded-3xl transition-all flex flex-col items-center gap-3 border {platform ===
      'soundcloud'
        ? 'bg-[#FF5500]/10 border-[#FF5500] text-[#FF5500] shadow-[0_0_30px_rgba(255,85,0,0.2)]'
        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}"
    >
      <svg class="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M1.16 12.333c-.027 0-.053 0-.083.003L1 12.333c-.552 0-1 .448-1 1v2.334c0 .552.448 1 1 1l.077-.003c.03 0 .056.003.083.003.552 0 1-.448 1-1v-2.334c0-.552-.448-1-1-1zm2.333-1.333c-.027 0-.053 0-.083.003L3.333 11c-.552 0-1 .448-1 1v4.333c0 .552.448 1 1 1l.077-.003c.03 0 .056.003.083.003.552 0 1-.448 1-1V12a1 1 0 0 0-1-1zm2.334-1c-.027 0-.053 0-.083.003L5.667 9c-.552 0-1 .448-1 1v6.333c0 .552.448 1 1 1l.077-.003c.03 0 .056.003.083.003.552 0 1-.448 1-1V10a1 1 0 0 0-1-1zm2.333-1c-.027 0-.053 0-.083.003L8 7c-.552 0-1 .448-1 1v9.333c0 .552.448 1 1 1l.077-.003c.03 0 .056.003.083.003.552 0 1-.448 1-1V8a1 1 0 0 0-1-1zm2.333 1.333c-.027 0-.053 0-.083.003L10.333 8.333c-.552 0-1 .448-1 1v9.334c0 .552.448 1 1 1l.077-.003c.03 0 .056.003.083.003.552 0 1-.448 1-1V9.333a1 1 0 0 0-1-1zm14.834 2.334c0-2.394-1.942-4.334-4.334-4.334-.436 0-.853.067-1.243.188C18.667 10.147 17.5 9 16.083 9c-.3 0-.585.053-.85.148C14.75 7.647 13.5 6.667 12 6.667a4.321 4.321 0 0 0-.667.054V17c.563.21 1.173.333 1.833.333h11.167c1.472 0 2.667-1.195 2.667-2.666z"
        />
      </svg>
      <span class="text-[10px] font-black uppercase tracking-widest"
        >{$t('platform_soundcloud')}</span
      >
    </button>
  </div>

  <!-- Search Bar -->
  <div class="relative group max-w-2xl">
    <div
      class="absolute inset-0 blur-2xl rounded-3xl opacity-0 group-focus-within:opacity-100 transition-all duration-500"
      style="background: {getPlatformColor()}33"
    ></div>
    <div
      class="relative flex gap-3 p-3 bg-white/5 border rounded-3xl backdrop-blur-3xl transition-all duration-300 group-focus-within:bg-white/10"
      style="border-color: {platform === 'youtube'
        ? 'rgba(255,255,255,0.1)'
        : getPlatformColor() + '44'}"
    >
      <input
        bind:value={query}
        on:keydown={(e) => e.key === 'Enter' && handleSearch()}
        type="text"
        placeholder={showUrlHint ? $t('yt_link_placeholder') : $t('search_on_platform')}
        class="flex-1 bg-transparent border-none outline-none text-white px-4 font-bold placeholder:text-white/20"
      />
      {#if showUrlHint}
        <div
          class="flex items-center px-4 border-l border-white/10 text-[10px] font-black uppercase tracking-widest text-accent-primary animate-pulse"
        >
          {$t('direct_link_mode')}
        </div>
      {/if}
      <button
        on:click={handleSearch}
        disabled={searching}
        style="background: {getPlatformColor()}"
        class="px-8 py-3 text-black rounded-2xl font-black uppercase text-xs hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
      >
        {searching ? $t('searching') : $t('search')}
      </button>

      {#if showUrlHint && query.includes('list=')}
        <button
          on:click={handlePlaylistDownload}
          class="px-6 py-3 bg-emerald-500 text-black rounded-xl font-black uppercase text-xs hover:bg-white transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
        >
          {$t('import_playlist')}
        </button>
      {/if}

      {#if results.length > 0}
        <button
          on:click={handleBatchDownload}
          class="px-6 py-3 bg-white text-black rounded-xl font-black uppercase text-xs hover:bg-accent-primary transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]"
        >
          {$t('download_all')}
        </button>
      {/if}
    </div>
  </div>

  <!-- Results Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
    {#each results as track}
      <div
        class="group relative bg-white/5 border border-white/5 rounded-3xl overflow-hidden transition-all hover:scale-[1.02] hover:bg-white/10 hover:border-white/20"
      >
        <!-- Thumbnail -->
        <div class="aspect-video relative overflow-hidden bg-black/40">
          <img
            src={fixPath(track.thumbnail)}
            alt=""
            class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            on:error={(e) =>
              console.error('[Image Error] AddonsView thumb failed:', fixPath(track.thumbnail), e)}
          />
          <div
            class="absolute bottom-2 right-2 px-2 py-0.5 bg-black/80 rounded text-[10px] font-bold text-white tabular-nums"
          >
            {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
          </div>

          {#if downloadProgresses[track.url] !== undefined}
            <div class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
              <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                <div
                  class="h-full bg-accent-primary transition-all duration-300"
                  style="width: {downloadProgresses[track.url]}%"
                ></div>
              </div>
              <span class="text-[10px] font-black text-accent-primary uppercase tracking-widest">
                {Math.round(downloadProgresses[track.url])}%
              </span>
            </div>
          {/if}
        </div>

        <!-- Info -->
        <div class="p-5 flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h3 class="font-bold text-white leading-tight line-clamp-2 min-h-[3rem]">
              {track.title}
            </h3>
            <p class="text-xs text-white/40 font-medium truncate">{track.uploader}</p>
          </div>

          <button
            on:click={() => handleDownload(track)}
            disabled={downloadProgresses[track.url] !== undefined}
            class="w-full py-3 rounded-2xl border {downloadProgresses[track.url] !== undefined
              ? 'border-accent-primary/50 text-accent-primary'
              : 'border-white/10 text-white/60 hover:text-white hover:border-white/30'} flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all"
          >
            {#if downloadProgresses[track.url] !== undefined}
              <div
                class="w-3 h-3 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"
              ></div>
              {downloadProgresses[track.url] === 100 ? $t('done') : $t('downloading')}
            {:else}
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {$t('download_mp3')}
            {/if}
          </button>
        </div>
      </div>
    {:else}
      {#if !searching}
        <div
          class="col-span-full h-64 flex flex-col items-center justify-center text-white/10 italic"
        >
          <svg
            class="w-16 h-16 mb-4 opacity-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          {$t('addons_empty_hint')}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .mix-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .mix-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--accent-glow);
  }
</style>
