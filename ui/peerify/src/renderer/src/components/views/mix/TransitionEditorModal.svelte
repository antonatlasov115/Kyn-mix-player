<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { fade, scale } from 'svelte/transition'
  import { t } from '../../../lib/i18n'
  import { playbackManager } from '../../../lib/managers/PlaybackManager'
  import { isModalOpen } from '../../../lib/stores/ui'
  import WaveformStatic from './WaveformStatic.svelte'

  const dispatch = createEventDispatcher()


  export let trackA // Outgoing
  export let trackB // Incoming
  
  export let initialOffset = 0
  export let initialDuration = 4.0
  export let initialCurve = 'equal'

  let transition = {
    crossfade: 4.0,
    curve: 'equal',
    offset: 0
  }

  onMount(() => {
    isModalOpen.set(true)
    // Initialize from props
    transition = {
        crossfade: initialDuration,
        curve: initialCurve,
        offset: initialOffset
    }
  })

  onDestroy(() => {
    isModalOpen.set(false)
  })

  const PIXELS_PER_SECOND = 15 // As requested: 15px = 1s

  let isDragging = false
  let startX = 0
  let startOffset = 0
  let isPreviewing = false

  function startDrag(e) {
    isDragging = true
    startX = e.clientX
    startOffset = transition.offset
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
  }

  function onDrag(e) {
    if (!isDragging) return
    const deltaX = e.clientX - startX
    const deltaSeconds = deltaX / PIXELS_PER_SECOND
    
    let newOffset = startOffset + deltaSeconds
    // Limit to ±30s as per user suggestion
    transition.offset = Math.max(-30, Math.min(30, Math.round(newOffset * 10) / 10))
  }

  function stopDrag() {
    isDragging = false
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)
  }

  async function togglePreview() {
    isPreviewing = !isPreviewing
    if (isPreviewing) {
        await playbackManager.previewTransition(trackA, trackB, {
            duration: transition.crossfade,
            curve: transition.curve,
            offset: transition.offset
        });
        // Auto reset preview flag when stopped/finished
        isPreviewing = false
    } else {
        // Stop logic if needed, but previewTransition handles manual stop via store change
    }
  }

  function save() {
    dispatch('save', {
        offset: transition.offset,
        duration: transition.crossfade,
        curve: transition.curve
    })
  }

  function close() {
    dispatch('close')
  }

  function handleCancel() {
    dispatch('close')
  }
</script>

<div 
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 backdrop-blur-3xl transition-all"
    on:click|self={handleCancel}
    on:keydown={(e) => e.key === 'Escape' && handleCancel()}
    role="button"
    tabindex="-1"
    transition:fade
>
  <div 
    class="w-[900px] bg-[#0d0d0f] border border-white/10 rounded-[3rem] p-12 shadow-[0_40px_120px_rgba(0,0,0,0.9)] flex flex-col gap-10 glass-noise relative overflow-hidden"
    transition:scale={{ start: 0.95, duration: 400 }}
  >
    <!-- Background Decor -->
    <div class="absolute -top-24 -left-24 w-64 h-64 bg-accent-secondary/10 blur-[120px] rounded-full pointer-events-none"></div>
    <div class="absolute -bottom-24 -right-24 w-80 h-80 bg-accent-primary/10 blur-[150px] rounded-full pointer-events-none"></div>
    
    <div class="flex justify-between items-center relative z-10">
      <div class="flex flex-col">
        <h2 class="text-3xl font-black text-white uppercase tracking-[0.25em] italic leading-none">
            {$t('transition_editor') || 'Transition Studio'}
        </h2>
        <div class="flex items-center gap-4 mt-3">
            <span class="px-3 py-1 rounded-full bg-accent-secondary/20 text-[10px] font-black text-accent-secondary uppercase tracking-widest border border-accent-secondary/20">{trackA?.title || 'Track A'}</span>
            <div class="w-8 h-[2px] bg-white/10"></div>
            <span class="px-3 py-1 rounded-full bg-accent-primary/20 text-[10px] font-black text-accent-primary uppercase tracking-widest border border-accent-primary/20">{trackB?.title || 'Track B'}</span>
        </div>
      </div>
      <button 
        class="w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 transition-all border border-white/5 hover:border-rose-500/20" 
        on:click={handleCancel}
        aria-label="Close Editor"
      >
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Timeline / Waveform Studio View -->
    <div class="relative h-64 bg-black/60 rounded-[2rem] border border-white/5 overflow-hidden flex flex-col justify-center group/timeline shadow-inner">
      
      <!-- Track A View (Top Half) -->
      <div class="absolute top-6 left-0 w-1/2 h-20 border-r-2 border-accent-secondary/40">
        <WaveformStatic 
            track={trackA} 
            color="#ff00ff" 
            align="right" 
            height={80} 
            showCurve="outgoing"
            curveType={transition.curve}
            bpm={trackA.bpm}
            showPhrases={transition.curve === 'power_mix'}
        />
        <div class="absolute top-0 right-3 text-[10px] font-black text-[#ff00ff]/60 uppercase tracking-widest italic">Outro</div>
      </div>

      <!-- Crossfade Zone -->
      <div 
        class="absolute inset-y-0 bg-white/[0.02] border-x border-white/10 pointer-events-none z-10 flex items-center justify-center"
        style="left: calc(50% - {(transition.crossfade * PIXELS_PER_SECOND) / 2}px); width: {transition.crossfade * PIXELS_PER_SECOND}px;"
      >
        <div class="h-full w-full bg-gradient-to-r from-accent-secondary/5 via-transparent to-accent-primary/5"></div>
        <div class="absolute -top-2 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-black text-white tracking-widest border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            {transition.crossfade.toFixed(1)}s CROSSFADE
        </div>
      </div>

      <!-- Track B View (Bottom Half, Draggable) -->
      <div 
        class="absolute bottom-6 h-20 cursor-ew-resize hover:brightness-125 group/b active:scale-[0.99] transition-transform"
        style="left: calc(50% + {transition.offset * PIXELS_PER_SECOND}px); width: 1000px;"
        on:mousedown={startDrag}
        role="slider"
        aria-label="Transition Offset"
        aria-valuemin="-30"
        aria-valuemax="30"
        aria-valuenow={transition.offset}
        tabindex="0"
      >
        <div class="relative w-full h-full">
            <WaveformStatic 
                track={trackB} 
                color="#00ffff" 
                align="left" 
                height={80} 
                showCurve="incoming"
                curveType={transition.curve}
                bpm={trackB.bpm}
                showPhrases={transition.curve === 'power_mix'}
            />
            <div class="absolute left-0 top-0 bottom-0 w-[4px] bg-accent-primary shadow-[0_0_25px_rgba(0,255,255,0.8)] group-hover/b:scale-x-125 transition-transform rounded-full"></div>
            <div class="absolute top-0 left-3 text-[10px] font-black text-[#00ffff]/60 uppercase tracking-widest italic">Intro</div>
            
            <div class="absolute -bottom-4 left-0 text-[10px] font-black text-accent-primary bg-[#0d0d0f] px-3 py-1 rounded-full border border-accent-primary/30 shadow-xl">
                OFFSET: {transition.offset > 0 ? '+' : ''}{transition.offset.toFixed(1)}s
            </div>
        </div>
      </div>

      <!-- Center Playhead Marker -->
      <div class="absolute inset-y-0 left-1/2 w-[1px] bg-white/15 z-20 pointer-events-none shadow-[0_0_10px_white]"></div>
    </div>

    <!-- Interface Grid -->
    <div class="grid grid-cols-12 gap-8 items-end relative z-10">
      
      <!-- Curve Selection -->
      <div class="col-span-5 flex flex-col gap-5">
        <label for="curve-algorithm" class="text-[12px] font-black text-white/20 uppercase tracking-[0.4em] block ml-1">
            Curve Algorithm
        </label>
        <div id="curve-algorithm" class="flex gap-4">
          {#each [
            {id: 'equal', label: 'POWER', icon: '🌊'}, 
            {id: 'power_mix', label: 'AI MIX', icon: '🤖'},
            {id: 'linear', label: 'LINEAR', icon: '📉'}, 
            {id: 'cut', label: 'CUT', icon: '✂️'}
          ] as c}
            <button 
              class="flex-1 py-5 rounded-[1.5rem] text-[10px] font-black transition-all uppercase tracking-[0.2em] border
              {transition.curve === c.id 
                ? 'bg-accent-primary text-black border-accent-primary shadow-[0_15px_40px_rgba(0,229,255,0.4)] scale-[1.05]' 
                : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]'}"
              on:click={() => transition.curve = c.id}
            >
              <span class="block text-lg mb-1">{c.icon}</span>
              {c.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Duration Control -->
      <div class="col-span-4 flex flex-col gap-5">
        <label for="transition-timing" class="text-[12px] font-black text-white/20 uppercase tracking-[0.4em] flex justify-between mr-1">
          <span>Timing</span>
          <span class="text-accent-primary italic font-black text-sm">{transition.crossfade}s</span>
        </label>
        <div class="bg-white/5 p-6 rounded-[1.5rem] border border-white/5">
            <input 
              id="transition-timing"
              type="range" min="0.5" max="16" step="0.5" 
              bind:value={transition.crossfade} 
              class="w-full accent-accent-primary cursor-pointer h-1.5 bg-white/10 rounded-full appearance-none mb-2"
            >
            <div class="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest mt-2">
                <span>Fast</span>
                <span>Cinematic</span>
            </div>
        </div>
      </div>

      <!-- Preview Action -->
      <div class="col-span-3 pb-1">
        <button 
            on:click={togglePreview}
            class="w-full py-8 rounded-[1.5rem] bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-black uppercase tracking-[0.2em] text-[11px] hover:bg-indigo-500/20 hover:scale-[1.05] transition-all shadow-[0_10px_30px_rgba(99,102,241,0.1)] active:scale-95"
        >
            <span class="block text-2xl mb-1">{isPreviewing ? '⏹' : '▶'}</span>
            {isPreviewing ? 'Stop' : 'Preview'}
        </button>
      </div>
    </div>

    <!-- Action Bar -->
    <div class="flex justify-end gap-6 pt-10 border-t border-white/5 relative z-10">
      <button 
        class="px-10 py-5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 font-black uppercase tracking-[0.2em] text-[11px] transition-all" 
        on:click={handleCancel}
      >
        { $t('cancel') ? 'Cancel' : 'Cancel' }
      </button>
      <button 
        class="px-14 py-5 rounded-2xl bg-accent-primary hover:scale-[1.05] active:scale-[0.98] text-black font-black uppercase tracking-[0.2em] text-[12px] transition-all shadow-[0_20px_60px_rgba(0,229,255,0.4)]" 
        on:click={save}
      >
        Commit Transition
      </button>
    </div>
  </div>
</div>

<style>
  .glass-noise {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Ffilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    background-size: 150px;
    background-blend-mode: overlay;
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 5px 20px rgba(0,0,0,0.8);
    border: 3px solid var(--accent-primary);
  }
</style>
