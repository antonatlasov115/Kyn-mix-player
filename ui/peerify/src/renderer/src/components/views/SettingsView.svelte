<script>
  import { onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'

  export let libraryFolders = []
  export let onAddFolder = () => {}
  export let onRemoveFolder = (path) => {}
  export let crossfadeSeconds = 4
  export let useDropAlignment = true
  export let autoCutSilence = true
  export let showMascotName = true
  export let showMascot = true
  export let mascotBlur = 1.0
  export let mascotAberration = 1.0
  export let mascotRipple = 1.0
  export let mascotGhosts = 0.5
  export let mascotSensitivity = 1.0
  export let mascotScale = 1.0
  export let mascotCustomSkin = {}
  export let mascotSkin = 'default'
  export let mascotProfaneMode = false
  export let mascotLyricsMode = false
  export let autoDownloadLyrics = false
  export let aiSearchEnabled = true
  export let uiScale = 1.0
  export let theme = 'default'
  export let youtubeCookiesBrowser = 'none'
  export let maxConcurrentDownloads = 3
  export let performanceProfile = 'epic'
  export let intelliGainEnabled = true
  export let vibrantBassEnabled = true
  export let spatialProfile = 'maikiwi'
  export let doubleDropMode
  export let autoDownloadCovers = false
  // Pro-Audio
  export let proBassCrossover = 0.75
  export let proMidCrossover = 0.95
  export let proHighEntryDelay = 0.45
  export let proCurveExpo = 3.5
  export let proIncomingSwell = 1.2
  export let onUpdateSettings = (patch) => {}

  const themes = [
    { id: 'default', color: '#00e5ff' },
    { id: 'purple', color: '#b900ff' },
    { id: 'gold', color: '#ffcc00' },
    { id: 'emerald', color: '#00ffaa' },
    { id: 'rose', color: '#ff0066' },
    { id: 'blue', color: '#0088ff' },
    { id: 'kyinda', color: '#e0f7fa' },
    { id: 'kytalyk', color: '#f8bbd0' },
    { id: 'olonkho', color: '#ff6f00' },
    { id: 'tuymaada', color: '#81c784' },
    { id: 'sardaana', color: '#ff1744' },
    { id: 'chyskhaan', color: '#1a237e' },
    { id: 'kyinda_kharama', color: '#000000' },
    { id: 'grey', color: '#cccccc' }
  ]
  export let onUpdateCustomSkin = (skin) => {}
  export let onUpdateSensitivity = (val) => {}
  export let onScan = (options) => {}

  import { locale, t } from '../../lib/i18n'
  import { playback } from '../../lib/stores/playback'

  let engineStats = null
  let actualLatencyMs = 0
  export let latencyMs = 50
  let isExclusiveMode = false
  let isStatsLoading = true
  let saveMessage = ''
  let isContextMenuEnabled = false

  let audioDevices = []
  let selectedDeviceIndex = -1
  export let onApplyAudioConfig = () => {}

  let isProEngine = true
  let currentVstName = ''

  let activeCategory = 'engine'

  const categories = [
    { id: 'engine', label: 'engine', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'automix', label: 'automix', icon: 'M9 19V6l12 7-12 6z' },
    {
      id: 'mascot',
      label: 'mascot',
      icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    {
      id: 'appearance',
      label: 'appearance',
      icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01'
    },
    {
      id: 'library',
      label: 'library',
      icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'
    }
  ]

  onMount(async () => {
    if (window.peerifyAPI && window.peerifyAPI.getEngine) {
      isProEngine = await window.peerifyAPI.getEngine()
    }

    if (window.peerifyAPI && window.peerifyAPI.getAudioDevices) {
      audioDevices = await window.peerifyAPI.getAudioDevices()
      const defaultDev = audioDevices.find((d) => d.isDefault)
      if (defaultDev && selectedDeviceIndex === -1) {
        selectedDeviceIndex = defaultDev.index
      }
    }

    await fetchStats()

    if (typeof localStorage !== 'undefined') {
      const savedCtx = localStorage.getItem('peerify_context_menu')
      if (savedCtx) isContextMenuEnabled = savedCtx === 'true'
    }
  })

  async function fetchStats() {
    isStatsLoading = true
    if (window.peerifyAPI && window.peerifyAPI.getStats) {
      try {
        engineStats = await window.peerifyAPI.getStats()
        if (engineStats) {
          if (engineStats.latencyMs) actualLatencyMs = engineStats.latencyMs
          if (engineStats.exclusive)
            isExclusiveMode = engineStats.exclusive === 'true' || engineStats.exclusive === true
        }
      } catch (err) {
        console.error('Не удалось получить статистику движка', err)
      }
    }
    isStatsLoading = false
  }

  async function toggleEngine() {
    isProEngine = !isProEngine
    if (window.peerifyAPI && window.peerifyAPI.setEngine) {
      saveMessage = $t('engine_switching')
      await window.peerifyAPI.setEngine(isProEngine)
      setTimeout(() => (saveMessage = ''), 2000)
      await fetchStats()
    }
  }

  async function loadVstPlugin() {
    if (window.peerifyAPI && window.peerifyAPI.selectVstPlugin) {
      const dllPath = await window.peerifyAPI.selectVstPlugin()
      if (dllPath) {
        saveMessage = $t('vst_loading')
        const success = await window.peerifyAPI.loadVst(dllPath)
        if (success) {
          currentVstName = dllPath.split('\\').pop()
          saveMessage = $t('vst_active_msg')
        } else {
          saveMessage = $t('vst_error')
        }
        setTimeout(() => (saveMessage = ''), 3000)
      }
    }
  }

  async function removeVstPlugin() {
    if (window.peerifyAPI && window.peerifyAPI.removeVst) {
      await window.peerifyAPI.removeVst()
      currentVstName = ''
      saveMessage = $t('vst_disabled')
      setTimeout(() => (saveMessage = ''), 3000)
    }
  }

  async function openVstUI() {
    if (window.peerifyAPI && window.peerifyAPI.openVstEditor) {
      await window.peerifyAPI.openVstEditor()
    }
  }

  async function toggleContextMenu() {
    const newState = !isContextMenuEnabled
    if (window.peerifyAPI && window.peerifyAPI.setContextMenu) {
      const success = await window.peerifyAPI.setContextMenu(newState)
      if (success) {
        isContextMenuEnabled = newState
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('peerify_context_menu', isContextMenuEnabled.toString())
        }
        saveMessage = isContextMenuEnabled ? $t('ctx_active') : $t('ctx_removed')
        setTimeout(() => (saveMessage = ''), 3000)
      } else {
        saveMessage = $t('ctx_error')
        setTimeout(() => (saveMessage = ''), 3000)
      }
    }
  }

  async function applyAudioConfig() {
    if (window.peerifyAPI && window.peerifyAPI.setAudioConfig) {
      saveMessage = $t('dsp_restarting')
      const success = await window.peerifyAPI.setAudioConfig(
        isExclusiveMode,
        latencyMs,
        selectedDeviceIndex
      )
      if (success) {
        saveMessage = $t('engine_rebuild')
        onApplyAudioConfig()
      } else {
        saveMessage = $t('reset_error')
        isExclusiveMode = false
      }
      setTimeout(() => (saveMessage = ''), 3000)
      await fetchStats()
    }
  }

  $: {
    if (mascotLyricsMode || aiSearchEnabled) {
      // Just to satisfy the lint about unused exports if they aren't used elsewhere yet
    }
  }

  function handleAddFolder() {
    locale.set(e.target.value)
  }

  async function selectSkinImage(slot) {
    if (window.peerifyAPI && window.peerifyAPI.selectImageFile) {
      const path = await window.peerifyAPI.selectImageFile()
      if (path) {
        mascotCustomSkin[slot] = path
        mascotCustomSkin = { ...mascotCustomSkin }
        onUpdateCustomSkin(mascotCustomSkin)
      }
    }
  }

  function resetSkin() {
    mascotCustomSkin = {}
    onUpdateCustomSkin(mascotCustomSkin)
  }

  let isRefining = false
  async function handleRefineOnline() {
    if (isRefining) return
    isRefining = true
    saveMessage = $t('refining_genres')
    try {
      const refined = await window.peerifyAPI.refineOnline()
      saveMessage = refined > 0 ? `${$t('refined_count')}: ${refined}` : $t('nothing_to_refine')
    } catch (e) {
      console.error(e)
      saveMessage = $t('refine_error')
    } finally {
      isRefining = false
      setTimeout(() => (saveMessage = ''), 5000)
    }
  }
</script>

<div class="flex h-full bg-transparent text-white font-sans overflow-hidden animate-premium-in">
  <!-- SIDEBAR NAVIGATION -->
  <aside
    class="w-72 bg-black/20 backdrop-blur-3xl border-r border-white/5 flex flex-col p-8 pt-12 relative z-10 shrink-0"
  >
    <div class="mb-12">
      <h1 class="text-4xl font-black tracking-tighter mb-1 text-white drop-shadow-2xl">
        {$t('settings')}
      </h1>
      <div class="h-1 w-12 bg-[var(--accent-primary)] rounded-full"></div>
    </div>

    <nav class="space-y-2 flex-1">
      {#each categories as cat}
        <button
          on:click={() => (activeCategory = cat.id)}
          class="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group
          {activeCategory === cat.id
            ? 'bg-white/10 text-[var(--accent-primary)] shadow-lg'
            : 'text-white/40 hover:bg-white/5 hover:text-white'}"
        >
          <svg
            class="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={cat.icon} />
          </svg>
          <span class="text-sm font-black uppercase tracking-widest text-left">{$t(cat.label)}</span
          >
          {#if activeCategory === cat.id}
            <div
              class="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-glow)]"
              in:fade
            ></div>
          {/if}
        </button>
      {/each}
    </nav>

    {#if saveMessage}
      <div
        class="mt-auto bg-accent-primary/10 border border-accent-primary/20 p-4 rounded-2xl animate-pulse"
      >
        <p class="text-[10px] font-black text-accent-primary uppercase tracking-widest text-center">
          {saveMessage}
        </p>
      </div>
    {/if}
  </aside>

  <!-- CONTENT AREA -->
  <main class="flex-1 overflow-y-auto custom-scrollbar p-12 relative">
    {#key activeCategory}
      <div
        in:fly={{ y: 20, duration: 400 }}
        out:fade={{ duration: 200 }}
        class="max-w-4xl space-y-10 pb-20"
      >
        {#if activeCategory === 'engine'}
          <section class="glass-panel p-8 rounded-[2.5rem] glow-accent">
            <h2
              class="text-xs font-black text-accent-primary uppercase tracking-[0.4em] flex items-center gap-3 mb-8"
            >
              <span class="w-8 h-[1px] bg-accent-primary/30"></span>
              {$t('engine_stats_label')}
            </h2>

            {#if isStatsLoading}
              <div
                class="text-accent-primary text-sm animate-pulse font-bold tracking-widest uppercase"
              >
                {$t('stats_loading')}
              </div>
            {:else if !engineStats || engineStats.status === 'error'}
              <div class="text-red-400 text-sm font-bold tracking-widest uppercase">
                {$t('engine_error')}
              </div>
            {:else}
              <div class="grid grid-cols-3 gap-6 mb-10">
                <div
                  class="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col items-center"
                >
                  <span class="text-[10px] uppercase font-black text-white/40 tracking-widest mb-3"
                    >{$t('backend_api')}</span
                  >
                  <span class="text-2xl font-black text-white"
                    >{engineStats.backend || $t('vst_not_loaded')}</span
                  >
                </div>
                <div
                  class="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col items-center"
                >
                  <span class="text-[10px] uppercase font-black text-white/40 tracking-widest mb-3"
                    >{$t('sample_rate')}</span
                  >
                  <span class="text-2xl font-black text-white"
                    >{(engineStats.sampleRate / 1000).toFixed(1)} kHz</span
                  >
                </div>
                <div
                  class="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col items-center"
                >
                  <span class="text-[10px] uppercase font-black text-white/40 tracking-widest mb-3"
                    >{$t('mode_label')}</span
                  >
                  <span
                    class="text-2xl font-black {isExclusiveMode ? 'text-purple-400' : 'text-white'}"
                    >{isExclusiveMode ? $t('exclusive_mode_label') : $t('shared_mode_label')}</span
                  >
                </div>
              </div>
            {/if}

            <div class="space-y-6">
              <div
                class="flex items-center justify-between bg-black/30 p-5 rounded-2xl border border-white/5"
              >
                <div>
                  <h3 class="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    {$t('engine')}
                    <span
                      class="px-2 py-0.5 text-[9px] uppercase tracking-widest rounded-md font-black {isProEngine
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'}"
                    >
                      {isProEngine ? 'BASS PRO' : 'MINIAUDIO'}
                    </span>
                  </h3>
                  <p class="text-xs text-white/50">{$t('engine_desc')}</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={isProEngine}
                    on:change={toggleEngine}
                  />
                  <div
                    class="w-14 h-7 bg-white/10 rounded-full peer peer-checked:bg-purple-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-full"
                  ></div>
                </label>
              </div>

              {#if isProEngine}
                <div
                  class="flex items-center justify-between bg-purple-900/10 p-5 rounded-2xl border border-purple-500/20"
                >
                  <div>
                    <h3 class="text-lg font-bold text-white mb-1">{$t('vst_plugins')}</h3>
                    <p class="text-xs text-white/50">
                      {currentVstName ? currentVstName : $t('vst_desc')}
                    </p>
                  </div>
                  <div class="flex gap-3">
                    {#if currentVstName}
                      <button
                        on:click={openVstUI}
                        class="px-4 py-2 bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        >{$t('vst_editor_btn')}</button
                      >
                      <button
                        on:click={removeVstPlugin}
                        class="px-4 py-2 bg-red-400/20 text-red-300 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        >{$t('off_label')}</button
                      >
                    {/if}
                    <button
                      on:click={loadVstPlugin}
                      class="px-4 py-2 bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                      >{currentVstName ? $t('vst_change_btn') : $t('vst_load_btn')}</button
                    >
                  </div>
                </div>
              {/if}

              <div
                class="flex items-center justify-between bg-black/30 p-5 rounded-2xl border border-white/5"
              >
                <div>
                  <h3 class="text-lg font-bold text-white mb-1">{$t('output_device')}</h3>
                  <p class="text-xs text-white/50">{$t('output_desc')}</p>
                </div>
                <select
                  value={selectedDeviceIndex}
                  on:change={(e) => {
                    selectedDeviceIndex = parseInt(e.target.value)
                    applyAudioConfig()
                  }}
                  class="bg-black/40 border border-accent-primary/30 text-white text-xs font-bold rounded-xl px-4 py-2.5 outline-none appearance-none cursor-pointer w-[250px] truncate"
                >
                  <option value={-1}>{$t('system_output')}</option>
                  {#each audioDevices as device}
                    <option value={device.index}>{device.name}</option>
                  {/each}
                </select>
              </div>

              <div class="bg-black/30 p-6 rounded-2xl border border-white/5">
                <div class="flex justify-between items-center mb-6">
                  <h3 class="text-lg font-bold text-white">
                    {$t('latency_label')} / {$t('buffer_size')}
                  </h3>
                  <span class="text-3xl font-black text-accent-primary">{latencyMs}ms</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="500"
                  step="10"
                  value={latencyMs}
                  on:input={(e) => onUpdateSettings({ latencyMs: parseInt(e.target.value) })}
                  on:change={applyAudioConfig}
                  class="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-primary shadow-[0_0_10px_var(--accent-glow)]"
                />
              </div>

              <!-- PREMIUN AUDIO ENHANCEMENTS -->
              <div class="glass-panel p-6 rounded-3xl border border-white/5 space-y-6">
                <h3
                  class="text-xs font-black text-accent-primary uppercase tracking-[0.3em] flex items-center gap-3 mb-2"
                >
                  <span class="w-4 h-[1px] bg-accent-primary/30"></span>
                  {$t('audio_enhancements')}
                </h3>

                <!-- IntelliGain -->
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-bold text-white mb-1">{$t('intelli_gain')}</h4>
                    <p class="text-[10px] text-white/50 max-w-sm">{$t('intelli_gain_desc')}</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      checked={intelliGainEnabled}
                      on:change={(e) => onUpdateSettings({ intelliGainEnabled: e.target.checked })}
                    />
                    <div
                      class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-accent-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                    ></div>
                  </label>
                </div>

                <!-- Vibrant Bass -->
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-bold text-white mb-1">{$t('vibrant_bass')}</h4>
                    <p class="text-[10px] text-white/50 max-w-sm">{$t('vibrant_bass_desc')}</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      checked={vibrantBassEnabled}
                      on:change={(e) => onUpdateSettings({ vibrantBassEnabled: e.target.checked })}
                    />
                    <div
                      class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-accent-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                    ></div>
                  </label>
                </div>

                <!-- Spatial Profile -->
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-bold text-white mb-1">{$t('spatial_profile')}</h4>
                  </div>
                  <div class="flex gap-2">
                    {#each ['none', 'maikiwi', 'minimal', 'live'] as profile}
                      <button
                        on:click={() => onUpdateSettings({ spatialProfile: profile })}
                        class="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                                {spatialProfile === profile
                          ? 'bg-accent-primary text-black shadow-[0_0_10px_var(--accent-glow)]'
                          : 'bg-white/5 text-white/40 hover:bg-white/10'}"
                      >
                        {$t('spatial_' + profile)}
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- PRO AUDIO TUNING -->
                <div class="pt-8 border-t border-white/5 space-y-6">
                  <h3 class="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span class="w-4 h-[1px] bg-purple-400/30"></span>
                    PRO AUDIO ENGINE TUNING
                  </h3>
                  
                  <div class="grid grid-cols-2 gap-8">
                    <!-- Bass Crossover -->
                    <div class="space-y-2">
                      <div class="flex justify-between text-[9px] font-black uppercase text-white/40">
                        <span>Bass Crossover Width</span>
                        <span class="text-white">{Math.round(proBassCrossover * 100)}%</span>
                      </div>
                      <input type="range" min="0.1" max="1.0" step="0.05" value={proBassCrossover} 
                             on:input={(e) => onUpdateSettings({ proBassCrossover: parseFloat(e.target.value) })}
                             class="h-1 w-full bg-white/10 rounded-full appearance-none accent-purple-500" />
                    </div>

                    <!-- Mid Crossover -->
                    <div class="space-y-2">
                      <div class="flex justify-between text-[9px] font-black uppercase text-white/40">
                        <span>Mid Crossover Width</span>
                        <span class="text-white">{Math.round(proMidCrossover * 100)}%</span>
                      </div>
                      <input type="range" min="0.1" max="1.0" step="0.05" value={proMidCrossover} 
                             on:input={(e) => onUpdateSettings({ proMidCrossover: parseFloat(e.target.value) })}
                             class="h-1 w-full bg-white/10 rounded-full appearance-none accent-purple-500" />
                    </div>

                    <!-- High Delay -->
                    <div class="space-y-2">
                      <div class="flex justify-between text-[9px] font-black uppercase text-white/40">
                        <span>High Entry Delay</span>
                        <span class="text-white">{Math.round(proHighEntryDelay * 100)}%</span>
                      </div>
                      <input type="range" min="0.0" max="0.9" step="0.05" value={proHighEntryDelay} 
                             on:input={(e) => onUpdateSettings({ proHighEntryDelay: parseFloat(e.target.value) })}
                             class="h-1 w-full bg-white/10 rounded-full appearance-none accent-purple-500" />
                    </div>

                    <!-- Curve Expo -->
                    <div class="space-y-2">
                      <div class="flex justify-between text-[9px] font-black uppercase text-white/40">
                        <span>EQ Curve Exponential</span>
                        <span class="text-white">{proCurveExpo.toFixed(1)}</span>
                      </div>
                      <input type="range" min="1.0" max="6.0" step="0.1" value={proCurveExpo} 
                             on:input={(e) => onUpdateSettings({ proCurveExpo: parseFloat(e.target.value) })}
                             class="h-1 w-full bg-white/10 rounded-full appearance-none accent-purple-400" />
                    </div>

                    <!-- Incoming Swell -->
                    <div class="space-y-2">
                      <div class="flex justify-between text-[9px] font-black uppercase text-white/40">
                        <span>Incoming Track Swell</span>
                        <span class="text-white">{Math.round(proIncomingSwell * 100)}%</span>
                      </div>
                      <input type="range" min="0.5" max="2.0" step="0.05" value={proIncomingSwell} 
                             on:input={(e) => onUpdateSettings({ proIncomingSwell: parseFloat(e.target.value) })}
                             class="h-1 w-full bg-white/10 rounded-full appearance-none accent-purple-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        {/if}

        {#if activeCategory === 'automix'}
          <section class="glass-panel p-8 rounded-[2.5rem] glow-cyan">
            <h2
              class="text-xs font-black text-cyan-400 uppercase tracking-[0.4em] flex items-center gap-3 mb-8"
            >
              <span class="w-8 h-[1px] bg-cyan-400/30"></span>
              {$t('automix')}
            </h2>

            <div class="space-y-6">
              <div class="bg-black/30 p-6 rounded-2xl border border-white/5">
                <div class="flex justify-between items-center mb-6">
                  <div>
                    <h3 class="text-lg font-bold text-white">{$t('crossfade')}</h3>
                    <p class="text-xs text-white/50">{$t('crossfade_desc')}</p>
                  </div>
                  <span class="text-3xl font-black text-accent-primary">{crossfadeSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={crossfadeSeconds}
                  on:input={(e) => onUpdateSettings({ crossfadeSeconds: parseInt(e.target.value) })}
                  class="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-primary"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div
                  class="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-40"
                >
                  <div>
                    <h3 class="text-sm font-black text-white uppercase tracking-widest mb-1">
                      {$t('beat_alignment_label')}
                    </h3>
                    <p class="text-[10px] text-white/40">{$t('drop_align_desc')}</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      checked={useDropAlignment}
                      on:change={(e) => onUpdateSettings({ useDropAlignment: e.target.checked })}
                    />
                    <div
                      class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-accent-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                    ></div>
                  </label>
                </div>

                <div
                  class="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-40"
                >
                  <div>
                    <h3 class="text-sm font-black text-white uppercase tracking-widest mb-1">
                      {$t('silence_cut_label')}
                    </h3>
                    <p class="text-[10px] text-white/40">{$t('silence_cut_desc')}</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      checked={autoCutSilence}
                      on:change={(e) => onUpdateSettings({ autoCutSilence: e.target.checked })}
                    />
                    <div
                      class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-accent-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                    ></div>
                  </label>
                </div>

                <div
                  class="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-40"
                >
                  <div>
                    <h3 class="text-sm font-black text-white uppercase tracking-widest mb-1">
                      Double Drop Mode
                    </h3>
                    <p class="text-[10px] text-white/40">
                      Sync drops of both tracks for high-energy genres.
                    </p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      checked={doubleDropMode}
                      on:change={(e) => onUpdateSettings({ doubleDropMode: e.target.checked })}
                    />
                    <div
                      class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-accent-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                    ></div>
                  </label>
                </div>
              </div>
            </div>
          </section>
        {/if}

        {#if activeCategory === 'mascot'}
          <section class="glass-panel p-8 rounded-[2.5rem] glow-purple">
            <h2
              class="text-xs font-black text-purple-400 uppercase tracking-[0.4em] flex items-center gap-3 mb-8"
            >
              <span class="w-8 h-[1px] bg-purple-400/30"></span>
              {$t('mascot')}
            </h2>

            <!-- Basic Controls -->
            <div class="grid grid-cols-2 gap-4 mb-8">
              <div
                class="bg-black/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <span class="text-xs font-bold font-mono uppercase tracking-widest"
                  >{$t('show_mascot')}</span
                >
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={showMascot}
                    on:change={(e) => onUpdateSettings({ showMascot: e.target.checked })}
                  />
                  <div
                    class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-purple-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                  ></div>
                </label>
              </div>
              <div
                class="bg-black/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <span class="text-xs font-bold font-mono uppercase tracking-widest"
                  >{$t('mascot_name')}</span
                >
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={showMascotName}
                    on:change={(e) => onUpdateSettings({ showMascotName: e.target.checked })}
                  />
                  <div
                    class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-purple-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                  ></div>
                </label>
              </div>

              <!-- Profane Mode Toggle -->
              <div
                class="bg-black/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div class="flex flex-col">
                  <span class="text-xs font-bold font-mono uppercase tracking-widest text-white"
                    >{$t('mascot_profane_mode')}</span
                  >
                  <span class="text-[8px] text-white/40 uppercase tracking-tighter">{$t('mascot_profane_mode_desc')}</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={mascotProfaneMode}
                    on:change={(e) => onUpdateSettings({ mascotProfaneMode: e.target.checked })}
                  />
                  <div
                    class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-red-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                  ></div>
                </label>
              </div>

              <!-- Lyrics Mode Toggle -->
              <div
                class="bg-black/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div class="flex flex-col">
                  <span class="text-xs font-bold font-mono uppercase tracking-widest text-white"
                    >{$t('mascot_lyrics_mode')}</span
                  >
                  <span class="text-[8px] text-white/40 uppercase tracking-tighter">{$t('mascot_lyrics_mode_desc')}</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={mascotLyricsMode}
                    on:change={(e) => onUpdateSettings({ mascotLyricsMode: e.target.checked })}
                  />
                  <div
                    class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-purple-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                  ></div>
                </label>
              </div>

              <!-- Auto-download Lyrics Toggle -->
              <div
                class="bg-black/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between"
              >
                <div class="flex flex-col">
                  <span class="text-xs font-bold font-mono uppercase tracking-widest text-white"
                    >{$t('auto_download_lyrics')}</span
                  >
                  <span class="text-[8px] text-white/40 uppercase tracking-tighter">{$t('auto_download_lyrics_desc')}</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={autoDownloadLyrics}
                    on:change={(e) => onUpdateSettings({ autoDownloadLyrics: e.target.checked })}
                  />
                  <div
                    class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                  ></div>
                </label>
              </div>
            </div>

            <!-- Skin Selection -->
            <div
              class="bg-black/30 p-5 rounded-2xl border border-white/5 mb-8 flex items-center justify-between"
            >
              <div>
                <h3 class="text-xs font-black text-white uppercase tracking-widest mb-1">
                  {$t('mascot_skin')}
                </h3>
                <p class="text-[10px] text-white/40">{$t('show_mascot_desc')}</p>
              </div>
              <div class="flex gap-2">
                {#each ['default', 'gubby'] as s}
                  <button
                    on:click={() => onUpdateSettings({ mascotSkin: s })}
                    class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                            {mascotSkin === s
                      ? 'bg-purple-500 text-white shadow-[0_0_15px_purple]'
                      : 'bg-white/5 text-white/40 hover:bg-white/10'}"
                  >
                    {$t('skin_' + s)}
                  </button>
                {/each}
              </div>
            </div>

            <!-- FX Intensity -->
            <div class="bg-purple-900/10 p-6 rounded-3xl border border-purple-500/20 mb-8">
              <h3 class="text-xs font-black text-purple-300 uppercase tracking-widest mb-6 px-1">
                {$t('mascot_fx')}
              </h3>
              <div class="grid grid-cols-2 gap-x-12 gap-y-6">
                {#each [{ id: 'mascotBlur', label: 'blur', val: mascotBlur, max: 2.5, color: 'accent-primary' }, { id: 'mascotAberration', label: 'aberration', val: mascotAberration, max: 3, color: 'purple' }, { id: 'mascotRipple', label: 'ripple', val: mascotRipple, max: 2.5, color: 'white' }, { id: 'mascotGhosts', label: 'ghosts', val: mascotGhosts, max: 1, color: 'purple' }, { id: 'mascotSensitivity', label: 'mascot_movement_strength', val: mascotSensitivity, max: 2.5, min: 0.2, color: 'accent-primary' }, { id: 'mascotScale', label: 'mascot_size', val: mascotScale, max: 2.0, min: 0.4, color: 'purple' }] as fx}
                  <div class="flex flex-col gap-2">
                    <div
                      class="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40"
                    >
                      <span>{$t(fx.label)}</span>
                      <span class="text-white">{(fx.val * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={fx.min || 0}
                      max={fx.max}
                      step="0.05"
                      value={fx.val}
                      on:input={(e) =>
                        fx.id === 'mascotSensitivity'
                          ? onUpdateSensitivity(parseFloat(e.target.value))
                          : onUpdateSettings({ [fx.id]: parseFloat(e.target.value) })}
                      class="h-1 bg-white/10 rounded-full appearance-none accent-{fx.color.replace(
                        'accent-',
                        ''
                      )}"
                    />
                  </div>
                {/each}
              </div>
            </div>

            <!-- Skin Creator -->
            <div class="bg-black/30 p-6 rounded-3xl border border-white/5">
              <div class="flex justify-between items-center mb-6">
                <h3 class="text-xs font-black text-white uppercase tracking-[0.3em]">
                  {$t('skin_creator')}
                </h3>
                <button
                  on:click={resetSkin}
                  class="text-[9px] font-black text-purple-400 uppercase tracking-widest"
                  >{$t('reset_btn')}</button
                >
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <p
                    class="text-[9px] font-black text-white/20 uppercase tracking-widest mb-2 px-1"
                  >
                    {$t('active_slots')}
                  </p>
                  {#each ['chill', 'ready', 'drum', 'autodj'] as s}
                    <button
                      on:click={() => selectSkinImage(s)}
                      class="w-full bg-white/5 border border-white/5 p-3 rounded-xl flex items-center justify-between group hover:bg-purple-500/10 transition-all"
                    >
                      <span class="text-[10px] font-bold text-white/60">{$t('skin_' + s) || s}</span
                      >
                      <div
                        class="w-2 h-2 rounded-full {mascotCustomSkin[s]
                          ? 'bg-purple-500 shadow-[0_0_8px_purple]'
                          : 'bg-white/10'}"
                      ></div>
                    </button>
                  {/each}
                </div>
                <div class="space-y-2">
                  <p
                    class="text-[9px] font-black text-white/20 uppercase tracking-widest mb-2 px-1"
                  >
                    {$t('slowed_slots')}
                  </p>
                  {#each ['slowedIdle', 'slowedMixing', 'slowedDance1', 'slowedDance2'] as s}
                    <button
                      on:click={() => selectSkinImage(s)}
                      class="w-full bg-white/5 border border-white/5 p-3 rounded-xl flex items-center justify-between group hover:bg-purple-500/10 transition-all"
                    >
                      <span class="text-[10px] font-bold text-white/60">{s}</span>
                      <div
                        class="w-2 h-2 rounded-full {mascotCustomSkin[s]
                          ? 'bg-purple-500 shadow-[0_0_8px_purple]'
                          : 'bg-white/10'}"
                      ></div>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </section>
        {/if}

        {#if activeCategory === 'appearance'}
          <section class="glass-panel p-8 rounded-[2.5rem] glow-accent">
            <h2
              class="text-xs font-black text-accent-primary uppercase tracking-[0.4em] flex items-center gap-3 mb-8"
            >
              <span class="w-8 h-[1px] bg-accent-primary/30"></span>
              {$t('appearance')}
            </h2>

            <div class="grid grid-cols-3 gap-6 mb-10">
              {#each themes as themeItem}
                <button
                  on:click={() => onUpdateSettings({ theme: themeItem.id })}
                  class="group flex flex-col items-center gap-3 p-4 rounded-[2rem] transition-all duration-300 {theme ===
                  themeItem.id
                    ? 'bg-white/10 ring-1 ring-accent-primary'
                    : 'hover:bg-white/5'}"
                >
                  <div
                    class="w-16 h-16 rounded-[1.5rem] shadow-lg border-2 {theme === themeItem.id
                      ? 'border-white scale-110'
                      : 'border-transparent opacity-50'} transition-all"
                    style="background: {themeItem.color}; box-shadow: 0 0 20px {themeItem.color}33;"
                  ></div>
                  <span
                    class="text-[10px] font-black uppercase tracking-widest {theme === themeItem.id
                      ? 'text-white'
                      : 'text-white/30'}">{$t('theme_' + themeItem.id)}</span
                  >
                </button>
              {/each}
            </div>

            <div class="space-y-8">
              <div class="bg-black/30 p-6 rounded-2xl border border-white/5">
                <div class="flex justify-between items-center mb-6">
                  <div>
                    <h3 class="text-lg font-bold text-white">{$t('ui_scale')}</h3>
                    <p class="text-xs text-white/50">{$t('ui_scale_desc')}</p>
                  </div>
                  <div class="flex items-center gap-4">
                    <span class="text-3xl font-black text-white">{(uiScale * 100).toFixed(0)}%</span
                    >
                  </div>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={uiScale}
                  on:input={(e) => onUpdateSettings({ uiScale: parseFloat(e.target.value) })}
                  class="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-primary"
                />
              </div>

              <div class="bg-black/30 p-6 rounded-2xl border border-white/5">
                <div class="flex justify-between items-center mb-4">
                  <div>
                    <h3 class="text-lg font-bold text-white">{$t('perf_profile')}</h3>
                    <p class="text-xs text-white/50">{$t('perf_desc')}</p>
                  </div>
                  <div class="flex gap-2">
                    {#each ['epic', 'low', 'potato'] as p}
                      <button
                        on:click={() => onUpdateSettings({ performanceProfile: p })}
                        class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                {performanceProfile === p
                          ? 'bg-accent-primary text-black shadow-[0_0_15px_var(--accent-glow)]'
                          : 'bg-white/5 text-white/40 hover:bg-white/10'}"
                      >
                        {$t('perf_' + p)}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <div
                class="flex items-center justify-between bg-black/30 p-5 rounded-2xl border border-white/5"
              >
                <div>
                  <h3 class="text-lg font-bold text-white">{$t('lang_select')}</h3>
                  <p class="text-xs text-white/50">{$t('lang_desc')}</p>
                </div>
                <select
                  value={$locale}
                  on:change={handleLangChange}
                  class="bg-black/40 border border-accent-primary/30 text-white text-xs font-bold rounded-xl px-4 py-3 outline-none appearance-none cursor-pointer w-[200px]"
                >
                  <option value="ru">Русский (RU)</option>
                  <option value="en">English (EN)</option>
                  <option value="ja">日本語 (JA)</option>
                  <option value="zh">中文 (ZH)</option>
                  <option value="sah">Саха тыла (SAH)</option>
                </select>
              </div>
            </div>
          </section>
        {/if}

        {#if activeCategory === 'library'}
          <section class="glass-panel p-8 rounded-[2.5rem] glow-accent">
            <h2
              class="text-xs font-black text-accent-primary uppercase tracking-[0.4em] flex items-center gap-3 mb-8"
            >
              <span class="w-8 h-[1px] bg-accent-primary/30"></span>
              {$t('library')}
            </h2>

            <!-- Folders -->
            <div class="space-y-3 mb-10">
              <p class="text-xs font-black text-white/20 uppercase tracking-widest px-2 mb-4">
                {$t('storage_folders_label')}
              </p>
              {#each libraryFolders as folder}
                <div
                  class="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5 group transition-all"
                >
                  <div class="flex items-center gap-4 overflow-hidden">
                    <svg
                      class="w-5 h-5 text-accent-primary shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      /></svg
                    >
                    <span class="text-xs font-bold text-white/70 truncate">{folder}</span>
                  </div>
                  <button
                    on:click={() => onRemoveFolder(folder)}
                    aria-label={$t('delete_folder')}
                    class="p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                    ><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      /></svg
                    ></button
                  >
                </div>
              {:else}
                <div
                  class="text-center py-10 bg-white/5 rounded-3xl border border-dashed border-white/10"
                >
                  <p class="text-sm text-white/20 font-bold uppercase tracking-widest">
                    {$t('no_folders')}
                  </p>
                </div>
              {/each}
              <div class="grid grid-cols-2 gap-4 mt-4">
                <button
                  on:click={onAddFolder}
                  class="py-4 bg-accent-primary text-black rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-[0_0_15px_var(--accent-glow)]"
                  >{$t('add_folder')}</button
                >
                <button
                  on:click={onScan}
                  class="py-4 bg-white/5 border border-white/5 text-white/60 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                  >{$t('scan_btn')}</button
                >
              </div>
            </div>

            <!-- YouTube -->
            <div class="bg-black/30 p-6 rounded-3xl border border-white/5 mb-8">
              <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest mb-6">
                Downloader Config
              </h3>
              <div class="space-y-6">
                <div class="flex items-center justify-between px-1">
                  <span class="text-sm font-bold text-white/80">Browser Auth</span>
                  <select
                    value={youtubeCookiesBrowser}
                    on:change={(e) => onUpdateSettings({ youtubeCookiesBrowser: e.target.value })}
                    class="bg-black/40 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-3 outline-none"
                  >
                    <option value="none">None</option>
                    <option value="chrome">Chrome</option>
                    <option value="edge">Edge</option>
                    <option value="firefox">Firefox</option>
                  </select>
                </div>
                <div class="flex items-center justify-between px-1">
                  <span class="text-sm font-bold text-white/80">Max Concurrent</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxConcurrentDownloads}
                    on:change={(e) =>
                      onUpdateSettings({ maxConcurrentDownloads: parseInt(e.target.value) })}
                    class="bg-black/40 border border-white/10 text-white text-xs font-bold rounded-xl px-4 py-2 w-20 text-center"
                  />
                </div>
              </div>
            </div>

            <!-- Cover Art Enrichment -->
            <div class="bg-black/30 p-8 rounded-3xl border border-white/5 mb-8">
              <h3 class="text-xs font-black text-white/40 uppercase tracking-widest mb-6 px-1">
                Cover Art Enrichment
              </h3>
              
              <div class="flex items-center justify-between mb-8 p-4 bg-white/5 rounded-2xl border border-white/5 group">
                <div class="flex flex-col gap-1">
                  <span class="text-sm font-bold text-white group-hover:text-accent-primary transition-colors">{$t('auto_download_covers')}</span>
                  <span class="text-[10px] font-medium text-white/40 uppercase tracking-widest leading-relaxed">
                    {$t('auto_download_covers_desc')}
                  </span>
                </div>
                <button
                  on:click={() => onUpdateSettings({ autoDownloadCovers: !autoDownloadCovers })}
                  class="w-12 h-6 rounded-full p-1 transition-all duration-300 {autoDownloadCovers ? 'bg-accent-primary' : 'bg-white/10'}"
                  aria-label="Toggle auto-download covers"
                >
                  <div class="w-4 h-4 rounded-full bg-white transition-all duration-300 {autoDownloadCovers ? 'translate-x-6' : 'translate-x-0'}"></div>
                </button>
              </div>

              <div
                class="flex items-center justify-between gap-8 bg-white/5 p-6 rounded-2xl border border-white/5 transition-all hover:bg-white/10"
              >
                <div class="flex-1">
                  <h4 class="text-base font-bold text-white mb-2">
                    {$t('refine_covers_btn')}
                  </h4>
                  <p class="text-xs text-white/40 leading-relaxed">
                    Search and download missing covers from Last.fm and iTunes.
                  </p>
                </div>
                <button
                  on:click={async () => {
                    if (window.peerifyAPI?.refineOnline) {
                      playback.update(s => ({ ...s, statusMessage: $t('refine_covers_msg') }));
                      const count = await window.peerifyAPI.refineOnline(true); // true means cover enrichment
                      playback.update(s => ({ ...s, statusMessage: `Enriched ${count} tracks.` }));
                    }
                  }}
                  class="shrink-0 px-8 py-4 bg-purple-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                >
                  {$t('refine_covers_btn')}
                </button>
              </div>
            </div>

            <!-- Advanced Genre Enrichment -->
            <div class="bg-black/30 p-8 rounded-3xl border border-white/5 mb-8">
              <h3 class="text-xs font-black text-white/40 uppercase tracking-widest mb-6 px-1">
                Advanced Library Tools
              </h3>
              <div
                class="flex items-center justify-between gap-8 bg-white/5 p-6 rounded-2xl border border-white/5 transition-all hover:bg-white/10"
              >
                <div class="flex-1">
                  <h4 class="text-base font-bold text-white mb-2">
                    Enrich Genres from Online Database
                  </h4>
                  <p class="text-xs text-white/40 leading-relaxed">
                    Sequentially search Last.fm, MusicBrainz, and iTunes for tracks with missing
                    genres. Uses ID3 tags for high accuracy. This may take several minutes.
                  </p>
                </div>
                <button
                  on:click={handleRefineOnline}
                  disabled={isRefining}
                  class="shrink-0 px-8 py-4 bg-cyan-400 text-black rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:scale-105 active:scale-95"
                >
                  {#if isRefining}
                    Refining...
                  {:else}
                    Enrich Genres
                  {/if}
                </button>
              </div>
            </div>

            <!-- OS Integration -->
            <button
              on:click={toggleContextMenu}
              class="w-full bg-white/5 border border-white/5 p-5 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all mb-8"
            >
              <div class="text-left">
                <p class="text-xs font-black text-white uppercase tracking-widest mb-1">
                  Explorer Context Menu
                </p>
                <p class="text-[10px] text-white/40 tracking-wide">
                  Register Kyn Mix in Windows right-click menu
                </p>
              </div>
              <div
                class="w-5 h-5 rounded-full border-2 border-white/20 {isContextMenuEnabled
                  ? 'bg-cyan-400 border-cyan-400 shadow-[0_0_10px_#00e5ff]'
                  : ''}"
              ></div>
            </button>
          </section>
        {/if}
      </div>
    {/key}
  </main>
</div>

<style>
  .glass-panel {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(40px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 20px 80px rgba(0, 0, 0, 0.5);
  }

  .glow-cyan {
    box-shadow:
      inset 0 0 100px rgba(0, 229, 255, 0.03),
      0 20px 80px rgba(0, 0, 0, 0.4);
  }

  .glow-purple {
    box-shadow:
      inset 0 0 100px rgba(168, 85, 247, 0.03),
      0 20px 80px rgba(0, 0, 0, 0.4);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.05);
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    border: 2px solid currentColor;
  }

  /* Remove focus outline from tab buttons */
  button:focus {
    outline: none;
  }

  select {
    cursor: pointer;
  }

  select option {
    background: #111;
    color: #fff;
  }
</style>
