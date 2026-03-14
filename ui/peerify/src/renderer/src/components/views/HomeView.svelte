<script>
  export let libraryTracks = []
  export let onScanDirectory
  export let onSearch = () => {}
  export let searchQuery = ''

  import { t } from '../../lib/i18n'
  import { playback } from '../../lib/stores/playback'
  import { playbackManager } from '../../lib/managers/PlaybackManager'
  import { fixPath } from '../../lib/utils'

  $: recentlyAdded = [...libraryTracks]
    .sort((a, b) => (b.addDate || 0) - (a.addDate || 0))
    .slice(0, 8)

  const handlePlayTrack = (track) => {
    playbackManager.handlePlayTrack(track)
  }

  const handleSurpriseMe = () => {
    playbackManager.handleHybridAutomix()
  }

  function handleMagneticMove(e) {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`
  }

  function handleMagneticOut(e) {
    const btn = e.currentTarget
    btn.style.transform = 'translate(0, 0)'
  }
</script>

<div
  class="p-10 flex flex-col h-full glass-container text-white font-sans overflow-y-auto custom-scrollbar relative z-0"
>
  <div class="flex items-center justify-between mb-8 relative z-10">
    <div class="flex items-center gap-6">
      <div
        class="w-16 h-16 bg-accent-primary rounded-3xl flex items-center justify-center text-black shadow-[0_0_30px_var(--accent-glow)]"
      >
        <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"
          ><path
            d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
          /></svg
        >
      </div>
      <div>
        <h1 class="text-5xl font-black tracking-tighter mb-1 text-white drop-shadow-2xl">
          Peerify <span class="text-accent-primary">DSP</span>
        </h1>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></div>
          <p class="text-[10px] text-text-main font-black uppercase tracking-[0.3em] opacity-40">
            {$t('engine_status_active')} — {$playback.isPlaying ? 'Playing' : 'Idle'}
          </p>
        </div>
      </div>
    </div>

    <div class="relative w-80 group">
      <div class="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none z-10">
        <svg
          class="w-4 h-4 text-accent-primary opacity-50 group-focus-within:opacity-100 transition-opacity"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="3"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          /></svg
        >
      </div>
      <input
        type="text"
        bind:value={searchQuery}
        on:keydown={(e) => e.key === 'Enter' && onSearch()}
        placeholder={$t('global_search_placeholder')}
        class="w-full bg-white/5 backdrop-blur-3xl border border-white/5 text-white font-bold text-xs rounded-2xl pl-12 pr-6 py-3.5 outline-none focus:border-accent-primary/40 focus:bg-white/10 transition-all placeholder-text-main/20 shadow-xl focus:shadow-[0_0_40px_var(--accent-glow)] appearance-none"
      />
    </div>
  </div>

  <!-- QUICK ACTIONS -->
  <div class="grid grid-cols-4 gap-4 mb-10 relative z-10">
    <button
      on:click={handleSurpriseMe}
      class="bg-accent-primary/10 border border-accent-primary/20 p-6 rounded-3xl flex flex-col items-center gap-3 transition-all hover:bg-accent-primary/20 hover:scale-[1.02] active:scale-95 group"
    >
      <div
        class="w-12 h-12 bg-accent-primary text-black rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,180,255,0.3)] group-hover:shadow-[0_0_30px_var(--accent-glow)] transition-all"
      >
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"
          ><path
            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
          /></svg
        >
      </div>
      <span class="text-[10px] font-black uppercase tracking-widest text-accent-primary"
        >Surprise Me</span
      >
    </button>

    <button
      on:click={onScanDirectory}
      class="bg-white/5 border border-white/5 p-6 rounded-3xl flex flex-col items-center gap-3 transition-all hover:bg-white/10 hover:scale-[1.02] active:scale-95 group"
    >
      <div
        class="w-12 h-12 bg-white/10 text-white rounded-2xl flex items-center justify-center transition-all group-hover:bg-white group-hover:text-black"
      >
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"
          ><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg
        >
      </div>
      <span class="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white"
        >Add Music</span
      >
    </button>

    <button
      on:click={() => (searchQuery = 'lofi')}
      class="bg-white/5 border border-white/5 p-6 rounded-3xl flex flex-col items-center gap-3 transition-all hover:bg-white/10 hover:scale-[1.02] active:scale-95 group"
    >
      <div
        class="w-12 h-12 bg-white/10 text-white rounded-2xl flex items-center justify-center transition-all group-hover:bg-purple-500 group-hover:text-white"
      >
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"
          ><path
            d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
          /></svg
        >
      </div>
      <span class="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white"
        >Deep Flow</span
      >
    </button>

    <div
      class="bg-gradient-to-br from-accent-primary/5 to-accent-secondary/5 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center gap-1 overflow-hidden relative"
    >
      <div class="absolute inset-0 bg-white/5 blur-3xl rounded-full translate-x-10 translate-y-10"></div>
      <span class="text-[24px] font-black text-white relative z-10">{libraryTracks.length}</span>
      <span class="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 relative z-10"
        >Tracks Optimized</span
      >
    </div>
  </div>

  <!-- RECENTLY ADDED SHELF -->
  {#if recentlyAdded.length > 0}
    <div class="mb-14 relative z-10">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-[11px] font-black uppercase tracking-[0.4em] text-white/40">
          Recently Injected
        </h2>
        <button on:click={() => (searchQuery = '')} class="text-[9px] font-black uppercase tracking-widest text-accent-primary hover:underline">View All</button>
      </div>
      <div class="flex gap-4 overflow-x-auto pb-4 custom-scrollbar-h">
        {#each recentlyAdded as track}
          <button
            class="flex-shrink-0 w-44 group cursor-pointer text-left focus:outline-none"
            on:click={() => handlePlayTrack(track)}
          >
            <div class="relative aspect-square mb-3 rounded-2xl overflow-hidden shadow-xl bg-black/40 border border-white/5">
              {#if track.thumbnail}
                <img src={fixPath(track.thumbnail)} alt={track.title} class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-white/10">
                   <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
              {/if}
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black scale-75 group-hover:scale-100 transition-transform">
                    <svg class="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                 </div>
              </div>
            </div>
            <h4 class="text-[12px] font-black text-white truncate group-hover:text-accent-primary transition-colors">{track.title || 'Unknown Track'}</h4>
            <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest truncate">{track.artist || 'Unknown Artist'}</p>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="mb-14 relative z-10">
    <h2 class="text-[11px] font-black uppercase tracking-[0.4em] text-[#B8C5D6] mb-6 opacity-40">
      {$t('file_injection')}
    </h2>

    <div
      class="group relative w-full h-60 rounded-[2.5rem] border-2 border-dashed border-white/10 bg-white/5 backdrop-blur-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:border-accent-primary/40 hover:bg-accent-primary/5 shadow-2xl glass-noise overflow-hidden"
      on:click={onScanDirectory}
      on:keydown={(e) => e.key === 'Enter' && onScanDirectory()}
      role="button"
      tabindex="0"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-accent-primary/10 via-transparent to-accent-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
      ></div>

      <div
        class="w-20 h-20 bg-black/40 border border-white/10 group-hover:bg-accent-primary group-hover:text-black rounded-3xl flex items-center justify-center mb-6 transition-all duration-500 shadow-2xl group-hover:shadow-[0_0_40px_var(--accent-glow)] group-hover:-translate-y-2"
      >
        <svg
          class="w-9 h-9 transition-transform duration-500 group-hover:scale-110"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          /></svg
        >
      </div>
      <span
        class="text-2xl font-black text-white mb-2 tracking-wide drop-shadow-2xl translate-y-2 group-hover:translate-y-0 transition-all duration-500"
        >{$t('drag_n_drop')}</span
      >
      <span
        class="text-xs text-[#B8C5D6] font-black opacity-40 uppercase tracking-[0.3em] translate-y-4 group-hover:translate-y-0 transition-all duration-700"
        >{$t('click_to_select')}</span
      >
    </div>
  </div>

  <div class="relative z-10 pb-32">
    <h2 class="text-[11px] font-black uppercase tracking-[0.4em] text-[#B8C5D6] mb-6 opacity-40">
      {$t('system_status')}
    </h2>
    <div class="grid grid-cols-3 gap-8">
      <!-- STAT CARD 1: TRACKS -->
      <div
        class="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 transition-all duration-500 relative overflow-hidden group shadow-2xl glass-noise magnetic-card hover:bg-white/10 hover:border-white/20 active:scale-95 cursor-default"
        on:mousemove={handleMagneticMove}
        on:mouseleave={handleMagneticOut}
        role="button"
        tabindex="0"
        aria-label={$t('tracks_in_db')}
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        ></div>
        <div
          class="absolute -bottom-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 group-hover:scale-125 group-hover:rotate-12 pointer-events-none"
        >
          <svg class="w-48 h-48 text-white" fill="currentColor" viewBox="0 0 24 24"
            ><path
              d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
            /></svg
          >
        </div>
        <span
          class="text-[10px] font-black text-[#B8C5D6] uppercase tracking-[0.3em] block mb-4 opacity-50 group-hover:opacity-100 transition-opacity"
          >{$t('tracks_in_db')}</span
        >
        <div class="flex items-baseline gap-2">
          <span
            class="text-6xl font-black text-white drop-shadow-2xl transition-transform duration-500 group-hover:scale-110 block"
            >{libraryTracks.length}</span
          >
          <span
            class="text-xs font-black text-accent-primary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all"
            >HQ</span
          >
        </div>
        <span
          class="text-[10px] font-black text-[#B8C5D6] block mt-6 uppercase tracking-[0.2em] opacity-40"
          >{$t('local_files_label')}</span
        >
      </div>

      <!-- STAT CARD 2: DSP CORE -->
      <div
        class="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 transition-all duration-500 relative overflow-hidden group shadow-2xl glass-noise magnetic-card hover:bg-white/10 hover:border-white/20 active:scale-95 cursor-default"
        on:mousemove={handleMagneticMove}
        on:mouseleave={handleMagneticOut}
        role="button"
        tabindex="0"
        aria-label={$t('dsp_core_label')}
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        ></div>
        <div
          class="absolute -bottom-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 group-hover:scale-125 pointer-events-none"
        >
          <svg
            class="w-48 h-48 text-accent-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
            /></svg
          >
        </div>
        <span
          class="text-[10px] font-black text-[#B8C5D6] uppercase tracking-[0.3em] block mb-4 opacity-50 group-hover:opacity-100 transition-opacity"
          >{$t('dsp_core_label')}</span
        >
        <div class="flex items-center gap-4">
          <div
            class="w-3 h-3 rounded-full bg-accent-primary shadow-[0_0_20px_var(--accent-glow)] animate-pulse"
          ></div>
          <span
            class="text-5xl font-black text-white drop-shadow-[0_0_15px_var(--accent-glow)] transition-transform duration-500 group-hover:scale-105"
            >{$t('online')}</span
          >
        </div>
        <span
          class="text-[10px] font-black text-[#B8C5D6] block mt-6 uppercase tracking-[0.2em] opacity-40"
          >{$t('hardware_acceleration')}</span
        >
      </div>

      <!-- STAT CARD 3: ML -->
      <div
        class="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 transition-all duration-500 relative overflow-hidden group shadow-2xl glass-noise magnetic-card hover:bg-white/10 hover:border-white/20 active:scale-95 cursor-default"
        on:mousemove={handleMagneticMove}
        on:mouseleave={handleMagneticOut}
        role="button"
        tabindex="0"
        aria-label={$t('machine_learning')}
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-accent-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        ></div>
        <div
          class="absolute -bottom-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 group-hover:scale-125 -rotate-12 pointer-events-none"
        >
          <svg class="w-48 h-48 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
            /></svg
          >
        </div>
        <span
          class="text-[10px] font-black text-[#B8C5D6] uppercase tracking-[0.3em] block mb-4 opacity-50 group-hover:opacity-100 transition-opacity"
          >{$t('machine_learning')}</span
        >
        <span
          class="text-5xl font-black text-white transition-transform duration-500 group-hover:scale-105 block font-mono"
          >NEURAL</span
        >
        <span
          class="text-[10px] font-black text-[#B8C5D6] block mt-6 uppercase tracking-[0.2em] opacity-40"
          >{$t('track_similarity')}</span
        >
      </div>
    </div>
  </div>
</div>

<style>
  .custom-scrollbar-h::-webkit-scrollbar {
    height: 4px;
  }
  .custom-scrollbar-h::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar-h::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
  }
  .custom-scrollbar-h::-webkit-scrollbar-thumb:hover {
    background: var(--accent-glow);
  }

  .magnetic-card {
    transition:
      transform 0.2s cubic-bezier(0.23, 1, 0.32, 1),
      background-color 0.3s,
      border-color 0.3s;
    will-change: transform;
  }
</style>
