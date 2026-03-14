<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let metrics = [];
  let interval;
  let visible = false;

  const updateMetrics = async () => {
    if (!visible) return;
    try {
      metrics = await window.peerifyAPI.getResourceUsage();
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    }
  };

  const handleKeydown = (e) => {
    // Toggle with Ctrl+Alt+D (or Cmd+Option+D on Mac)
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
      visible = !visible;
      if (visible) {
        updateMetrics();
        interval = setInterval(updateMetrics, 1000);
      } else {
        clearInterval(interval);
      }
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    clearInterval(interval);
  });

  function formatMemory(mb) {
    if (mb > 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb.toFixed(1) + ' MB';
  }

  function getCpuColor(cpu) {
    if (cpu > 70) return 'text-red-500';
    if (cpu > 30) return 'text-yellow-500';
    return 'text-green-400';
  }
</script>

{#if visible}
  <div
    class="resource-monitor fixed top-4 right-4 z-[9999] w-72 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-4 shadow-2xl text-white font-mono text-xs select-none pointer-events-none"
    transition:fly={{ y: -20, duration: 400 }}
  >
    <div class="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
      <span class="font-bold uppercase tracking-wider text-[10px] opacity-60">System Monitor</span>
      <span class="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[9px]">LIVE</span>
    </div>

    <div class="space-y-3">
      {#each metrics as m (m.pid)}
        <div class="flex flex-col space-y-1">
          <div class="flex justify-between items-center">
            <span class="truncate pr-2 font-semibold text-white/90">
              {m.type} <span class="opacity-40 text-[9px] font-normal">#{m.pid}</span>
            </span>
            <span class="font-bold {getCpuColor(m.cpu)}">
              {m.cpu.toFixed(1)}%
            </span>
          </div>
          <div class="flex justify-between items-center opacity-60">
            <div class="h-1 flex-1 bg-white/5 rounded-full mr-3 overflow-hidden">
                <div class="h-full bg-blue-500/50" style="width: {Math.min(m.cpu, 100)}%"></div>
            </div>
            <span class="text-[10px] tabular-nums">{formatMemory(m.memory)}</span>
          </div>
        </div>
      {/each}
    </div>

    {#if metrics.length === 0}
      <div class="py-4 text-center opacity-40 italic">
        Gathering data...
      </div>
    {/if}

    <div class="mt-4 pt-2 border-t border-white/10 text-center">
        <span class="text-[9px] opacity-30 italic">Press Ctrl+Alt+D to hide</span>
    </div>
  </div>
{/if}

<style>
    .resource-monitor {
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
    }
</style>
