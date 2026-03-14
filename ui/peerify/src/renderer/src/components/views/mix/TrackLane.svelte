<script>
  import { createEventDispatcher } from 'svelte'
  import { t } from '../../../lib/i18n'

  const dispatch = createEventDispatcher()

  export let track = {}
  export let zoom = 100
  export let isDraggable = false
  export let isSnapped = false
  export let t2PitchRatio = 1.0

  function handleDragStart(e) {
    if (isDraggable) {
      dispatch('dragstart', e)
    }
  }

  function handleLoad() {
    dispatch('load')
  }

  function handleClear() {
    dispatch('clear')
  }
</script>

<div class="relative h-[130px] flex items-center z-10 group">
  {#if !track.filepath}
    <button
      on:click={handleLoad}
      class="absolute z-20 text-[10px] font-black uppercase tracking-wider bg-black/80 border border-white/20 text-white px-4 py-2 rounded-xl hover:bg-accent-primary hover:text-black hover:border-transparent transition-all shadow-xl"
      style="left: 8px;"
    >
      + {$t('load_track')}
      {track.id + 1}
    </button>
  {:else}
    <div
      class="absolute h-[110px] rounded-2xl overflow-hidden bg-[#0A1128]/80 backdrop-blur-md border-2 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.6)] {isDraggable
        ? 'cursor-grab active:cursor-grabbing'
        : ''} {isSnapped
        ? 'border-accent-primary shadow-[0_0_25px_var(--accent-glow)]'
        : 'opacity-80 border-white/10 hover:border-accent-primary/50'}"
      style="left: {(track.offset || 0) * zoom}px; width: {track.duration * zoom}px; {isDraggable
        ? `transform-origin: left; transform: scaleX(${1.0 / t2PitchRatio});`
        : ''}"
      on:mousedown={handleDragStart}
      role="button"
      tabindex="0"
    >
      {#if isDraggable}
        <div
          class="absolute top-0 bottom-0 left-0 w-8 bg-white/5 hover:bg-white/10 flex flex-col justify-center items-center gap-1.5 border-r border-white/10 transition-colors z-20"
        >
          <div class="w-1 h-1 bg-white/60 rounded-full"></div>
          <div class="w-1 h-1 bg-white/60 rounded-full"></div>
          <div class="w-1 h-1 bg-white/60 rounded-full"></div>
        </div>
      {/if}

      <div
        class="absolute top-2 left-12 flex items-center gap-2 px-3 py-1 rounded-lg bg-black/80 z-10"
        style={isDraggable ? `transform: scaleX(${t2PitchRatio}); transform-origin: left;` : ''}
      >
        <div
          class="w-2.5 h-2.5 rounded-full bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]"
        ></div>
        <span class="text-[10px] font-bold text-white truncate max-w-[250px]">{track.name}</span>
        {#if track.meta && track.meta.bpm}
          <span class="text-[9px] font-mono text-accent-primary ml-2"
            >{Math.round(track.meta.bpm)} BPM</span
          >
        {/if}
      </div>


      {#if track.meta}
        {#if track.meta.outro_start}
          <div
            class="absolute top-0 bottom-0 z-10 w-px border-l border-dashed border-[#FF0055]/70 pointer-events-none"
            style="left: {(track.meta.outro_start / track.duration) * 100}%;"
          ></div>
          <div
            class="absolute bottom-2 z-20 px-2 py-0.5 rounded bg-[#FF0055] text-[8px] font-black text-white shadow-[0_0_10px_#FF0055] -translate-x-1/2"
            style="left: {(track.meta.outro_start / track.duration) * 100}%;"
          >
            OUTRO
          </div>
        {/if}
        {#if track.meta.intro_end}
          <div
            class="absolute top-0 bottom-0 z-10 w-[2px] bg-gradient-to-t from-transparent via-[#00FF88] to-transparent pointer-events-none shadow-[0_0_8px_#00FF88]"
            style="left: {(track.meta.intro_end / track.duration) * 100}%;"
          ></div>
          <div
            class="absolute bottom-0 z-20 px-2 py-0.5 rounded-t-md bg-[#00FF88] text-[8px] font-black text-black shadow-[0_0_10px_#00FF88] -translate-x-1/2"
            style="left: {(track.meta.intro_end / track.duration) * 100}%; {isDraggable
              ? `transform: scaleX(${t2PitchRatio});`
              : ''}"
          >
            INTRO
          </div>
        {/if}
        {#if track.meta.drop_pos}
          <div
            class="absolute top-0 bottom-0 z-10 w-[2px] bg-gradient-to-b from-transparent via-[#FFD700] to-transparent pointer-events-none shadow-[0_0_8px_#FFD700]"
            style="left: {(track.meta.drop_pos / track.duration) * 100}%;"
          ></div>
          <div
            class="absolute top-0 z-20 px-2 py-0.5 rounded-b-md bg-[#FFD700] text-[8px] font-black text-black shadow-[0_0_10px_#FFD700] -translate-x-1/2"
            style="left: {(track.meta.drop_pos / track.duration) * 100}%; {isDraggable
              ? `transform: scaleX(${t2PitchRatio});`
              : ''}"
          >
            DROP
          </div>
        {/if}
      {/if}

      <slot name="overlap"></slot>
    </div>

    <button
      on:click|stopPropagation={handleClear}
      class="absolute z-30 flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all shadow-lg"
      style="left: 8px; top: 10px;"
      title={$t('remove_from_lib')}
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="3"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  {/if}
</div>
