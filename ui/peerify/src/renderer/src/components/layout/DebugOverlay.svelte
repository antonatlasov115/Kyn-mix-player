<script>
  import { onMount } from 'svelte'
  import { audioManager } from '../../lib/audioManager'
  import { engineState } from '../../lib/stores/engine'
  import { fade, fly } from 'svelte/transition'
  import CrossfadeGraph from './CrossfadeGraph.svelte'
  
  let saveFlash = false;
  const toggleRec = () => {
    if ($engineState.isRecording) audioManager.stopRecording();
    else audioManager.startRecording();
  };

  const saveLogs = async () => {
    const path = await audioManager.exportLog();
    if (path) {
      saveFlash = true;
      setTimeout(() => saveFlash = false, 2000);
    }
  };
  
  export let visible = false;

  // Persistence and State
  let x = 24; // Default from right
  let y = 80; // Default from top
  let w = 320;
  let h = 'auto';
  let isDragging = false;
  let isResizing = false;
  let startX, startY, startW, startH, startLeft, startTop;

  onMount(() => {
    const saved = localStorage.getItem('peerify_debug_geo');
    if (saved) {
      const geo = JSON.parse(saved);
      x = geo.x; y = geo.y; w = geo.w; h = geo.h;
    }
  });

  function saveGeo() {
    localStorage.setItem('peerify_debug_geo', JSON.stringify({ x, y, w, h }));
  }

  function startDrag(e) {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = x;
    startTop = y;
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
  }

  function onDrag(e) {
    if (!isDragging) return;
    x = startLeft - (e.clientX - startX);
    y = startTop + (e.clientY - startY);
  }

  function stopDrag() {
    isDragging = false;
    saveGeo();
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
  }

  function startResize(e) {
    e.stopPropagation();
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = w;
    const el = document.getElementById('debug-overlay');
    startH = el.offsetHeight;
    window.addEventListener('mousemove', onResize);
    window.addEventListener('mouseup', stopResize);
  }

  function onResize(e) {
    if (!isResizing) return;
    w = Math.max(200, startW - (e.clientX - startX));
    h = Math.max(150, startH + (e.clientY - startY));
  }

  function stopResize() {
    isResizing = false;
    saveGeo();
    window.removeEventListener('mousemove', onResize);
    window.removeEventListener('mouseup', stopResize);
  }

  $: scale = Math.max(0.6, w / 320);

  const formatNum = (n) => (n || 0).toFixed(2);
  const getW = (val, min, max) => {
    const p = ((val - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, p));
  };
</script>

{#if visible}
  <div 
    id="debug-overlay"
    class="fixed z-[1000] glass-debug border border-white/10 rounded-3xl p-5 font-mono select-none flex flex-col overflow-hidden"
    style="right: {x}px; top: {y}px; width: {w}px; height: {h === 'auto' ? 'auto' : h + 'px'}; cursor: {isDragging ? 'grabbing' : 'auto'}; font-size: {10 * scale}px;"
    transition:fly={{ x: 50, duration: 400 }}
  >
    <!-- DRAG HEADER -->
    <div 
      class="flex items-center justify-between mb-4 border-b border-white/5 pb-2 cursor-grab active:cursor-grabbing"
      on:mousedown={startDrag}
      role="button"
      tabindex="0"
    >
      <span class="text-accent-primary font-black uppercase tracking-widest" style="font-size: 0.9em">Engine Monitor v2.1</span>
      <div class="flex items-center gap-2">
        <div class="rounded-full {$engineState.limiterActive ? 'bg-red-500 animate-pulse shadow-[0_0_10px_red]' : 'bg-green-500'}" style="width: 0.6em; height: 0.6em"></div>
        <span class="opacity-40" style="font-size: 0.8em">BPM: {$engineState.masterBpm.toFixed(1)}</span>
      </div>
    </div>

    {#if $engineState.isCrossfading}
      <div transition:fade={{ duration: 200 }}>
        <CrossfadeGraph />
      </div>
    {/if}

    <!-- CONTENT -->
    <div class="flex-1 overflow-y-auto custom-scrollbar pr-1">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {#each $engineState.decks as deck, i}
          <div class="space-y-3 min-w-0">
            <div class="flex items-center justify-between font-black uppercase {i === 0 ? 'text-blue-400' : 'text-purple-400'}" style="font-size: 0.8em">
              <span>Deck {i}</span>
              <span>{Math.round(deck.vol * 100)}%</span>
            </div>
            
            <!-- VU / Gain Meter -->
            <div class="space-y-1">
              <div class="flex justify-between opacity-40" style="font-size: 0.7em"><span>Gain / VU</span><span>{formatNum(deck.normGain)}x</span></div>
              <div class="bg-white/5 rounded-full overflow-hidden flex gap-0.5" style="height: 0.4em">
                <div class="h-full bg-accent-primary transition-all duration-75" style="width: {Math.min(100, deck.level * 100)}%"></div>
                <div class="h-full bg-white/20" style="width: {Math.max(0, 100 - deck.level * 100)}%"></div>
              </div>
            </div>

            <!-- Waveform Debug -->
            <div class="space-y-1">
              <div class="flex justify-between opacity-40" style="font-size: 0.7em">
                <span>Waveform</span>
                <span class={deck.waveform?.length > 0 ? 'text-accent-primary' : 'text-red-400'}>
                  {deck.waveform?.length > 0 ? `READY (${deck.waveform.length})` : 'MISSING'}
                </span>
              </div>
              {#if deck.waveform?.length > 0}
                <div class="h-4 bg-white/5 rounded relative overflow-hidden">
                  <svg viewBox="0 0 {deck.waveform.length} 100" class="w-full h-full" preserveAspectRatio="none">
                    <path 
                      d={deck.waveform.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i} ${50 - v * 40} L ${i} ${50 + v * 40}`).join(' ')}
                      stroke="var(--accent-primary)"
                      stroke-width="1"
                      fill="none"
                      opacity="0.8"
                    />
                  </svg>
                </div>
              {/if}
            </div>

            <!-- EQ SECTION -->
            <div class="space-y-1.5">
              {#each [['BAS', deck.bass, -45, 12], ['MID', deck.mid, -45, 12], ['HIG', deck.high, -45, 12]] as [label, val, min, max]}
                <div class="flex items-center gap-2">
                  <span class="w-[15%] opacity-30" style="font-size: 0.7em">{label}</span>
                  <div class="flex-1 bg-white/5 rounded-full overflow-hidden" style="height: 0.2em">
                    <div class="h-full bg-white/40" style="width: {getW(val, min, max)}%"></div>
                  </div>
                  <span class="w-[20%] text-right {val < -10 ? 'text-red-400/50' : val > 3 ? 'text-accent-primary' : 'opacity-40'}">{Math.round(val)}</span>
                </div>
              {/each}
            </div>

            <!-- DSP STATE -->
            <div class="pt-1 flex flex-wrap gap-1" style="font-size: 0.7em">
              {#if deck.hpf > 0.01}<span class="px-1 bg-white/5 rounded text-white/40">HPF</span>{/if}
              {#if deck.reverb > 0.01}<span class="px-1 bg-white/5 rounded text-white/40">REV</span>{/if}
              {#if Math.abs(deck.pitch - 1.0) > 0.01}<span class="px-1 bg-white/5 rounded text-white/40">PCH</span>{/if}
            </div>
          </div>
        {/each}
      </div>

      {#if $engineState.isCrossfading}
        <div class="mt-4 pt-4 border-t border-white/5 space-y-2" transition:fade>
          <div class="flex justify-between items-center text-[0.8em] font-black uppercase tracking-widest">
            <span class="text-accent-primary">Sync Performance</span>
            <span class={Math.abs($engineState.syncOffsetMs) < 15 ? 'text-green-400' : Math.abs($engineState.syncOffsetMs) < 40 ? 'text-yellow-400' : 'text-red-400'}>
              {Math.abs($engineState.syncOffsetMs).toFixed(1)}ms
            </span>
          </div>
          
          <!-- Sync Offset Bar -->
          <div class="relative h-2 bg-white/5 rounded-full overflow-hidden flex items-center justify-center">
            <div class="absolute h-full w-0.5 bg-white/40 z-10"></div> <!-- Center Line -->
            {#if $engineState.syncOffsetMs > 0}
               <div class="absolute h-full bg-blue-400 transition-all duration-75" 
                    style="left: 50%; width: {Math.min(50, ($engineState.syncOffsetMs / 100) * 50)}%"></div>
            {:else}
               <div class="absolute h-full bg-purple-400 transition-all duration-75" 
                    style="right: 50%; width: {Math.min(50, (Math.abs($engineState.syncOffsetMs) / 100) * 50)}%"></div>
            {/if}
          </div>
          <div class="flex justify-between opacity-30 text-[0.6em] font-black uppercase">
            <span>Slow</span>
            <span>Tight</span>
            <span>Fast</span>
          </div>
        </div>

        <div class="mt-4 pt-2 border-t border-white/5 flex items-center justify-center gap-2 animate-pulse text-accent-primary">
          <span class="w-1 h-1 rounded-full bg-current"></span>
          <span class="uppercase tracking-[0.2em] font-black" style="font-size: 0.8em">X-Fade Active</span>
          <span class="w-1 h-1 rounded-full bg-current"></span>
        </div>
      {/if}
    </div>

    <!-- FOOTER: DIAGNOSTIC CONTROLS -->
    <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <button 
          on:click={toggleRec}
          class="px-3 py-1.5 rounded-full font-black uppercase tracking-widest flex items-center gap-2 transition-all {$engineState.isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-white/40 hover:bg-white/10'}"
          style="font-size: 0.7em"
        >
          <span class="w-2 h-2 rounded-full {$engineState.isRecording ? 'bg-white' : 'bg-red-500'}"></span>
          {$engineState.isRecording ? 'Stop' : 'Rec'}
        </button>
        
        <button 
          on:click={saveLogs}
          class="px-3 py-1.5 rounded-full font-black uppercase tracking-widest transition-all {saveFlash ? 'bg-green-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}"
          style="font-size: 0.7em"
        >
          {saveFlash ? 'SAVED!' : 'Save Log'}
        </button>
      </div>
      
      {#if $engineState.isRecording}
        <div class="text-[0.6em] font-bold text-red-400 uppercase tracking-widest animate-pulse">Capturing State...</div>
      {/if}
    </div>

    <!-- RESIZE HANDLE -->
    <div 
      class="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize flex items-center justify-center pointer-events-auto"
      on:mousedown={startResize}
      role="button"
      tabindex="0"
    >
      <div class="w-1.5 h-1.5 border-b-2 border-l-2 border-white/20 rounded-bl-sm"></div>
    </div>
  </div>
{/if}

<style>
  .glass-debug {
    background: rgba(10, 15, 25, 0.7);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 32px 64px rgba(0,0,0,0.5);
  }
</style>
