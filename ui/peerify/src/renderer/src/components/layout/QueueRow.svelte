<script>
  import { t } from '../../lib/i18n'
  import { flip } from 'svelte/animate'
  import { fly, fade } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'

  export let item
  export let index
  export let onPlayFromQueue
  export let onRemoveFromQueue
  export let onToggleCurve

  function toggleCurve() {
    onToggleCurve(index)
  }
</script>

<div
  class="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-6 hover:bg-white/10 hover:border-white/30 backdrop-blur-sm transition-all group shadow-lg h-[114px]"
>
  <button
    on:click={() => onPlayFromQueue(index)}
    class="w-12 h-12 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-accent-primary hover:text-black hover:shadow-[0_0_15px_#00E5FF] transition-all focus:outline-none flex-shrink-0"
    title={$t('play_now')}
  >
    <svg class="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  </button>

  <div class="flex-1 min-w-0">
    <div
      class="font-black text-white text-lg truncate drop-shadow-sm group-hover:text-accent-primary transition-colors flex items-center gap-2"
    >
      {item.track.query}
      {#if item.recipeData}
        <span
          class="px-2 py-0.5 rounded-full bg-accent-primary/20 border border-accent-primary/40 text-accent-primary text-[8px] uppercase tracking-widest animate-pulse"
        >
          {$t('recipe_badge')}
        </span>
      {/if}
    </div>
    <div
      class="text-[11px] font-bold text-[#B8C5D6] uppercase tracking-wider mt-1 truncate opacity-80"
    >
      {#if item.recipeData}
        <span class="text-accent-primary/80">{item.recipeData.name}</span>
      {:else}
        {$t('bpm_label')}: {item.track.title.replace('BPM: ', '')} | {item.track.genre}
      {/if}
    </div>
  </div>

  <div class="w-56 flex flex-col gap-3 bg-black/20 p-3.5 rounded-xl border border-white/5 shadow-inner">
    <div class="flex justify-between text-[11px] uppercase font-black tracking-widest text-text-main">
      <span>{$t('automix_label')}</span>
      <span class="text-accent-primary drop-shadow-[0_0_5px_var(--accent-glow)]">{item.crossfade}s</span>
    </div>
    <input
      type="range"
      min="0"
      max="15"
      step="1"
      bind:value={item.crossfade}
      class="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer outline-none shadow-inner"
      style="background: linear-gradient(to right, var(--accent-primary) {(item.crossfade / 15) * 100}%, transparent {(item.crossfade / 15) * 100}%);"
    />

    <div class="flex justify-between items-center text-[10px] font-bold uppercase text-[#B8C5D6] mt-1 border-t border-white/5 pt-2">
      <span>{$t('curve_label')}:</span>
      <button
        on:click={toggleCurve}
        class="flex items-center gap-1.5 bg-white/5 border border-white/10 text-accent-primary outline-none rounded-full px-3 py-1 hover:bg-white/10 hover:border-accent-primary/40 transition-all shadow-inner focus:outline-none focus:shadow-[0_0_10px_var(--accent-glow)]"
        title={$t('curve_toggle_hint')}
      >
        {#if item.curve === 'linear'}
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="20" x2="20" y2="4" />
          </svg>
          {$t('curve_linear')}
        {:else if item.curve === 'cut'}
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4,20 20,20 20,4" />
          </svg>
          {$t('curve_cut')}
        {:else}
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 20 Q 12 4 20 4" />
          </svg>
          {$t('curve_equal')}
        {/if}
      </button>
    </div>
  </div>

  <button
    on:click={() => onRemoveFromQueue(item.id)}
    class="w-10 h-10 rounded-full flex items-center justify-center text-text-main opacity-0 group-hover:opacity-100 hover:text-black hover:bg-accent-primary hover:shadow-[0_0_15px_var(--accent-glow)] transition-all focus:outline-none flex-shrink-0"
    title={$t('remove_from_queue')}
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
</div>
