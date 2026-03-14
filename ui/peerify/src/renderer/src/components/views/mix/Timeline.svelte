<script>
  import { createEventDispatcher } from 'svelte'
  import { t } from '../../../lib/i18n'

  const dispatch = createEventDispatcher()

  export let totalTimelineDuration = 60
  export let zoom = 100
  export let bpm = 0

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')
    return `${m}:${s}`
  }

  function handleSeek(e) {
    dispatch('seek', e)
  }
</script>

<div
  class="h-8 border-b border-white/10 flex items-end sticky top-0 bg-[#060A14]/95 backdrop-blur-xl z-30 shadow-[0_4px_15px_rgba(0,0,0,0.6)] cursor-text group"
  on:mousedown={handleSeek}
  role="presentation"
>
  {#each Array(Math.ceil(totalTimelineDuration)) as _, sec}
    {#if sec % 5 === 0}
      <div class="absolute" style="left: {sec * zoom}px;">
        <span class="text-[9px] text-accent-primary font-mono font-black pl-1"
          >{formatTime(sec)}</span
        >
        <div class="h-3 border-l-2 border-accent-primary/40 mt-0.5"></div>
      </div>
    {:else}
      <div class="absolute h-2 border-l border-white/10" style="left: {sec * zoom}px;"></div>
    {/if}
  {/each}

  {#if bpm > 0}
    {@const beatDur = 60.0 / bpm}
    {@const beatsTotal = Math.min(500, Math.ceil(totalTimelineDuration / beatDur))}
    <div
      class="absolute top-8 bottom-0 left-0 pointer-events-none z-5"
      style="width: {totalTimelineDuration * zoom}px;"
    >
      {#each Array(beatsTotal) as _, i}
        {@const beatX = i * beatDur * zoom}
        {@const isBar = i % 4 === 0}
        <div
          class="absolute top-0 bottom-[-1000px] w-px {isBar ? 'opacity-20' : 'opacity-5'}"
          style="left: {beatX}px; background: white;"
        ></div>
      {/each}
    </div>
  {/if}
</div>
