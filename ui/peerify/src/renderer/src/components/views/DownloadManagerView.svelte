<script>
  import { onMount, onDestroy } from 'svelte'
  import { t } from '../../lib/i18n'
  import { fade, fly, slide } from 'svelte/transition'
  import { flip } from 'svelte/animate'

  let tasks = []
  let activeCount = 0

  let unsubs = []
  onMount(async () => {
    // Initial fetch
    tasks = await window.peerifyAPI.getDownloadTasks()
    updateActiveCount()

    // Listen for updates
    if (window.peerifyAPI.onDownloadQueueUpdated) {
      unsubs.push(
        window.peerifyAPI.onDownloadQueueUpdated((newQueue) => {
          tasks = newQueue
          updateActiveCount()
        })
      )
    }

    if (window.peerifyAPI.onDownloadProgress) {
      unsubs.push(
        window.peerifyAPI.onDownloadProgress((data) => {
          const task = tasks.find((t) => t.id === data.id)
          if (task) {
            task.progress = data.progress
            tasks = [...tasks]
          }
        })
      )
    }
  })

  onDestroy(() => {
    unsubs.forEach((fn) => {
      if (typeof fn === 'function') fn()
    })
  })

  function updateActiveCount() {
    activeCount = tasks.filter((t) => t.status === 'DOWNLOADING').length
  }

  function handleCancel(id) {
    window.peerifyAPI.cancelDownload(id)
  }

  function handleClear() {
    window.peerifyAPI.clearFinishedDownloads()
  }

  function getStatusColor(status) {
    switch (status) {
      case 'DOWNLOADING':
        return 'text-accent-primary'
      case 'COMPLETED':
        return 'text-emerald-400'
      case 'FAILED':
        return 'text-rose-500'
      case 'CANCELED':
        return 'text-white/20'
      default:
        return 'text-white/40'
    }
  }

  function getStatusBg(status) {
    switch (status) {
      case 'DOWNLOADING':
        return 'bg-accent-primary/10'
      case 'COMPLETED':
        return 'bg-emerald-400/10'
      case 'FAILED':
        return 'bg-rose-500/10'
      case 'CANCELED':
        return 'bg-white/5'
      default:
        return 'bg-white/5'
    }
  }
</script>

<div class="flex-1 min-h-0 p-8 flex flex-col gap-8 overflow-y-auto mix-scrollbar" in:fade>
  <div class="flex items-end justify-between">
    <div class="flex flex-col gap-2">
      <h2 class="text-4xl font-black tracking-tighter text-white">{$t('downloads')}</h2>
      <p class="text-white/40 text-sm font-medium uppercase tracking-widest">
        {activeCount}
        {$t('active_tasks')}
      </p>
    </div>

    {#if tasks.length > 0}
      <button
        on:click={handleClear}
        class="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all"
      >
        {$t('clear_finished')}
      </button>
    {/if}
  </div>

  {#if tasks.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center text-white/10 italic" in:fade>
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
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      {$t('no_downloads_yet')}
    </div>
  {:else}
    <div class="flex flex-col gap-4 max-w-5xl">
      {#each tasks as task (task.id)}
        <div
          animate:flip={{ duration: 400 }}
          class="group relative bg-white/5 border border-white/5 rounded-3xl p-6 flex items-center gap-6 transition-all hover:bg-white/10 hover:border-white/10"
        >
          <!-- Progress Ring/Icon -->
          <div class="relative w-14 h-14 flex-shrink-0">
            <div class="absolute inset-0 rounded-full border-4 border-white/5"></div>
            {#if task.status === 'DOWNLOADING'}
              <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="8"
                  stroke-dasharray="289"
                  stroke-dashoffset={289 - (289 * task.progress) / 100}
                  class="text-accent-primary transition-all duration-300"
                />
              </svg>
            {/if}
            <div class="absolute inset-0 flex items-center justify-center">
              {#if task.status === 'COMPLETED'}
                <svg
                  class="w-6 h-6 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="3"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              {:else if task.status === 'FAILED'}
                <svg
                  class="w-6 h-6 text-rose-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="3"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              {:else if task.status === 'CANCELED'}
                <svg
                  class="w-6 h-6 text-white/20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="3"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              {:else}
                <div class="text-[10px] font-black {getStatusColor(task.status)}">
                  {Math.round(task.progress)}%
                </div>
              {/if}
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0 pr-4">
            <div class="flex items-center gap-3 mb-1">
              <span
                class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest {getStatusBg(
                  task.status
                )} {getStatusColor(task.status)}"
              >
                {$t('status_' + task.status.toLowerCase())}
              </span>
              {#if task.playlistUrl}
                <span class="text-[8px] font-black uppercase tracking-widest text-white/20">
                  {$t('playlist_member')}
                </span>
              {/if}
            </div>
            <h3
              class="font-bold text-white truncate text-lg group-hover:text-accent-primary transition-colors"
            >
              {task.title}
            </h3>
            <p class="text-xs text-white/40 truncate font-medium">
              {task.url}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2">
            {#if task.status === 'DOWNLOADING' || task.status === 'PENDING'}
              <button
                on:click={() => handleCancel(task.id)}
                class="p-3 bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-500 rounded-2xl transition-all"
                title={$t('cancel')}
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            {/if}

            {#if task.status === 'COMPLETED'}
              <div
                class="text-[10px] font-black text-emerald-400 uppercase tracking-widest pr-4 flex items-center gap-2"
              >
                <span>{$t('ready')}</span>
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
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
