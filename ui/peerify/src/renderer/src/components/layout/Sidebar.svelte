<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { t } from '../../lib/i18n'

  export let activeTab = 'home'
  export let isScanning = false
  export let scanProgress = 0
  export let playlists = []
  export let selectedPlaylist = null

  import { library } from '../../lib/stores/library'
  import { settings } from '../../lib/stores/settings'
  import { fade, slide } from 'svelte/transition'
  import { flip } from 'svelte/animate'

  const dispatch = createEventDispatcher()
  let activeDownloadCount = 0

  import { libraryManager } from '../../lib/managers/LibraryManager'

  let cleanup = null
  onMount(async () => {
    const tasks = await window.peerifyAPI.getDownloadTasks()
    activeDownloadCount = tasks.filter((t) => t.status === 'DOWNLOADING').length

    if (window.peerifyAPI.onDownloadQueueUpdated) {
      cleanup = window.peerifyAPI.onDownloadQueueUpdated((queue) => {
        activeDownloadCount = queue.filter((t) => t.status === 'DOWNLOADING').length
      })
    }
  })

  onDestroy(() => {
    if (cleanup && typeof cleanup === 'function') cleanup()
  })

  function setTab(tab) {
    activeTab = tab
    dispatch('navigate', tab)
  }

  function handleMagneticMove(e) {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`
  }

  function handleMagneticOut(e) {
    const btn = e.currentTarget
    btn.style.transform = 'translate(0, 0)'
  }
</script>

<aside
  role="navigation"
  class="bg-black/20 flex flex-col h-full border-r border-white/5 select-none backdrop-blur-[40px] z-[180] relative glass-noise transition-all duration-500 ease-in-out shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)] {$settings.sidebarCollapsed ? 'w-20' : 'w-64'}"
>
  <div
    class="p-4 mb-4 mt-4 flex items-center group cursor-pointer {$settings.sidebarCollapsed ? 'justify-center' : 'px-8 justify-start gap-4'}"
    on:click={() => settings.update(s => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))}
    on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && settings.update(s => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))}
    role="button"
    tabindex="0"
    aria-label="Toggle Sidebar"
  >
    <div
      class="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center transition-transform duration-700 group-hover:rotate-[15deg] group-hover:scale-110 flex-shrink-0 relative"
    >
      <span
        class="text-3xl lg:text-4xl font-black text-white drop-shadow-[0_0_15px_var(--accent-glow)] pb-1"
        >日</span
      >
      <div
        class="absolute inset-0 bg-accent-primary/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"
      ></div>
    </div>
    {#if !$settings.sidebarCollapsed}
      <div class="flex items-center justify-between flex-1 min-w-0" transition:fade>
        <h1 class="text-3xl font-black tracking-tighter text-white drop-shadow-2xl truncate">
          Kyn
        </h1>
        <button 
          class="p-2 text-white/20 hover:text-accent-primary transition-colors opacity-0 group-hover:opacity-100"
          title={$t('collapse')}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <nav class="flex flex-col gap-3 px-3 lg:px-6 flex-1 min-h-0 overflow-y-auto mix-scrollbar">
    {#if !$settings.sidebarCollapsed}
      <div
        class="text-[10px] font-black text-accent-primary opacity-60 uppercase tracking-[0.4em] mb-4 mt-6 px-4 flex items-center gap-2"
        transition:slide
      >
        <div
          class="w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]"
        ></div>
        {$t('home')}
      </div>
    {/if}

    <button
      on:click={() => setTab('home')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'home' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('home')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
        /><path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        /></svg
      >
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('home')}</span>
      {/if}
    </button>

    <button
      on:click={() => setTab('library')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'library' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('library')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        /></svg
      >
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('library')}</span>
      {/if}
    </button>

    <button
      on:click={() => setTab('analysis')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'analysis' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('analysis')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        /></svg
      >
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('analysis')}</span>
      {/if}
    </button>

    {#if !$settings.sidebarCollapsed}
      <div class="flex items-center justify-between pr-4 mt-8 mb-4" transition:slide>
        <div
          class="flex items-center gap-2 text-[10px] font-black text-purple-400/60 uppercase tracking-[0.4em] px-4"
        >
          <div
            class="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(185,0,255,0.4)]"
          ></div>
          {$t('playlists')}
        </div>
        <button
          on:click|stopPropagation={() => libraryManager.createEmptyPlaylist($t('new_playlist'))}
          class="text-accent-primary hover:scale-125 transition-transform text-lg leading-none p-1"
          title={$t('new_playlist')}>+</button
        >
      </div>
    {/if}

    <button
      on:click={() => setTab('queue')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'queue' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('queue')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        ><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('queue')}</span>
      {/if}
    </button>

    <button
      on:click={() => setTab('playlists')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'playlists' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('playlists')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
        />
      </svg>
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('playlists')}</span>
      {/if}
    </button>

    {#if (activeTab === 'playlists' || activeTab === 'home') && !$settings.sidebarCollapsed}
      <div class="flex flex-col gap-1 px-4 mt-2" transition:slide>
        {#each playlists.slice(0, 10) as playlist (playlist.name)}
          <button
            on:click={() => dispatch('selectPlaylist', playlist)}
            class="group flex items-center gap-3 py-2 px-3 rounded-xl transition-all duration-300 {selectedPlaylist?.name ===
            playlist.name
              ? 'bg-accent-primary/10 text-accent-primary'
              : 'hover:bg-white/5 text-white/40 hover:text-white'}"
          >
            <div
              class="w-1.5 h-1.5 rounded-full {selectedPlaylist?.name === playlist.name
                ? 'bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]'
                : 'bg-white/10 group-hover:bg-white/30'} transition-all"
            ></div>
            <span class="text-[10px] font-black uppercase tracking-widest truncate"
              >{playlist.name}</span
            >
          </button>
        {/each}
      </div>
    {/if}

    <button
      on:click={() => setTab('addons')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'addons' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('addons')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
        />
      </svg>
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('addons')}</span>
      {/if}
    </button>

    <button
      on:click={() => setTab('downloads')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'downloads' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'} group/dl"
      aria-label={$t('downloads')}
    >
      <div class="btn-glow"></div>
      <div class="flex items-center gap-4 z-10">
        <svg
          class="w-5 h-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        {#if !$settings.sidebarCollapsed}
          <span transition:fade>{$t('downloads')}</span>
        {/if}
      </div>
      {#if activeDownloadCount > 0}
        <div
          class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-accent-primary text-black text-[10px] font-black rounded-full flex items-center justify-center shadow-[0_0_15px_var(--accent-glow)] z-20 transition-all group-hover/dl:scale-110"
        >
          {activeDownloadCount > 9 ? '9+' : activeDownloadCount}
        </div>
      {/if}
    </button>

    <div class="my-6 border-t border-white/5 mx-2 hidden lg:block"></div>

    <!-- 
    <button
      on:click={() => setTab('studio')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="studio-btn {activeTab === 'studio' ? 'active' : ''} justify-center lg:justify-between"
      aria-label={$t('studio')}
    >
      <div class="btn-glow"></div>
      <div class="flex items-center gap-4 z-10">
        <svg
          class="w-5 h-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2.5"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          /></svg
        >
        <span class="hidden lg:block">{$t('studio')}</span>
      </div>
    </button>
    -->
  </nav>

  {#if isScanning}
    <div class="px-3 lg:px-6 py-6 mb-24 transition-all duration-500">
      <div
        class="bg-white/5 border border-white/10 rounded-2xl lg:rounded-3xl p-3 lg:p-5 backdrop-blur-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 glass-noise overflow-hidden"
      >
        <div class="absolute inset-0 bg-gradient-to-r from-accent-primary/10 to-transparent"></div>
        <div
          class="flex items-center gap-3 mb-2 lg:mb-4 relative z-10 justify-center lg:justify-start"
        >
          <div
            class="w-2.5 h-2.5 bg-accent-primary rounded-full animate-pulse shadow-[0_0_15px_var(--accent-glow)] flex-shrink-0"
          ></div>
          <span
            class="hidden lg:block text-[10px] font-black uppercase tracking-[0.3em] text-white/80"
            >{$t('neural_engine')}</span
          >
        </div>

        <div
          class="w-full h-1.5 lg:h-2 bg-black/50 rounded-full overflow-hidden mb-2 lg:mb-3 relative z-10"
        >
          <div
            class="h-full bg-gradient-to-r from-accent-primary via-accent-primary to-accent-secondary transition-all duration-700 shadow-[0_0_20px_var(--accent-glow)]"
            style="width: {scanProgress * 100}%"
          ></div>
        </div>

        <div
          class="flex justify-between items-center text-[9px] lg:text-[10px] font-black text-white/40 uppercase tracking-[0.1em] relative z-10"
        >
          <span class="text-accent-primary">{Math.round(scanProgress * 100)}%</span>
          <span class="hidden lg:block animate-pulse tracking-[0.2em]">{$t('searching')}</span>
        </div>
      </div>
    </div>
  {/if}

  <div class="p-4 mt-auto border-t border-white/5 bg-transparent flex flex-col gap-2">
    <button
      on:click={() => setTab('settings')}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn {activeTab === 'settings' ? 'active' : ''} {$settings.sidebarCollapsed ? 'justify-center' : 'justify-start'}"
      aria-label={$t('settings')}
    >
      <div class="btn-glow"></div>
      <svg
        class="w-5 h-5 z-10 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      {#if !$settings.sidebarCollapsed}
        <span class="z-10" transition:fade>{$t('settings')}</span>
      {/if}
    </button>

    <button
      on:click={() => settings.update((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))}
      on:mousemove={handleMagneticMove}
      on:mouseleave={handleMagneticOut}
      class="nav-btn justify-center hover:bg-accent-primary/10 group/collapse !py-3 !mt-2 border-dashed border-white/5 hover:border-accent-primary/30"
      aria-label="Toggle Sidebar"
      title={$settings.sidebarCollapsed ? $t('expand') : $t('collapse')}
    >
      <div class="btn-glow"></div>
      <div class="flex items-center gap-4 z-10">
        <svg
          class="w-5 h-5 transition-transform duration-500 {$settings.sidebarCollapsed ? '' : 'rotate-180 text-accent-primary'}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
        {#if !$settings.sidebarCollapsed}
          <span class="z-10 text-[9px] opacity-40 group-hover/collapse:opacity-100 transition-opacity" transition:fade>{$t('minimize_sidebar')}</span>
        {/if}
      </div>
    </button>
  </div>
</aside>

<style>
  .mix-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .mix-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--accent-glow);
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 1.25rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 11px;
    transition: all 0.5s ease-in-out;
    position: relative;
    overflow: hidden;
    border: 1px solid transparent;
    color: #b8c5d6;
    will-change: transform;
  }

  .nav-btn:hover {
    color: white;
    background-color: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.05);
    transform: translateX(4px);
  }

  .nav-btn.active {
    background-color: rgba(255, 255, 255, 0.08);
    color: var(--accent-primary);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      inset 0 0 20px rgba(255, 255, 255, 0.02),
      0 10px 30px -10px rgba(0, 0, 0, 0.5);
    transform: translateX(6px) scale(1.02);
  }

  .btn-glow {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent-primary), transparent 90%),
      transparent
    );
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    pointer-events: none;
  }

  .nav-btn:hover .btn-glow {
    opacity: 1;
  }
</style>
