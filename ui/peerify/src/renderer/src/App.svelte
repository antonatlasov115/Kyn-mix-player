<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { fly, fade, scale } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { t } from './lib/i18n'
  import { playback, audioVisuals } from './lib/stores/playback'
  import { library } from './lib/stores/library'
  import { settings as settingsStore } from './lib/stores/settings'

  import Sidebar from './components/layout/Sidebar.svelte'
  import Player from './components/layout/Player.svelte'
  import DynamicBackground from './components/layout/DynamicBackground.svelte'
  import HomeView from './components/views/HomeView.svelte'
  import LibraryView from './components/views/LibraryView.svelte'
  import SettingsView from './components/views/SettingsView.svelte'
  import QueueView from './components/views/QueueView.svelte'
  import PlaylistsView from './components/views/PlaylistsView.svelte'
  import AnalysisView from './components/views/AnalysisView.svelte'
  import MixEditorView from './components/views/MixEditorView.svelte'
  import AddonsView from './components/views/AddonsView.svelte'
  import DownloadManagerView from './components/views/DownloadManagerView.svelte'
  import SelectionActionBar from './components/layout/SelectionActionBar.svelte'
  import Mascot from './components/mascot/Mascot.svelte'
  import DebugOverlay from './components/layout/DebugOverlay.svelte'
  import ResourceMonitor from './components/ResourceMonitor.svelte'
  import GlobalContextMenu from './components/layout/GlobalContextMenu.svelte'
  import { U_API } from './lib/mixer'
  import { audioManager } from './lib/audioManager'
  import { playbackManager } from './lib/managers/PlaybackManager'
  import { libraryManager } from './lib/managers/LibraryManager'
  import { visualizerManager } from './lib/managers/VisualizerManager'
  import { comparePaths, fixPath } from './lib/utils'

  // --- REACTIVE STORE MAPPING ---
  $: ({ activeTab, searchQuery: globalSearchQuery, isScanning, scanProgress } = $library)
  $: ({ trackPath, isPlaying, volume, statusMessage, playQueue } = $playback)
  $: ({
    uiScale,
    crossfadeSeconds,
    useDropAlignment,
    autoCutSilence,
    showMascotName,
    showMascot,
    mascotBlur,
    mascotAberration,
    mascotRipple,
    mascotGhosts,
    mascotSensitivity,
    latencyMs,
    mascotCustomSkin,
    mascotSkin,
    theme,
    youtubeCookiesBrowser,
    maxConcurrentDownloads,
    mascotScale,
    libraryFolders,
    performanceProfile,
    intelliGainEnabled,
    vibrantBassEnabled,
    spatialProfile,
    doubleDropMode,
    proBassCrossover,
    proMidCrossover,
    proHighEntryDelay,
    proCurveExpo,
    proIncomingSwell,
    autoDownloadCovers,
    mascotLyricsMode,
    autoDownloadLyrics,
    showDebug
  } = $settingsStore)

  $: if (window.peerifyAPI?.setZoomFactor) window.peerifyAPI.setZoomFactor(uiScale)
  $: ({ tracks: libraryTracks, playlists: savedPlaylists } = $library)
  $: currentTrackObj =
    libraryTracks.find((t) => t.filePath && trackPath && comparePaths(t.filePath, trackPath)) ||
    null
  $: currentFileName = trackPath
    ? trackPath
        .split(/[\\/]/)
        .pop()
        .replace(/\.(mp3|wav|flac)$/i, '')
    : ''

  $: {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      if (trackPath && currentTrackObj) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrackObj.title || trackPath.split(/[\\/]/).pop(),
          artist: currentTrackObj.artist || currentTrackObj.genre || 'Kyn Mix',
          album: currentTrackObj.album || 'Kyn Mix Library',
          artwork: currentTrackObj.thumbnail
            ? [{ src: fixPath(currentTrackObj.thumbnail), sizes: '512x512', type: 'image/jpeg' }]
            : [{ src: 'icon.png', sizes: '512x512', type: 'image/png' }]
        })
      }
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }

  // Helpers for direct store updates
  function setPlayback(patch) {
    playback.update((s) => ({ ...s, ...patch }))
  }
  function setLibrary(patch) {
    library.update((s) => ({ ...s, ...patch }))
  }
  function setSettings(patch) {
    settingsStore.update((s) => ({ ...s, ...patch }))
  }

  // --- LOCAL UI STATE ---
  let isDragging = false,
    dragCounter = 0
  let mouseX = 0,
    mouseY = 0
  let editorTrack1 = '',
    editorTrack2 = ''
  let mascotAnnouncement = ''
  let curveType = 'equal'

  onMount(async () => {
    const cleanupHandlers = []
    const dragOverHandler = (e) => e.preventDefault()
    const dropHandler = (e) => e.preventDefault()
    window.addEventListener('dragover', dragOverHandler, false)
    window.addEventListener('drop', dropHandler, false)
    window.onerror = () => false

    // Initialize Specialized Managers
    try {
      const savedSkin = localStorage.getItem('peerify_mascot_skin')
      if (savedSkin) setSettings({ mascotCustomSkin: JSON.parse(savedSkin) })
    } catch (e) {}

    const playTrackHandler = (e: any) => playLocalTrack(e.detail.track)
    const addToQueueHandler = (e: any) => addToQueue(e.detail.track)

    document.body.addEventListener('playTrack', playTrackHandler)
    document.body.addEventListener('addToQueue', addToQueueHandler)
    cleanupHandlers.push(() => {
      document.body.removeEventListener('playTrack', playTrackHandler)
      document.body.removeEventListener('addToQueue', addToQueueHandler)
    })

    if (window.peerifyAPI?.setLatency && latencyMs) {
      window.peerifyAPI.setLatency(latencyMs)
    }

    libraryManager.init()
    playbackManager.init()
    visualizerManager.start()

    // Hardware Audio Sync Loop
    let syncInterval
    const runSync = async () => {
      const isHidden = document.visibilityState === 'hidden'
      if (!isHidden) {
        await audioManager.sync(volume)
      }
      // Adaptive interval: 16ms when visible (60fps), 500ms when hidden (2fps)
      syncInterval = setTimeout(runSync, isHidden ? 500 : 16)
    }
    runSync()
    cleanupHandlers.push(() => clearTimeout(syncInterval))

    if (typeof localStorage !== 'undefined') {
      const savedVolume = localStorage.getItem('peerify_volume')
      if (savedVolume) setPlayback({ volume: parseFloat(savedVolume) })
    }

    const announcementHandler = (e) => {
      // In lyrics mode, we don't want to show technical "DROP!" announcements
      if (mascotLyricsMode) return
      
      mascotAnnouncement = e.detail
      setTimeout(() => (mascotAnnouncement = ''), 2500)
    }
    window.addEventListener('mascot-announcement', announcementHandler)
    cleanupHandlers.push(() =>
      window.removeEventListener('mascot-announcement', announcementHandler)
    )

    const mouseMoveHandler = (e) => {
      mouseX = e.clientX
      mouseY = e.clientY
      updateMouseGlow(e.clientX, e.clientY)
    }
    window.addEventListener('mousemove', mouseMoveHandler)

    const keyDownHandler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setSettings({ showDebug: !showDebug });
      }
    }
    window.addEventListener('keydown', keyDownHandler);

    cleanupHandlers.push(() => {
      window.removeEventListener('keydown', keyDownHandler)
      window.removeEventListener('mousemove', mouseMoveHandler)
      window.removeEventListener('dragover', dragOverHandler)
      window.removeEventListener('drop', dropHandler)
      window.onerror = null
      libraryManager.destroy()
      playbackManager.destroy()
    })

    window._peerify_cleanup = cleanupHandlers
  })

  onDestroy(() => {
    visualizerManager.stop()
    audioManager.destroy()
    if (window._peerify_cleanup) {
      window._peerify_cleanup.forEach((fn) => fn())
      delete window._peerify_cleanup
    }
  })

  let glowX = 0,
    glowY = 0
  function updateMouseGlow(x, y) {
    glowX += (x - glowX) * 0.1
    glowY += (y - glowY) * 0.1
  }

  function handleDragEnter(e) {
    e.preventDefault()
    dragCounter++
    isDragging = true
  }
  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }
  function handleDragLeave(e) {
    e.preventDefault()
    dragCounter--
    if (dragCounter === 0) isDragging = false
  }
  function handleDrop(e) {
    dragCounter = 0
    isDragging = false
    libraryManager.handleDrop(e)
  }

  function handleAddFolder() {
    libraryManager.handleAddFolder()
  }
  function handleScan() {
    libraryManager.handleScan()
  }
  function handleRemoveFolder(path) {
    libraryManager.handleRemoveFolder(path)
  }
  function handleDeleteTrack(track) {
    libraryManager.handleDeleteTrack(track)
  }
  function handleDeletePlaylist(playlist) {
    libraryManager.handleDeletePlaylist(playlist)
  }
  function handleSaveRecipe(e) {
    libraryManager.handleSaveRecipe(e.detail)
  }
  function handleEditMix(tracks) {
    libraryManager.handleEditMix(tracks, (t1, t2) => {
      editorTrack1 = t1
      editorTrack2 = t2
    })
  }
  async function loadLibrary() {
    await libraryManager.loadLibrary()
  }

  function handleToggle() {
    playbackManager.handleToggle()
  }
  function handleSeek(e) {
    playbackManager.handleSeek(e)
  }
  function handlePrevious() {
    playbackManager.handlePrevious()
  }
  function handleHybridAutomix() {
    playbackManager.handleHybridAutomix()
  }
  function playLocalTrack(track) {
    playbackManager.playLocalTrack(track)
  }
  function addToQueue(track) {
    playbackManager.addToQueue(track)
  }
  function removeFromQueue(id) {
    playbackManager.removeFromQueue(id)
  }
  function handleToggleRepeat() {
    playbackManager.handleToggleRepeat()
  }
  function handleToggleShuffle() {
    playbackManager.handleToggleShuffle()
  }
  function applyPitch(f) {
    playbackManager.applyPitch(f)
  }
  function toggleSlowedReverb() {
    playbackManager.toggleSlowedReverb()
  }
  function toggleReverb() {
    playbackManager.toggleReverb()
  }
  function playFromQueue(idx) {
    playbackManager.playFromQueue(idx)
  }
  function saveCurrentQueue(name) {
    libraryManager.saveCurrentQueue(name)
  }
  function loadPlaylistToQueue(tracks) {
    libraryManager.loadPlaylistToQueue(tracks)
  }
  function updateMascotSensitivity(val: number) {
    setSettings({ mascotSensitivity: val })
  }

  // --- PERFORMANCE PROFILE HANDLING ---
  $: {
    if (typeof document !== 'undefined') {
      const isPotato = performanceProfile === 'potato' || performanceProfile === 'low';
      document.documentElement.classList.toggle('potato-mode', isPotato);
    }
  }
</script>

<div
  class="h-screen w-screen flex flex-col bg-[var(--bg-app)] text-white font-sans overflow-hidden select-none relative z-0 {theme &&
  theme !== 'default'
    ? `theme-${theme}`
    : ''}"
  on:dragenter={handleDragEnter}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="application"
>
  <div
    class="absolute pointer-events-none z-[-1] transition-opacity duration-1000"
    style="
      left: 0; 
      top: 0; 
      width: 600px; 
      height: 600px; 
      background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%); 
      transform: translate3d(calc({glowX}px - 50%), calc({glowY}px - 50%), 0); 
      will-change: transform;
      filter: blur({performanceProfile === 'epic' ? 20 : 0}px);
    "
  ></div>
  {#if isDragging}
    <div
      class="absolute inset-0 z-[100] bg-black/70 backdrop-blur-md border-4 border-dashed border-accent-primary flex flex-col items-center justify-center pointer-events-none"
    >
      <h2 class="text-2xl font-black text-white tracking-widest uppercase drop-shadow-lg">
        {$t('drop_files_here')}
      </h2>
    </div>
  {/if}
  <header
    class="h-10 w-full bg-[var(--bg-navy)] border-b border-white/5 flex-shrink-0 flex items-center px-4 justify-between z-[200] relative transition-colors duration-1000"
    style="-webkit-app-region: drag;"
  >
    <div class="w-32 shrink-0 flex justify-start pl-2" style="-webkit-app-region: no-drag;">
      <button
        on:click={() => setLibrary({ activeTab: 'settings' })}
        class="flex items-center gap-2 px-3 py-1 rounded-lg transition-all duration-300 {activeTab ===
        'settings'
          ? 'bg-[var(--accent-primary)] text-black shadow-[0_0_20px_var(--accent-glow)]'
          : 'bg-white/10 text-white hover:bg-white/20'}"
        title={$t('settings')}
      >
        <svg
          class="w-4 h-4 {activeTab === 'settings'
            ? 'rotate-90'
            : ''} transition-transform duration-500"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          /><circle cx="12" cy="12" r="3" /></svg
        >
        <span class="text-[10px] font-black uppercase tracking-tight">{$t('settings')}</span>
      </button>
    </div>
    <div
      class="flex-1 max-w-md flex justify-center text-[#B8C5D6] text-[9px] font-black uppercase tracking-widest truncate px-4 opacity-40"
    >
      {statusMessage}
    </div>
    <div class="w-32 shrink-0 flex justify-end gap-1 pr-2" style="-webkit-app-region: no-drag;">
      <button
        on:click={() => window.peerifyAPI.minimize()}
        class="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-all text-white/30 hover:text-white"
        aria-label="Minimize"
        ><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          ><path d="M5 12h14" /></svg
        ></button
      >
      <button
        on:click={() => window.peerifyAPI.maximize()}
        class="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-all text-white/30 hover:text-white"
        aria-label="Maximize"
        ><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          ><rect x="5" y="5" width="14" height="14" rx="1" /></svg
        ></button
      >
      <button
        on:click={() => window.peerifyAPI.close()}
        class="w-8 h-8 flex items-center justify-center hover:bg-red-500/80 rounded-lg transition-all text-white/30 hover:text-white"
        aria-label="Close"
        ><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          ><path d="M18 6L6 18M6 6l12 12" /></svg
        ></button
      >
    </div>
  </header>

  <div
    class="flex-1 flex flex-col relative overflow-hidden bg-transparent"
    style="-webkit-app-region: no-drag;"
  >
    <DynamicBackground />

    {#if showMascot}
      <Mascot announcement={mascotAnnouncement} onSensitivityChange={updateMascotSensitivity} />
    {/if}

    <GlobalContextMenu />

    <div class="flex flex-1 min-h-0 relative z-10 w-full overflow-hidden">
      <Sidebar
        {activeTab}
        {isScanning}
        {scanProgress}
        playlists={savedPlaylists}
        selectedPlaylist={$library.selectedPlaylist}
        on:navigate={(e) => setLibrary({ activeTab: e.detail })}
        on:selectPlaylist={(e) =>
          setLibrary({ selectedPlaylist: e.detail, activeTab: 'playlists' })}
      />
      <main class="flex-1 relative min-w-0 h-full overflow-hidden flex flex-col">
        {#key activeTab}
          <div
            class="absolute inset-0 w-full h-full bg-transparent"
            in:scale={{ start: 0.96, duration: 300, opacity: 0, easing: quintOut, delay: 250 }}
            out:fade={{ duration: 150 }}
          >
            {#if activeTab === 'home'}
              <HomeView
                {libraryTracks}
                onScanDirectory={handleAddFolder}
                searchQuery={globalSearchQuery}
                on:search={(e) => setLibrary({ searchQuery: e.detail, activeTab: 'library' })}
                onSearch={() => setLibrary({ activeTab: 'library' })}
              />
            {:else if activeTab === 'library'}
              <LibraryView
                {libraryTracks}
                {trackPath}
                {isPlaying}
                searchQuery={globalSearchQuery}
                onPlayTrack={playLocalTrack}
                onAddToQueue={addToQueue}
                onDeleteTrack={handleDeleteTrack}
              />
            {:else if activeTab === 'settings'}
              <SettingsView
                {mascotSkin}
                {crossfadeSeconds}
                {useDropAlignment}
                {autoCutSilence}
                {showMascotName}
                {showMascot}
                {mascotBlur}
                {mascotAberration}
                {mascotRipple}
                {mascotGhosts}
                {mascotSensitivity}
                {mascotScale}
                {uiScale}
                {latencyMs}
                onUpdateSettings={setSettings}
                {libraryFolders}
                onAddFolder={handleAddFolder}
                onRemoveFolder={handleRemoveFolder}
                {mascotCustomSkin}
                onUpdateCustomSkin={(skin) => {
                  setSettings({ mascotCustomSkin: skin })
                  localStorage.setItem('peerify_mascot_skin', JSON.stringify(skin))
                }}
                onUpdateSensitivity={(val) => setSettings({ mascotSensitivity: val })}
                onScan={handleScan}
                {theme}
                {youtubeCookiesBrowser}
                {maxConcurrentDownloads}
                {performanceProfile}
                {intelliGainEnabled}
                {vibrantBassEnabled}
                {spatialProfile}
                {doubleDropMode}
                {proBassCrossover}
                {proMidCrossover}
                {proHighEntryDelay}
                {proCurveExpo}
                {proIncomingSwell}
                {autoDownloadCovers}
                {mascotLyricsMode}
                {autoDownloadLyrics}
              />
            {:else if activeTab === 'queue'}
              <QueueView
                {playQueue}
                {currentFileName}
                onRemoveFromQueue={removeFromQueue}
                onSavePlaylist={saveCurrentQueue}
                onPlayFromQueue={playFromQueue}
              />
            {:else if activeTab === 'playlists'}
              <PlaylistsView
                playlists={savedPlaylists}
                onLoadPlaylist={loadPlaylistToQueue}
                onDeletePlaylist={handleDeletePlaylist}
                {libraryTracks}
              />
            {:else if activeTab === 'analysis'}
              <AnalysisView track={currentTrackObj} {isPlaying} />
            {:else if activeTab === 'studio'}
              <MixEditorView
                isVisible={activeTab === 'studio'}
                initialTrack1={editorTrack1}
                initialTrack2={editorTrack2}
                {curveType}
                on:updateCurve={(e) => (curveType = e.detail)}
                on:saveRecipe={handleSaveRecipe}
              />
            {:else if activeTab === 'addons'}
              <AddonsView on:refreshLibrary={loadLibrary} />
            {:else if activeTab === 'downloads'}
              <DownloadManagerView />
            {/if}
          </div>
        {/key}
      </main>
    </div>
  </div>

  <Player
    {currentFileName}
    drop_pos={currentTrackObj?.drop_pos || 0}
    outro_start={currentTrackObj?.outro_start || 0}
    thumbnail={currentTrackObj?.thumbnail}
    originalCover={currentTrackObj?.originalCover}
  />

  <DebugOverlay visible={showDebug} />
  <ResourceMonitor />
</div>

<style>
  :global(:root) {
    --frost-blue: #00e5ff;
    --navy-bg: #060a14;
  }
  :global(body) {
    background-color: var(--bg-app);
  }
  :global(.custom-scrollbar::-webkit-scrollbar) {
    width: 10px;
  }
  :global(.custom-scrollbar::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(.custom-scrollbar::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 2px solid var(--bg-app);
  }
  :global(.potato-mode *) {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    text-shadow: none !important;
    box-shadow: none !important;
    filter: none !important;
  }
</style>
