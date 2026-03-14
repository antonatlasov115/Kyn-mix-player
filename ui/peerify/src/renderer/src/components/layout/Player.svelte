<script>
  export let currentFileName = 'IDLE MODE'
  import { createEventDispatcher, onMount } from 'svelte'
  import { t } from '../../lib/i18n'
  import { fixPath } from '../../lib/utils'

  export let drop_pos = 0
  export let outro_start = 0
  export let thumbnail = null
  export let originalCover = null

  import { playback, playbackProgress } from '../../lib/stores/playback'
  import { settings as settingsStore } from '../../lib/stores/settings'
  import { engineState } from '../../lib/stores/engine'
  import { playbackManager } from '../../lib/managers/PlaybackManager'

  $: ({
    isPlaying,
    duration,
    volume,
    mixMode,
    isCrossfading,
    reverbActive,
    reverbLevel,
    automixMode,
    repeatMode,
    shuffleMode,
    activeEffect
  } = $playback)

  $: progress = $playbackProgress.value

  $: ({ performanceProfile } = $settingsStore)

  let prevCover = null
  let currentCover = null
  let cleanupTimer = null

  $: {
    const nextCover = originalCover || thumbnail
    if (nextCover && nextCover !== currentCover) {
      prevCover = currentCover
      currentCover = nextCover
      if (cleanupTimer) clearTimeout(cleanupTimer)
    }
  }

  $: if (!isPlaying && currentCover) {
    if (cleanupTimer) clearTimeout(cleanupTimer)
    cleanupTimer = setTimeout(() => {
      currentCover = null
      prevCover = null
    }, 15000)
  }

  const onUpdateVolume = (v) => playback.update((s) => ({ ...s, volume: v }))
  const onTogglePlaybackMode = () => {
    playback.update((s) => {
      if (!s.mixMode) {
        return { ...s, mixMode: true, automixMode: 'ai' }
      } else if (s.automixMode === 'ai') {
        return { ...s, mixMode: true, automixMode: 'sequential' }
      } else {
        return { ...s, mixMode: false, automixMode: 'sequential' }
      }
    })
  }

  const onTogglePlay = () => playbackManager.handleToggle()
  const onAutomix = () => playbackManager.handleHybridAutomix()
  const handleScrub = (e) => playbackManager.handleSeek(e)
  const onPrev = () => playbackManager.handlePrevious()
  const onToggleRepeat = () => playbackManager.handleToggleRepeat()
  const onToggleShuffle = () => playbackManager.handleToggleShuffle()
  const onApplyPitch = (p) => playbackManager.applyPitch(p)
  const onToggleSlowedReverb = () => playbackManager.toggleSlowedReverb()
  const onToggleReverb = () => playbackManager.toggleReverb()
  const onUpdateReverbLevel = (l) => playback.update((s) => ({ ...s, reverbLevel: l }))

  let showEffectsMenu = false
  const toggleEffectsMenu = () => (showEffectsMenu = !showEffectsMenu)

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, '0')
    return `${m}:${s}`
  }

  $: isMixingZone = isCrossfading
  let displayName = ''
  let nameKey = 0
  $: {
    if (currentFileName !== displayName) {
      displayName = currentFileName
      nameKey++
    }
  }

  $: energyFactor =
    isPlaying && drop_pos > 0 && Math.abs(progress - drop_pos) < 0.2
      ? 2.5
      : isPlaying && outro_start > 0 && Math.abs(progress - outro_start) < 0.2
        ? 1.5
        : 1.0
  $: isNearDrop =
    isPlaying &&
    (($playback.drop_pos > 0 && Math.abs(progress - $playback.drop_pos) < 0.2) ||
      (drop_pos > 0 && Math.abs(progress - drop_pos) < 0.2))

  onMount(() => {
    const handleOutsideClick = (e) => {
      if (showEffectsMenu && !e.target.closest('.fx-container')) showEffectsMenu = false
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  })
</script>


{#if isMixingZone}
  <div class="absolute -top-[2px] left-0 w-full h-[2px] z-50 overflow-hidden">
    <div
      class="w-full h-full opacity-100"
      style="background: linear-gradient(90deg, transparent, var(--accent-primary), var(--accent-secondary), var(--accent-primary), transparent); background-size: 200% 100%; animation: gentleFlow 2s linear infinite;"
    ></div>
  </div>
{/if}

{#if showEffectsMenu}
  <div
    class="absolute bottom-[110px] md:bottom-[130px] right-6 md:right-12 p-5 rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_rgba(0,0,0,0.6)] flex flex-col gap-2 w-72 z-[250] overflow-hidden transition-all fx-container glass-premium"
  >
    <div class="absolute inset-0 noise-overlay"></div>
    <div
      class="px-6 py-3 text-[10px] font-black text-white/40 uppercase tracking-[0.4em] border-b border-white/5 mb-1 flex items-center justify-between relative z-10"
    >
      <span>Studio DSP</span>
      <div class="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse"></div>
    </div>

    <div class="flex flex-col gap-1 relative z-10">
      <button
        on:click={() => {
          onApplyPitch(1.3)
          showEffectsMenu = false
        }}
        class="flex items-center justify-between px-6 py-4 rounded-2xl transition-all {activeEffect ===
        'nightcore'
          ? 'bg-white text-black font-black'
          : 'hover:bg-white/5 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest'}"
      >
        <span>Nightcore</span><span>⚡</span>
      </button>
      <button
        on:click={() => {
          onApplyPitch(0.67)
          showEffectsMenu = false
        }}
        class="flex items-center justify-between px-6 py-4 rounded-2xl transition-all {activeEffect ===
        'super_slowed'
          ? 'bg-accent-secondary text-black font-black'
          : 'hover:bg-white/5 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest'}"
      >
        <span>Super Slowed</span><span>🐌🚀</span>
      </button>
      <button
        on:click={() => {
          onApplyPitch(0.85)
          showEffectsMenu = false
        }}
        class="flex items-center justify-between px-6 py-4 rounded-2xl transition-all {activeEffect ===
        'slowed'
          ? 'bg-accent-secondary text-black font-black'
          : 'hover:bg-white/5 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest'}"
      >
        <span>Slowed</span><span>🐌</span>
      </button>
      <button
        on:click={() => {
          onToggleSlowedReverb()
          showEffectsMenu = false
        }}
        class="flex items-center justify-between px-6 py-4 rounded-2xl transition-all {activeEffect ===
        'slowed_reverb'
          ? 'bg-accent-secondary shadow-[0_0_25px_var(--accent-glow)] text-black font-black'
          : 'hover:bg-white/5 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest'}"
      >
        <span>S-Reverb</span><span>🌌</span>
      </button>

      <div class="w-full h-[1px] bg-white/5 my-2"></div>

      <button
        on:click={() => onToggleReverb()}
        class="flex items-center justify-between px-6 py-4 rounded-2xl transition-all {reverbActive
          ? 'bg-accent-primary text-black font-black'
          : 'hover:bg-white/5 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest'}"
      >
        <span>Space Reverb</span><span>💿</span>
      </button>
      <div
        class="px-6 py-3 space-y-3 {reverbActive
          ? 'opacity-100'
          : 'opacity-20 pointer-events-none'} transition-opacity"
      >
        <div
          class="flex justify-between items-center text-[9px] font-black text-white/40 uppercase tracking-widest"
        >
          <span>Intensity</span><span class="text-accent-primary"
            >{Math.round(reverbLevel * 100)}%</span
          >
        </div>
        <div class="relative h-1 flex items-center">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={reverbLevel}
            on:input={(e) => onUpdateReverbLevel(parseFloat(e.target.value))}
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            aria-label="Reverb Intensity"
          />
          <div class="w-full h-full bg-white/10 rounded-full overflow-hidden relative">
            <div class="h-full bg-accent-primary" style="width: {reverbLevel * 100}%"></div>
          </div>
        </div>
      </div>

      <button
        on:click={() => settingsStore.update((s) => ({ ...s, normalization: !s.normalization }))}
        class="flex items-center justify-between px-6 py-4 rounded-2xl transition-all {$settingsStore.normalization
          ? 'bg-accent-secondary text-black font-black'
          : 'hover:bg-white/5 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest'}"
      >
        <span>Normalization</span><span>🔊</span>
      </button>

      <div class="w-full h-[1px] bg-white/5 my-2"></div>

      <!-- MIX STYLE SELECTOR -->
      <div
        class="px-6 py-2 text-[9px] font-black text-white/40 uppercase tracking-[0.3em] flex items-center justify-between"
      >
        <span>Mix Style</span>
        <span class="text-accent-primary">{$settingsStore.mixStyle === 'auto' ? '🤖 AI' : ''}</span>
      </div>
      <div class="grid grid-cols-3 gap-1 px-3 pb-3 relative z-10">
        {#each [{ id: 'auto', label: 'Auto', icon: '🤖' }, { id: 'smooth', label: 'Smooth', icon: '🌊' }, { id: 'vinyl_brake', label: 'Vinyl', icon: '📀' }, { id: 'slam', label: 'Slam', icon: '💥' }, { id: 'gate', label: 'Gate', icon: '✂️' }, { id: 'echo_out', label: 'Echo', icon: '🎛️' }, { id: 'wash_out', label: 'Wash', icon: '🌀' }, { id: 'tempo_ramp', label: 'Tempo', icon: '⏩' }, { id: 'low_pass_sweep', label: 'LPF', icon: '🔉' }] as style}
          <button
            on:click={() => settingsStore.update((s) => ({ ...s, mixStyle: style.id }))}
            class="flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all text-center {$settingsStore.mixStyle ===
            style.id
              ? 'bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary/30'
              : 'hover:bg-white/5 text-white/40 hover:text-white/70'}"
          >
            <span class="text-sm">{style.icon}</span>
            <span class="text-[8px] font-black uppercase tracking-widest leading-none"
              >{style.label}</span
            >
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}


<footer
  class="w-full border-t border-white/10 select-none z-[190] absolute bottom-0 transition-all duration-700 glass-premium {isNearDrop && performanceProfile !== 'potato' && performanceProfile !== 'low'
    ? 'drop-burst'
    : ''}"
  style="height: clamp(100px, 15vh, 140px);"
>
  <!-- Noise Overlay for Texture -->
  <div class="absolute inset-0 noise-overlay"></div>


  <!-- Main Progress Bar (Full Width Top) -->
  <div
    class="absolute top-0 left-0 w-full h-[3px] hover:h-[6px] group cursor-pointer z-[210] transition-all duration-300"
  >
    <input
      type="range"
      min="0"
      max={duration || 1}
      step="0.1"
      value={progress}
      on:input={handleScrub}
      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
      aria-label={$t('scrub_track')}
    />
    <div class="w-full h-full bg-white/5 relative overflow-hidden">
      <!-- Secondary progress for transitions if needed, or just focus on main -->
      <div
        class="h-full {isMixingZone
          ? 'bg-gradient-to-r from-accent-primary via-white to-accent-secondary'
          : 'bg-accent-primary'} shadow-[0_0_20px_var(--accent-glow)] relative transition-[width] duration-300 ease-out"
        style="width: {duration ? (progress / duration) * 100 : 0}%"
      >
        {#if performanceProfile !== 'potato' && performanceProfile !== 'low'}
          <div
            class="absolute inset-0 w-64 bg-white/20 skew-x-[-30deg] animate-[laserSweep_3s_infinite]"
          ></div>
        {/if}
      </div>
    </div>
  </div>

  <div
    class="h-full w-full flex items-center justify-between px-6 md:px-12 gap-4 md:gap-8 relative z-10"
  >
    <!-- Section 1: Track Info (Left) -->
    <div class="flex-1 min-w-0 flex items-center gap-4 md:gap-6">
      <div
        class="w-12 h-12 md:w-20 md:h-20 bg-black/40 border border-white/10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xl overflow-hidden relative group/cover transition-all duration-500 hover:scale-105"
      >
        {#if currentCover}
          <img
            src={fixPath(currentCover)}
            alt=""
            class="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover/cover:scale-110 {isCrossfading
              ? 'artwork-entrance'
              : ''}"
          />
        {:else}
          <svg
            class="w-6 h-6 md:w-8 md:h-8 text-white/10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343-2-3-2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343-2-3-2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            /></svg
          >
        {/if}
        <div
          class="absolute inset-0 bg-black/20 opacity-0 group-hover/cover:opacity-100 transition-opacity"
        ></div>
      </div>

      <div class="flex flex-col min-w-0">
        <h3
          class="text-sm md:text-xl font-bold tracking-tight text-white truncate drop-shadow-lg"
        >
          <span class="{isNearDrop ? 'text-dance' : ''} {isNearDrop && performanceProfile !== 'potato' && performanceProfile !== 'low' ? 'animate-[chromaticShift_0.5s_infinite]' : ''} inline-block">
            {displayName}
          </span>
        </h3>
        <div
          class="flex items-center gap-2 mt-1 opacity-50 overflow-hidden text-[9px] md:text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
        >
          <span class="tabular-nums"
            >{formatTime(progress)} <span class="text-accent-primary opacity-50">/</span>
            {formatTime(duration)}</span
          >
          {#if isMixingZone}
            <div class="flex items-center gap-1 text-accent-primary animate-pulse ml-2">
              <span
                class="w-1 h-3 bg-current rounded-full neural-line"
                style="animation-delay: 0.1s"
              ></span>
              <span
                class="w-1 h-3 bg-current rounded-full neural-line"
                style="animation-delay: 0.2s"
              ></span>
              <span
                class="w-1 h-3 bg-current rounded-full neural-line"
                style="animation-delay: 0.3s"
              ></span>
              <span class="ml-1">Harama Engine</span>
            </div>
          {:else}
            <span class="ml-2 border-l border-white/20 pl-2">Core Active</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Section 2: Main Controls (Center) -->
    <div class="flex-shrink-0 flex items-center gap-2 md:gap-6">
      <div class="hidden md:flex items-center gap-4 mr-4">
        <button
          on:click={onToggleShuffle}
          class="p-2.5 rounded-xl transition-all {shuffleMode
            ? 'text-accent-primary bg-accent-primary/10 shadow-[0_0_20px_rgba(0,180,255,0.2)]'
            : 'text-white/30 hover:text-white/60 hover:bg-white/5'}"
          title="Shuffle"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8 7h12m0 0l-4-4m4 4l-4 4m4 4l-4 4m-12 0h12m0 0l-4-4m4 4l-4 4m-4-10H4m0 0l4 4m-4-4l4-4"
            /></svg
          >
        </button>
      </div>

      <div class="flex items-center gap-4 md:gap-8">
        <button
          on:click={onPrev}
          class="p-3 text-white/40 hover:text-white transition-colors active:scale-90"
          aria-label="Previous Track"
        >
          <svg class="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"
            ><path d="M3.3 1H0v22h3.3V1zM5.5 12l15.5 11V1L5.5 12z" /></svg
          >
        </button>

        <button
          on:click={onTogglePlay}
          class="w-12 h-12 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all duration-500 overflow-hidden relative group/play {isPlaying
            ? 'bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.2)]'
            : 'bg-accent-primary text-black shadow-[0_10px_30px_rgba(0,180,255,0.3)]'} hover:scale-105 active:scale-95"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <!-- Shiny reflection effect -->
          <div
            class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 group-hover/play:opacity-100 translate-x-[-100%] group-hover/play:translate-x-[100%] transition-all duration-700"
          ></div>

          <!-- Circular Transition HUD -->
          {#if isMixingZone}
            <svg class="absolute inset-0 w-full h-full -rotate-90 z-10 pointer-events-none">
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                fill="none"
                stroke="var(--accent-primary)"
                stroke-width="4"
                stroke-dasharray="283"
                stroke-dashoffset={283 - (283 * ($engineState?.transitionProgress || 0))}
                stroke-linecap="round"
                class="transition-all duration-300"
                style="filter: drop-shadow(0 0 5px var(--accent-glow));"
              />
            </svg>
          {/if}

          {#if isPlaying}
            <svg class="w-6 h-6 md:w-8 md:h-8" fill="currentColor" viewBox="0 0 24 24"
              ><path d="M5.7 3h4.6v18H5.7V3zm8 0h4.6v18h-4.6V3z" /></svg
            >
          {:else}
            <svg class="w-8 h-8 md:w-10 md:h-10 ml-1" fill="currentColor" viewBox="0 0 24 24"
              ><path
                d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"
              /></svg
            >
          {/if}
        </button>

        <button
          on:click={onAutomix}
          class="p-3 text-white/40 hover:text-white transition-colors active:scale-90"
          aria-label="Next / Automix"
        >
          <svg class="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"
            ><path d="M20.7 1H24v22h-3.3V1zM18.5 12L3 1v22l15.5-11z" /></svg
          >
        </button>
      </div>

      <div class="hidden md:flex items-center gap-4 ml-4">
        <button
          on:click={onToggleRepeat}
          class="p-2.5 rounded-xl transition-all {repeatMode !== 'none'
            ? 'text-accent-primary bg-accent-primary/10 shadow-[0_0_20px_rgba(0,180,255,0.2)]'
            : 'text-white/30 hover:text-white/60 hover:bg-white/5'}"
          title="Repeat"
        >
          <div class="relative">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              /></svg
            >
            {#if repeatMode !== 'none'}
              <span
                class="absolute -top-1.5 -right-2 text-[7px] font-black bg-accent-primary text-black px-1 rounded-full"
                >{repeatMode === 'one' ? '1' : 'A'}</span
              >
            {/if}
          </div>
        </button>
      </div>
    </div>

    <!-- Section 3: DSP & Volume (Right) -->
    <div class="hidden lg:flex flex-1 items-center justify-end gap-6 min-w-0">
      <div
        class="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/5 overflow-hidden group/dsp"
      >
        <button
          on:click={toggleEffectsMenu}
          class="flex items-center gap-2.5 px-5 py-2 rounded-full transition-all {showEffectsMenu ||
          activeEffect !== 'none'
            ? 'bg-white text-black'
            : 'text-white/40 hover:text-white'}"
          aria-label="Toggle DSP Effects Menu"
        >
          <span class="text-[9px] font-bold uppercase tracking-[0.2em] whitespace-nowrap"
            >DSP Engine</span
          >
          {#if activeEffect !== 'none'}
            <div class="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse"></div>
          {/if}
        </button>

        <div class="flex items-center px-4 w-32 xl:w-48 overflow-hidden group/vol">
          <svg
            class="w-4 h-4 text-white/20 group-hover/vol:text-accent-primary transition-colors flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M14 5v14l-7-5H3v-4h4l7-5zm3.5 7c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM15 4.45v15.1c3.11-.69 5.5-3.46 5.5-6.55s-2.39-5.86-5.5-6.55z"
            />
          </svg>
          <div
            class="ml-3 flex-1 h-1 bg-white/10 rounded-full relative overflow-hidden group-hover/vol:bg-white/20 transition-colors"
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              on:input={(e) => onUpdateVolume(parseFloat(e.target.value))}
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              aria-label="Volume"
            />
            <div
              class="h-full bg-white group-hover/vol:bg-accent-primary transition-all shadow-[0_0_10px_rgba(0,180,255,0.3)]"
              style="width: {volume * 100}%"
            ></div>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-center gap-1 min-w-[60px]">
        <button
          on:click={onTogglePlaybackMode}
          class="relative flex flex-col items-center group/mix"
        >
          <span
            class="text-[8px] font-bold uppercase tracking-[0.3em] mb-1.5 {mixMode
              ? 'text-accent-primary'
              : 'text-white/20 group-hover/mix:text-white/40'} transition-colors"
          >
            {mixMode ? (automixMode === 'ai' ? 'Neural' : 'Flow') : 'Classic'}
          </span>
          <div class="w-10 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              class="h-full {mixMode
                ? 'bg-accent-primary shadow-[0_0_10px_var(--accent-glow)]'
                : 'bg-transparent'} transition-all duration-500"
              style="width: 100%"
            ></div>
          </div>
        </button>
      </div>
    </div>

    <!-- Small screen DSP button -->
    <button
      on:click={toggleEffectsMenu}
      class="lg:hidden p-3 rounded-full bg-white/5 border border-white/10 text-white/40 {activeEffect !==
      'none'
        ? 'text-accent-primary border-accent-primary/30'
        : ''}"
      aria-label="Toggle DSP Effects Menu"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        />
      </svg>
    </button>
  </div>
</footer>

<style>
  @keyframes laserSweep {
    0% {
      transform: translateX(-150%) skewX(-30deg);
    }
    100% {
      transform: translateX(800%) skewX(-30deg);
    }
  }
  @keyframes gentleFlow {
    0% {
      background-position: 0% 50%;
    }
    100% {
      background-position: 100% 50%;
    }
  }
  @keyframes neuralPulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scaleY(1);
    }
    50% {
      opacity: 1;
      transform: scaleY(1.5);
    }
  }
  @keyframes chromaticShift {
    0%,
    100% {
      text-shadow:
        2px 0 #ff00ff,
        -2px 0 #00ffff;
    }
    50% {
      text-shadow:
        -2px 0 #ff00ff,
        2px 0 #00ffff;
    }
  }
  @keyframes shake {
    0%,
    100% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(1px, -1px);
    }
    50% {
      transform: translate(-1px, 1px);
    }
    75% {
      transform: translate(1px, 1px);
    }
  }

  .drop-burst {
    animation:
      dropPulse 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) infinite,
      shake 0.2s infinite;
  }

  @keyframes dropPulse {
    0% {
      box-shadow: 0 40px 120px rgba(0, 0, 0, 0.8);
    }
    50% {
      box-shadow: 0 0 100px var(--accent-glow);
      filter: saturate(200%) contrast(120%);
    }
    100% {
      box-shadow: 0 40px 120px rgba(0, 0, 0, 0.8);
    }
  }

  .artwork-entrance {
    animation: artworkIn 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  @keyframes artworkIn {
    0% {
      opacity: 0;
      transform: scale(0.9) rotate(-5deg);
      filter: var(--artwork-blur, blur(20px));
    }
    100% {
      opacity: 1;
      transform: scale(1) rotate(0deg);
      filter: blur(0px);
    }
  }

  .neural-line {
    animation: neuralPulse 1.5s ease-in-out infinite;
  }

  /* Premium Scrubber */
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 16px;
    width: 16px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    cursor: pointer;
    border: 2px solid var(--accent-primary);
    transition: transform 0.2s;
  }
  input[type='range']:hover::-webkit-slider-thumb {
    transform: scale(1.2);
  }

  .glass-premium {
    background: rgba(10, 15, 25, 0.4);
    backdrop-filter: blur(40px) saturate(200%);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .noise-overlay {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Ffilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    opacity: 0.03;
    pointer-events: none;
  }

  @keyframes text-dance {
    0%,
    100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.05) rotate(-1deg) translateY(-2px);
    }
    50% {
      transform: scale(1.1) rotate(1deg) translateY(0px);
    }
    75% {
      transform: scale(1.05) rotate(-0.5deg) translateY(-1px);
    }
  }

  .text-dance {
    animation: text-dance 0.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    display: inline-block;
    will-change: transform;
  }
</style>