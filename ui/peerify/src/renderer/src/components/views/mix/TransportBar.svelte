<script>
  import { createEventDispatcher } from 'svelte'
  import { t } from '../../../lib/i18n'

  const dispatch = createEventDispatcher()

  export let curveType = 'equal'
  export let isTempoSyncEnabled = false
  export let isAiAutomationEnabled = false
  export let isPlaying = false
  export let playheadTime = 0

  function formatTimeWithMs(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00.00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')
    const ms = Math.floor((seconds % 1) * 100)
      .toString()
      .padStart(2, '0')
    return `${m}:${s}.${ms}`
  }
</script>

<div
  class="h-auto min-h-[52px] py-2 bg-[#0A0F1C]/90 backdrop-blur-2xl border-b border-white/5 flex flex-wrap items-center px-4 shrink-0 z-20 shadow-[0_4px_15px_rgba(0,0,0,0.5)] gap-4"
>
  <div
    class="text-[10px] font-black tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
  >
    <div class="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></div>
    {$t('daw_mode_label')}
  </div>

  <div class="flex bg-black/50 rounded-lg p-0.5 gap-0.5 border border-white/5 shrink-0 ml-4">
    {#each ['equal', 'linear', 'cut', 'custom'] as type}
      <button
        on:click={() => dispatch('setCurve', type)}
        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all {curveType ===
        type
          ? 'text-accent-primary bg-white/10'
          : 'text-text-main/40 hover:text-white'}"
      >
        {$t(`mix_${type === 'custom' ? 'draw' : type}`)}
      </button>
    {/each}
  </div>

  <div class="h-4 w-px bg-white/10 mx-2"></div>

  <button
    on:click={() => dispatch('autoAlign')}
    class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-accent-primary/40 text-accent-primary hover:bg-accent-primary/20 transition-all shrink-0 shadow-[0_0_10px_var(--accent-glow)]"
  >
    {$t('auto_mix_btn')}
  </button>

  <button
    on:click={() => dispatch('toggleTempoSync')}
    class="px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 {isTempoSyncEnabled
      ? 'bg-[#1DB954]/15 border border-[#1DB954]/40 text-[#1DB954]'
      : 'bg-transparent border border-white/10 text-white/40 hover:text-white'}"
  >
    {$t('tempo_sync_btn')}
  </button>

  <button
    on:click={() => dispatch('toggleAiEq')}
    class="px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 {isAiAutomationEnabled
      ? 'bg-[#B900FF]/15 border border-[#B900FF]/40 text-[#B900FF]'
      : 'bg-transparent border border-white/10 text-white/40 hover:text-white'}"
  >
    {$t('ai_eq_btn')}
  </button>

  <div class="flex-1"></div>

  <div
    class="text-[12px] font-mono font-black text-white tabular-nums bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 shrink-0 shadow-inner"
  >
    {formatTimeWithMs(playheadTime)}
  </div>

  <button
    on:click={() => dispatch(isPlaying ? 'stop' : 'play')}
    class="w-10 h-10 rounded-full flex items-center justify-center transition-all focus:outline-none shrink-0 {isPlaying
      ? 'bg-[#FF4081] text-white shadow-[0_0_15px_rgba(255,64,129,0.5)] scale-105'
      : 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:scale-110'}"
  >
    {#if isPlaying}
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"
        ><rect x="6" y="6" width="12" height="12" rx="2" /></svg
      >
    {:else}
      <svg class="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"
        ><path d="M8 5v14l11-7z" /></svg
      >
    {/if}
  </button>

  <button
    on:click={() => dispatch('save')}
    class="px-4 py-1.5 rounded-full bg-accent-primary text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_var(--accent-glow)]"
  >
    {$t('save_mix')}
  </button>
</div>
