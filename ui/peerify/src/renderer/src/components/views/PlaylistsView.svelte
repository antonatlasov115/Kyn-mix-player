<script>
  import { t } from '../../lib/i18n'
  import { library } from '../../lib/stores/library'
  import { libraryManager } from '../../lib/managers/LibraryManager'

  export let playlists = []
  export let libraryTracks = []
  export let onLoadPlaylist
  export let onDeletePlaylist

  import { onMount, tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fade, fly, slide, scale } from 'svelte/transition'
  import { playback } from '../../lib/stores/playback'
  import { settings } from '../../lib/stores/settings'
  import TrackList from '../layout/TrackList.svelte'
  import TransitionEditorModal from './mix/TransitionEditorModal.svelte'

  // --- Transition Editor ---
  let editingTransition = null
  
  function openTransitionEditor(trackA, trackB, idxA, idxB) {
    editingTransition = { 
        trackA: trackA.track, 
        trackB: trackB.track, 
        idxA, 
        idxB,
        initialOffset: trackB.offset || 0,
        initialDuration: trackB.crossfade ?? $settings.crossfadeSeconds,
        initialCurve: trackB.curve || 'smooth'
    }
  }

  async function saveTransition(data) {
    if (!editingTransition) return
    const { idxB } = editingTransition
    const trackItemB = selectedPlaylist.tracks[idxB]
    
    trackItemB.offset = data.offset
    trackItemB.crossfade = data.duration
    trackItemB.curve = data.curve
    
    selectedPlaylist.tracks = [...selectedPlaylist.tracks]
    await savePlaylist()
    editingTransition = null
  }

  // Helper for BPM
  const getBpm = (t) => {
    if (!t) return 120.0
    if (t.bpm) return parseFloat(t.bpm)
    if (t.title && typeof t.title === 'string')
      return parseFloat(t.title.replace('BPM: ', '')) || 120.0
    return 120.0
  }

  $: smartPlaylists = [
    {
      name: $t('chill_lofi_name'),
      desc: $t('chill_lofi_desc'),
      type: 'smart',
      color: 'from-blue-500/20 to-purple-600/20',
      hover: 'hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]',
      tracks: libraryTracks.filter(
        (t) =>
          t.genre === 'lo-fi' ||
          t.genre === 'classical' ||
          t.genre === 'acoustic' ||
          t.genre === 'jazz'
      )
    },
    {
      name: $t('groove_hiphop_name'),
      desc: $t('groove_hiphop_desc'),
      type: 'smart',
      color: 'from-emerald-500/20 to-teal-600/20',
      hover: 'hover:border-emerald-400/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]',
      tracks: libraryTracks.filter((t) => t.genre === 'hip-hop' || t.genre === 'r&b')
    },
    {
      name: $t('mainstage_dance_name'),
      desc: $t('mainstage_dance_desc'),
      type: 'smart',
      color: 'from-pink-500/20 to-orange-600/20',
      hover: 'hover:border-pink-400/50 hover:shadow-[0_0_30px_rgba(236,72,153,0.3)]',
      tracks: libraryTracks.filter(
        (t) =>
          t.genre === 'house' ||
          t.genre === 'pop' ||
          t.genre === 'dance_pop' ||
          t.genre === 'synthwave'
      )
    },
    {
      name: $t('hard_fast_name'),
      desc: $t('hard_fast_desc'),
      type: 'smart',
      color: 'from-red-500/20 to-rose-700/20',
      hover: 'hover:border-red-400/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]',
      tracks: libraryTracks.filter(
        (t) =>
          t.genre === 'rock' ||
          t.genre === 'drum_and_bass' ||
          t.genre === 'dubstep' ||
          t.genre === 'phonk'
      )
    },
    {
      name: $t('recently_added_name'),
      desc: $t('recently_added_desc'),
      type: 'smart',
      color: 'from-gray-600/20 to-slate-800/20',
      hover: 'hover:border-white/20 hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]',
      tracks: [...libraryTracks].sort((a, b) => (b.addDate || 0) - (a.addDate || 0)).slice(0, 20)
    }
  ].filter((p) => p.tracks.length > 0)

  $: bpmGroups = [
    { min: 0, max: 100, label: $t('bpm_low'), color: 'from-blue-600/20 to-indigo-700/20' },
    { min: 100, max: 115, label: $t('bpm_mid'), color: 'from-indigo-600/20 to-purple-700/20' },
    { min: 115, max: 124, label: $t('bpm_house'), color: 'from-purple-600/20 to-pink-700/20' },
    { min: 124, max: 130, label: $t('bpm_floor'), color: 'from-pink-600/20 to-rose-700/20' },
    { min: 130, max: 145, label: $t('bpm_high'), color: 'from-rose-600/20 to-orange-700/20' },
    { min: 145, max: 999, label: $t('bpm_hardcore'), color: 'from-orange-600/20 to-red-700/20' }
  ]

  $: rangePlaylists = bpmGroups
    .map((group) => {
      const tracks = libraryTracks.filter((t) => {
        const bpm = getBpm(t)
        return bpm >= group.min && bpm < group.max && t.genre !== 'Unknown'
      })
      return {
        name: group.label,
        desc: `${group.min}-${group.max === 999 ? '∞' : group.max} BPM`,
        type: 'bpm_range',
        color: group.color,
        hover: 'hover:border-white/20 hover:shadow-[0_0_40px_rgba(255,255,255,0.1)]',
        tracks: tracks
      }
    })
    .filter((p) => p.tracks.length >= 2)

  let currentCategory = 'discovery' // 'discovery', 'my_mixes'
  let playlistSearch = ''

  $: filteredPlaylists = playlists.filter(
    (p) =>
      p &&
      p.name &&
      (!playlistSearch || p.name.toLowerCase().includes(playlistSearch.toLowerCase()))
  )

  const categories = [
    { id: 'discovery', name: $t('discovery'), icon: '✨' },
    { id: 'my_mixes', name: $t('my_mixes'), icon: '📁' }
  ]

  import { fixPath, comparePaths } from '../../lib/utils'

  // --- Sort ---
  let sortMode = 'recent' // 'recent' | 'az' | 'most'
  $: sortedPlaylists = [...filteredPlaylists].sort((a, b) => {
    if (sortMode === 'az') return a.name.localeCompare(b.name)
    if (sortMode === 'most') return (b.tracks?.length || 0) - (a.tracks?.length || 0)
    return 0 // recent = insertion order
  })

  // --- Folder Grouping ---
  $: playlistsByFolder = sortedPlaylists.reduce((acc, p) => {
    const folder = p.folder || ''
    if (!acc[folder]) acc[folder] = []
    acc[folder].push(p)
    return acc
  }, {})

  $: folderList = Object.keys(playlistsByFolder).sort()

  // --- Rename ---

  // --- Rename ---
  let renamingPlaylist = null
  let renameValue = ''
  let renameInputRef

  async function startRename(playlist, e) {
    e?.stopPropagation()
    renamingPlaylist = playlist
    renameValue = playlist.name
    await tick()
    renameInputRef?.select()
  }

  async function commitRename() {
    if (!renamingPlaylist) return
    await libraryManager.renamePlaylist(renamingPlaylist, renameValue)
    renamingPlaylist = null
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') renamingPlaylist = null
  }

  // --- Duration helpers ---
  function formatTotalDuration(tracks) {
    const secs = (tracks || []).reduce((a, b) => a + (b.track?.duration || b.duration || 0), 0)
    if (!secs) return ''
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  // --- Save discovery as My Mix ---
  async function saveDiscoveryPlaylist(playlist) {
    const tracks = playlist.tracks.map((t, i) => ({
      id: Date.now() + i,
      track: t,
      crossfade: 4,
      curve: 'equal',
      offset: 0
    }))
    await libraryManager.createPlaylistFromTracks(playlist.name, tracks)
  }

  // --- Drag-to-reorder ---
  let dragIdx = null

  function onDragStart(i) {
    dragIdx = i
  }
  function onDragOver(e, i) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === i) return
    const arr = [...selectedPlaylist.tracks]
    const [item] = arr.splice(dragIdx, 1)
    arr.splice(i, 0, item)
    selectedPlaylist.tracks = arr
    dragIdx = i
  }
  function onDragEnd() {
    dragIdx = null
    savePlaylist()
  }

  // --- Editor Logic ---
  let selectedTrackIdx = 0
  let showFxPanel = false

  $: selectedPlaylist = $library.selectedPlaylist

  // Filter out tracks that no longer exist in the library (dangling tracks)
  $: availableTracks = (selectedPlaylist?.tracks || []).map((item) => {
    const trackExists = libraryTracks.some(
      (lt) => lt.filePath && item.track?.filePath && comparePaths(lt.filePath, item.track.filePath)
    )
    return { ...item, isMissing: !trackExists }
  })

  $: currentTracks = availableTracks
  $: selectedTrack = currentTracks[selectedTrackIdx] || null

  async function savePlaylist() {
    if (!selectedPlaylist || !window.peerifyAPI?.savePlaylist) return
    await window.peerifyAPI.savePlaylist(selectedPlaylist.name, selectedPlaylist.tracks)
    libraryManager.loadPlaylists()
  }

  function removeTrack(idx) {
    selectedPlaylist.tracks = selectedPlaylist.tracks.filter((_, i) => i !== idx)
    savePlaylist()
  }

  function playPlaylist(startIdx = 0) {
    const tracksToPlay = currentTracks.slice(startIdx)
    libraryManager.loadPlaylistToQueue(tracksToPlay)
  }

  function updateTrackSetting(key, val) {
    if (!selectedTrack) return
    selectedTrack[key] = val
    selectedPlaylist.tracks = [...selectedPlaylist.tracks]
    savePlaylist()
  }

  function formatDuration(sec) {
    if (!sec) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  let showNamingInput = false
  let newName = ''
  let namingInputRef

  async function startNaming() {
    showNamingInput = true
    newName = ''
    await tick()
    namingInputRef?.focus()
  }

  async function handleCreate() {
    const finalName = newName.trim() || $t('new_playlist')
    await libraryManager.createEmptyPlaylist(finalName)
    showNamingInput = false
    newName = ''
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') showNamingInput = false
  }
</script>

<div
  class="h-full flex flex-col bg-transparent text-white relative z-10 glass-noise pt-6"
  style="-webkit-app-region: no-drag;"
>
  <!-- Top Navigation -->
  <header
    class="px-8 py-6 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#03060E]/20 backdrop-blur-xl z-20"
  >
    <div class="flex items-center gap-8">
      <h1 class="text-3xl font-black tracking-tighter text-white mr-4">
        {$t('playlists')}
      </h1>
      <nav class="flex gap-2">
        {#each categories as cat}
          <button
            on:click={() => {
              currentCategory = cat.id
              library.update((s) => ({ ...s, selectedPlaylist: null }))
            }}
            class="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all
            {!selectedPlaylist && currentCategory === cat.id
              ? 'bg-accent-primary text-black'
              : 'text-white/40 hover:text-white hover:bg-white/5'}"
          >
            {cat.name}
          </button>
        {/each}
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <button
        on:click={() => libraryManager.handleImportM3U()}
        class="px-5 py-2.5 bg-white/5 border border-white/10 text-white/70 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        {$t('import_m3u') || 'Import M3U'}
      </button>
      {#if showNamingInput}
        <div
          class="flex items-center gap-2 px-6 py-2 bg-white/5 border border-white/10 rounded-xl"
          transition:fly={{ x: 20, duration: 400 }}
        >
          <input
            bind:this={namingInputRef}
            bind:value={newName}
            on:keydown={handleKeydown}
            placeholder={$t('playlist_name_placeholder')}
            class="bg-transparent border-none outline-none text-white font-black text-[10px] uppercase tracking-widest w-48 placeholder-white/20"
          />
          <button
            on:click={handleCreate}
            class="px-4 py-1.5 bg-accent-primary text-black rounded-lg font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
          >
            {$t('confirm')}
          </button>
          <button
            on:click={() => (showNamingInput = false)}
            class="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>
      {:else}
        <button
          on:click={startNaming}
          class="px-6 py-2.5 bg-accent-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_var(--accent-glow)] flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M12 4v16m8-8H4"
            />
          </svg>
          {$t('create_playlist')}
        </button>
      {/if}
    </div>
  </header>

  <div class="flex-1 overflow-hidden relative">
    {#if !selectedPlaylist}
      <div class="h-full overflow-y-auto custom-scrollbar p-8 pb-48" in:fade>
        {#if currentCategory === 'discovery'}
          <div class="space-y-12">
            {#if rangePlaylists.length > 0}
              <section>
                <div class="flex items-center gap-4 mb-8">
                  <div class="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></div>
                  <h3 class="text-[11px] font-black text-white/40 uppercase tracking-[0.4em]">
                    {$t('perfect_mix')}
                  </h3>
                </div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                  {#each rangePlaylists as playlist}
                    <div
                      on:click={() =>
                        onLoadPlaylist(playlist.tracks.map((t) => ({ track: t, crossfade: 4 })))}
                      on:keydown={(e) =>
                        e.key === 'Enter' &&
                        onLoadPlaylist(playlist.tracks.map((t) => ({ track: t, crossfade: 4 })))}
                      role="button"
                      tabindex="0"
                      class="discovery-card {playlist.color} {playlist.hover} glass-noise group w-full text-left cursor-pointer"
                      aria-label="Load {playlist.name} playlist"
                    >
                      <!-- Blurred Background -->
                      {#if playlist.tracks[0]?.thumbnail}
                        <div class="absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
                          <img
                            src="media://local/{playlist.tracks[0].thumbnail}"
                            alt=""
                            class="w-full h-full object-cover blur-3xl opacity-20 scale-150 group-hover:scale-100 transition-transform duration-1000"
                          />
                        </div>
                      {/if}

                      <div class="relative z-10">
                        <h4 class="text-xl font-black text-white">{playlist.name}</h4>
                        <p
                          class="text-[10px] font-black text-white/30 uppercase tracking-widest mt-2"
                        >
                          {playlist.desc}
                        </p>

                        <div class="mt-12 flex justify-between items-end">
                          <span
                            class="text-white/40 font-black text-[10px] uppercase tracking-widest"
                            >{playlist.tracks.length} {$t('tracks_count')}</span
                          >
                          <div class="flex items-center gap-2">
                            <button
                              on:click|stopPropagation={() => saveDiscoveryPlaylist(playlist)}
                              class="px-3 py-2 bg-white/10 hover:bg-accent-primary hover:text-black text-white/60 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                              title="Save as My Mix">💾 Save</button
                            >
                            <div
                              class="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform"
                            >
                              <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"
                                ><path d="M8 5v14l11-7z" /></svg
                              >
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/if}

            {#if smartPlaylists.length > 0}
              <section>
                <div class="flex items-center gap-4 mb-8">
                  <div class="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                  <h3 class="text-[11px] font-black text-white/40 uppercase tracking-[0.4em]">
                    {$t('genre_mixes')}
                  </h3>
                </div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
                  {#each smartPlaylists as playlist}
                    <div
                      on:click={() =>
                        onLoadPlaylist(playlist.tracks.map((t) => ({ track: t, crossfade: 4 })))}
                      on:keydown={(e) =>
                        e.key === 'Enter' &&
                        onLoadPlaylist(playlist.tracks.map((t) => ({ track: t, crossfade: 4 })))}
                      role="button"
                      tabindex="0"
                      class="discovery-card {playlist.color} {playlist.hover} glass-noise group w-full text-left cursor-pointer"
                      aria-label="Load {playlist.name} playlist"
                    >
                      <!-- Blurred Background -->
                      {#if playlist.tracks[0]?.thumbnail}
                        <div class="absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
                          <img
                            src="media://local/{playlist.tracks[0].thumbnail}"
                            alt=""
                            class="w-full h-full object-cover blur-3xl opacity-20 scale-150 group-hover:scale-100 transition-transform duration-1000"
                          />
                        </div>
                      {/if}

                      <div class="relative z-10">
                        <h4 class="text-xl font-black text-white">{playlist.name}</h4>
                        <p
                          class="text-[10px] font-black text-white/30 uppercase tracking-widest mt-2"
                        >
                          {playlist.desc}
                        </p>

                        <div class="mt-12 flex justify-between items-end">
                          <span
                            class="text-white/40 font-black text-[10px] uppercase tracking-widest"
                            >{playlist.tracks.length} {$t('tracks_count')}</span
                          >
                          <div class="flex items-center gap-2">
                            <button
                              on:click|stopPropagation={() => saveDiscoveryPlaylist(playlist)}
                              class="px-3 py-2 bg-white/10 hover:bg-accent-primary hover:text-black text-white/60 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                              title="Save as My Mix">💾 Save</button
                            >
                            <div
                              class="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform"
                            >
                              <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"
                                ><path d="M8 5v14l11-7z" /></svg
                              >
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/if}
          </div>
        {:else if currentCategory === 'my_mixes'}
          <div class="mb-8 flex flex-col gap-4">
            <!-- Sort + Search row -->
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                {#each [['recent', 'Recent'], ['az', 'A–Z'], ['most', 'Most']] as [id, label]}
                  <button
                    on:click={() => (sortMode = id)}
                    class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all {sortMode ===
                    id
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-white/30 hover:text-white/60'}">{label}</button
                  >
                {/each}
              </div>
              <div class="relative flex-1 group">
                <svg
                  class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent-primary transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  bind:value={playlistSearch}
                  placeholder={$t('search_playlists_placeholder')}
                  class="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-[11px] font-black uppercase tracking-widest text-white outline-none focus:border-accent-primary/40 focus:bg-white/[0.05] transition-all"
                />
              </div>
            </div>
          </div>

          <div class="space-y-16">
            {#each folderList as folder}
              <section class="folder-group">
                {#if folder}
                  <div class="flex items-center gap-4 mb-8">
                    <div
                      class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/40"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                      </svg>
                    </div>
                    <h3 class="text-[12px] font-black text-white/60 uppercase tracking-[0.3em]">
                      {folder}
                    </h3>
                    <div class="h-[1px] flex-1 bg-white/5"></div>
                  </div>
                {/if}

                <div class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-8">
                  {#each playlistsByFolder[folder] as playlist, i (playlist.name)}
                    {@const firstTracks = playlist.tracks?.slice(0, 4) || []}
                    {@const totalDur = formatTotalDuration(playlist.tracks)}
                    <div
                      animate:flip={{ duration: 400 }}
                      in:scale={{ start: 0.95, duration: 400, delay: Math.min(i * 30, 300) }}
                      out:fade={{ duration: 200 }}
                      class="h-full"
                    >
                      <div
                        on:click={() =>
                          library.update((s) => ({ ...s, selectedPlaylist: playlist }))}
                        on:dblclick|stopPropagation={(e) => startRename(playlist, e)}
                        on:keydown={(e) =>
                          (e.key === 'Enter' || e.key === ' ') &&
                          library.update((s) => ({ ...s, selectedPlaylist: playlist }))}
                        role="button"
                        tabindex="0"
                        class="group relative h-full bg-white/[0.03] border border-white/5 rounded-[2.5rem] p-8 hover:bg-white/[0.08] hover:border-white/10 transition-all duration-500 cursor-pointer overflow-hidden glass-noise-heavy w-full text-left"
                      >
                        <!-- Cider-style Dynamic Gradient Background -->
                        {#if firstTracks[0]?.track?.thumbnail}
                          <div
                            class="absolute inset-0 z-0 opacity-0 group-hover:opacity-20 transition-opacity duration-1000"
                          >
                            <img
                              src="media://local/{firstTracks[0].track.thumbnail}"
                              alt=""
                              class="w-full h-full object-cover blur-[100px] scale-150 rotate-12"
                            />
                          </div>
                        {/if}

                        <div class="relative z-10">
                          <div class="flex justify-between items-start mb-8">
                            <!-- Dynamic 2x2 Grid Cover with Premium Polish -->
                            <div
                              class="w-24 h-24 bg-white/5 rounded-3xl overflow-hidden grid grid-cols-2 grid-rows-2 group-hover:scale-105 transition-transform duration-700 shadow-2xl border border-white/5 rotate-[-2deg] group-hover:rotate-0"
                            >
                              {#if firstTracks.length > 0}
                                {#each [0, 1, 2, 3] as j}
                                  <div
                                    class="bg-white/[0.02] flex items-center justify-center overflow-hidden"
                                  >
                                    {#if firstTracks[j]?.track?.thumbnail}
                                      <img
                                        src="media://local/{firstTracks[j].track.thumbnail}"
                                        alt=""
                                        class="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    {:else}
                                      <div
                                        class="w-full h-full flex items-center justify-center text-white/5 text-[8px]"
                                      >
                                        PEERIFY
                                      </div>
                                    {/if}
                                  </div>
                                {/each}
                              {:else}
                                <div
                                  class="col-span-2 row-span-2 flex items-center justify-center text-accent-primary opacity-20"
                                >
                                  <svg
                                    class="w-10 h-10"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      stroke-width="2"
                                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                                    />
                                  </svg>
                                </div>
                              {/if}
                            </div>

                            <!-- Action buttons (duplicate + export + delete) -->
                            <div
                              class="flex flex-col gap-2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-500"
                            >
                              <button
                                on:click|stopPropagation={() =>
                                  libraryManager.duplicatePlaylist(playlist)}
                                class="w-9 h-9 rounded-2xl flex items-center justify-center text-white/40 hover:text-accent-primary hover:bg-accent-primary/10 transition-all bg-white/5"
                                title="Duplicate"
                              >
                                <svg
                                  class="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                              </button>
                              <button
                                on:click|stopPropagation={() =>
                                  libraryManager.handleExportM3U(playlist)}
                                class="w-9 h-9 rounded-2xl flex items-center justify-center text-white/40 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all bg-white/5"
                                title="Export M3U"
                              >
                                <svg
                                  class="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-16L8 8m4-4v12"
                                  />
                                </svg>
                              </button>
                              <button
                                on:click|stopPropagation={() => onDeletePlaylist(playlist)}
                                class="w-9 h-9 rounded-2xl flex items-center justify-center text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all bg-white/5"
                                title="Delete"
                              >
                                <svg
                                  class="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {#if renamingPlaylist === playlist}
                            <input
                              bind:this={renameInputRef}
                              bind:value={renameValue}
                              on:keydown={handleRenameKey}
                              on:blur={commitRename}
                              on:click|stopPropagation
                              class="text-2xl font-black text-white bg-white/10 border border-accent-primary/40 rounded-xl px-3 py-1 w-full outline-none mb-2"
                            />
                          {:else}
                            <h3
                              class="text-2xl font-black text-white mb-1 truncate group-hover:text-accent-primary transition-colors duration-300"
                            >
                              {playlist.name}
                            </h3>
                          {/if}
                          <div class="flex items-center gap-3">
                            <p
                              class="text-[10px] font-black text-white/40 uppercase tracking-widest"
                            >
                              {playlist.tracks?.length || 0}
                              {$t('tracks_count')}
                            </p>
                            {#if totalDur}<span class="text-[10px] text-white/20 font-black"
                                >· {totalDur}</span
                              >{/if}
                          </div>

                          <div
                            class="mt-8 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                          >
                            <span
                              class="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]"
                              >Rename available on double-click</span
                            >
                            <div
                              class="w-14 h-14 bg-white text-black rounded-[1.5rem] flex items-center justify-center shadow-2xl translate-y-4 group-hover:translate-y-0 transition-all duration-700"
                            >
                              <svg class="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24"
                                ><path d="M8 5v14l11-7z" /></svg
                              >
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
          {#if playlists.length === 0}
            <div
              class="col-span-full py-32 flex flex-col items-center justify-center text-[#B8C5D6] opacity-30"
            >
              <div
                class="w-24 h-24 mb-8 border-2 border-dashed border-white/20 rounded-[2.5rem] flex items-center justify-center"
              >
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  /></svg
                >
              </div>
              <p class="text-xl font-black uppercase tracking-[0.4em]">{$t('no_mixes')}</p>
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="h-full flex overflow-hidden" in:fade={{ duration: 300 }}>
        <div class="flex-1 flex flex-col min-w-0 border-r border-white/5">
          <header class="p-12 pb-8 shrink-0">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-4xl md:text-6xl font-black tracking-tighter text-white">
                  {selectedPlaylist.name}
                </h2>
                <div class="flex items-center gap-4 mt-6">
                  <span
                    class="px-3 py-1 bg-accent-primary/10 text-accent-primary rounded-lg text-[10px] font-black uppercase tracking-widest"
                  >
                    {currentTracks.length}
                    {$t('tracks_count')}
                  </span>
                  <span class="text-[10px] font-black text-white/30 uppercase tracking-widest">
                    {formatDuration(
                      currentTracks.reduce((a, b) => a + (b.track?.duration || 0), 0)
                    )}
                    {$t('total_label')}
                  </span>
                </div>
              </div>

              <div class="flex gap-4">
                <button
                  on:click={() => library.update((s) => ({ ...s, selectedPlaylist: null }))}
                  class="px-6 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all"
                  >{$t('close_btn')}</button
                >
                <button
                  on:click={() => playPlaylist(0)}
                  class="px-10 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] flex items-center gap-3"
                >
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"
                    ><path d="M8 5v14l11-7z" /></svg
                  >
                  {$t('play')}
                </button>
              </div>
            </div>
          </header>

          <div class="flex-1 flex flex-col min-h-0 px-12">
            {#if currentTracks.filter((t) => !t.isMissing).length > 0}
              <TrackList
                tracks={currentTracks.filter((t) => !t.isMissing)}
                trackPath={$playback.trackPath}
                isPlaying={$playback.isPlaying}
                onPlay={(track, idx) => playPlaylist(idx)}
                onDelete={(idx) => removeTrack(idx)}
                onRowClick={(track, idx) => {
                  selectedTrackIdx = idx
                  showFxPanel = true
                }}
                onOpenTransitionEditor={openTransitionEditor}
                mode="playlist"
              />
            {/if}

            {#if currentTracks.some((t) => t.isMissing)}
              <div class="mt-12 p-8 border border-white/5 bg-white/[0.02] rounded-3xl opacity-40">
                <span
                  class="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 block mb-4"
                  >{$t('hidden_tracks_label')}</span
                >
                <p class="text-xs text-white/60">
                  {$t('hidden_tracks_desc')}
                </p>
              </div>
            {/if}

            {#if currentTracks.filter((t) => !t.isMissing).length === 0}
              <div class="flex-1 flex flex-col items-center justify-center py-20">
                <div
                  class="w-20 h-20 mb-6 bg-white/5 rounded-full flex items-center justify-center"
                >
                  <svg
                    class="w-8 h-8 text-white/30"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M20 12H4M12 20V4"
                    /></svg
                  >
                </div>
                <h3 class="text-xl font-black tracking-tighter text-white mb-2">
                  {$t('empty_playlist')}
                </h3>
                <p class="text-[11px] text-white/40 font-black uppercase tracking-widest mb-8">
                  {$t('add_tracks_to_start')}
                </p>
                <button
                  on:click={() =>
                    library.update((s) => ({ ...s, activeTab: 'library', selectedPlaylist: null }))}
                  class="px-8 py-4 bg-white/10 hover:bg-accent-primary hover:text-black transition-all duration-300 rounded-full font-black uppercase tracking-widest text-[10px] flex items-center gap-3 border border-white/10 hover:border-transparent hover:scale-105 active:scale-95 shadow-xl group"
                >
                  <svg
                    class="w-4 h-4 text-white group-hover:text-black transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    /></svg
                  >
                  {$t('find_in_library')}
                </button>
              </div>
            {/if}
          </div>
        </div>

        {#if showFxPanel && selectedTrack}
          <div
            class="w-96 bg-[#03060E]/40 border-l border-white/5 p-12 flex flex-col gap-10"
            transition:fly={{ x: 30, duration: 400 }}
          >
            <div class="flex justify-between items-center">
              <span class="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]"
                >{$t('fx_settings_label')}</span
              >
              <button
                on:click={() => (showFxPanel = false)}
                class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-all"
                >✕</button
              >
            </div>

            <div class="text-center">
              <!-- Thumbnail with fallback -->
              <div
                class="w-32 h-32 bg-accent-primary/10 border border-accent-primary/20 rounded-[2.5rem] mx-auto mb-4 shadow-2xl overflow-hidden"
              >
                {#if selectedTrack.track?.thumbnail}
                  <img
                    src="media://local/{selectedTrack.track.thumbnail}"
                    alt=""
                    class="w-full h-full object-cover"
                  />
                {:else}
                  <div
                    class="w-full h-full flex items-center justify-center text-accent-primary/40"
                  >
                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                      /></svg
                    >
                  </div>
                {/if}
              </div>
              <h6 class="text-base font-black text-white px-2 truncate">
                {selectedTrack.track?.title || selectedTrack.track?.query || '—'}
              </h6>
              {#if selectedTrack.track?.bpm}
                <span
                  class="text-[10px] font-black text-accent-primary/70 uppercase tracking-widest"
                  >{Math.round(selectedTrack.track.bpm)} BPM</span
                >
              {/if}
            </div>

            <div class="space-y-12">
              <div class="space-y-4">
                <div
                  class="flex justify-between text-[11px] font-black uppercase tracking-widest text-white/40"
                >
                  <span>{$t('pitch_label')}</span>
                  <span class="text-accent-primary">{selectedTrack.pitch || 1.0}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={selectedTrack.pitch || 1.0}
                  on:input={(e) => updateTrackSetting('pitch', parseFloat(e.target.value))}
                  class="w-full accent-accent-primary"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-4">
                  <div class="text-[11px] font-black uppercase tracking-widest text-white/40">
                    {$t('reverb_label')}
                  </div>
                  <button
                    on:click={() => updateTrackSetting('reverb', !selectedTrack.reverb)}
                    class="w-full py-4 rounded-2xl border {selectedTrack.reverb
                      ? 'bg-accent-primary text-black border-accent-primary'
                      : 'border-white/10 text-white/40'} text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    {selectedTrack.reverb ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div class="space-y-4">
                  <div class="text-[11px] font-black uppercase tracking-widest text-white/40">
                    {$t('crossfade')}
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={selectedTrack.crossfade ?? $settings.crossfadeSeconds}
                    on:change={(e) => updateTrackSetting('crossfade', parseFloat(e.target.value))}
                    class="bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-[11px] font-black text-white w-full outline-none focus:border-accent-primary/40"
                  />
                </div>
              </div>

              <!-- Offset (Intro Skip) -->
              <div class="space-y-4">
                <div
                  class="flex justify-between text-[11px] font-black uppercase tracking-widest text-white/40"
                >
                  <span>Intro Skip</span>
                  <span class="text-accent-primary"
                    >{Math.round((selectedTrack.offset || 0) * 100) / 100}s</span
                  >
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="0.5"
                  value={selectedTrack.offset || 0}
                  on:input={(e) => updateTrackSetting('offset', parseFloat(e.target.value))}
                  class="w-full accent-accent-primary"
                />
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if editingTransition}
    <TransitionEditorModal
        trackA={editingTransition.trackA}
        trackB={editingTransition.trackB}
        initialOffset={editingTransition.initialOffset}
        initialDuration={editingTransition.initialDuration}
        initialCurve={editingTransition.initialCurve}
        on:save={(e) => saveTransition(e.detail)}
        on:close={() => editingTransition = null}
    />
  {/if}
</div>

<style>
  .discovery-card {
    border-radius: 2rem;
    padding: 2.5rem;
    background-size: cover;
    background-position: center;
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
  }
  .discovery-card:hover {
    transform: translateY(-8px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
  }

  .glass-noise {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Ffilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    background-size: 150px;
    background-blend-mode: overlay;
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
    outline: none;
  }
</style>
