<script>
  import { contextMenu, closeContextMenu } from '../../lib/stores/ui'
  import { t } from '../../lib/i18n'
  import { library } from '../../lib/stores/library'
  import { libraryManager } from '../../lib/managers/LibraryManager'
  import { fly, fade } from 'svelte/transition'
  import { tick } from 'svelte'
  import { selection } from '../../lib/stores/selection'

  $: ({ show, x, y, track, mode, playlistItemIdx } = $contextMenu)
  $: isTrackSelected = track && $selection.selectedTracks.some((t) => t.filePath === track.filePath)
  $: actingTracks = isTrackSelected ? $selection.selectedTracks : track ? [track] : []

  let menuElement
  let showNamingInput = false
  let newName = ''
  let adjustedX = 0
  let adjustedY = 0

  $: if (show) {
    showNamingInput = false
    newName = ''
    tick().then(adjustPosition)
  }

  async function adjustPosition() {
    if (!menuElement) return
    const rect = menuElement.getBoundingClientRect()
    const padding = 10

    adjustedX = x
    adjustedY = y

    if (x + rect.width + padding > window.innerWidth) {
      adjustedX = window.innerWidth - rect.width - padding
    }
    if (y + rect.height + padding > window.innerHeight) {
      adjustedY = window.innerHeight - rect.height - padding
    }
  }

  function startNaming(e) {
    if (e) e.stopPropagation()
    showNamingInput = true
    newName = ''
  }

  async function handleCreate(e) {
    if (e) e.stopPropagation()
    const finalName = newName.trim() || $t('new_playlist')
    if (actingTracks.length > 0) {
      await libraryManager.createPlaylistFromSelection(actingTracks, finalName)
      selection.clear()
    }
    closeContextMenu()
  }

  async function addToExisting(playlist) {
    closeContextMenu()
    // Don't add duplicates
    const existingPaths = new Set(playlist.tracks.map((t) => t.track?.filePath))
    const newItems = actingTracks
      .filter((t) => !existingPaths.has(t.filePath))
      .map((t) => ({
        track: t,
        id: Date.now() + Math.random(),
        pitch: 1.0,
        reverb: false,
        crossfade: 4
      }))

    if (newItems.length > 0) {
      const updatedTracks = [...playlist.tracks, ...newItems]
      await libraryManager.savePlaylist(playlist.name, updatedTracks)
      selection.clear()
    }
  }

  function handleInputKeydown(e) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') closeContextMenu()
  }

  function focusOnMount(node) {
    node.focus()
  }

  // Handle global click to close
  function handleGlobalClick(e) {
    if (show && menuElement && !menuElement.contains(e.target)) {
      closeContextMenu()
    }
  }
</script>

<svelte:window
  on:mousedown={handleGlobalClick}
  on:keydown={(e) => (e.key === 'Escape' || e.key === 'Tab') && closeContextMenu()}
/>

{#if show}
  <div
    bind:this={menuElement}
    role="menu"
    tabindex="-1"
    class="fixed z-[100000] bg-[#0D111D]/90 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden w-64 ring-1 ring-white/5 backdrop-blur-3xl p-1.5"
    style="left: {adjustedX}px; top: {adjustedY}px;"
    on:mousedown|stopPropagation
    on:contextmenu|preventDefault|stopPropagation
    in:fly={{ y: 8, duration: 250, easing: (t) => t * (2 - t) }}
    out:fade={{ duration: 150 }}
  >
    <!-- Play Action -->
    <button
      class="w-full px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all flex items-center gap-3 rounded-xl group/item"
      on:click={() => {
        closeContextMenu()
        document.body.dispatchEvent(
          new CustomEvent('playTrack', { detail: { track, index: playlistItemIdx } })
        )
      }}
    >
      <div
        class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover/item:bg-accent-primary group-hover/item:text-black transition-all duration-300"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg
        >
      </div>
      {$t('play')}
    </button>

    <!-- Add to Queue -->
    <button
      class="w-full px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-white/50 hover:bg-white/10 hover:text-white transition-all flex items-center gap-3 rounded-xl group/item"
      on:click={() => {
        closeContextMenu()
        document.body.dispatchEvent(new CustomEvent('addToQueue', { detail: { track } }))
      }}
    >
      <div
        class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover/item:bg-accent-primary group-hover/item:text-black transition-all duration-300"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M12 4v16m8-8H4"
          /></svg
        >
      </div>
      {$t('add_to_queue')}
    </button>

    <button
      class="w-full px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-red-500/50 hover:bg-red-500/10 hover:text-red-500 transition-all flex items-center gap-3 rounded-xl group/item"
      on:click={() => {
        closeContextMenu()
        libraryManager.handleDeleteMultiple(actingTracks)
      }}
    >
      <div
        class="w-8 h-8 rounded-lg bg-red-500/5 flex items-center justify-center group-hover/item:bg-red-500 group-hover/item:text-white transition-all duration-300"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 2 0 00-1 1v3M4 7h16"
          />
        </svg>
      </div>
      {actingTracks.length > 1 ? $t('remove_selected') : $t('remove_from_lib')}
    </button>

    <div class="h-[1px] bg-white/5 my-1 mx-2"></div>

    {#if mode !== 'playlist'}
      {#if showNamingInput}
        <div
          class="px-4 py-3 flex flex-col gap-2 bg-white/5 mx-2 rounded-lg border border-white/5 my-2"
        >
          <input
            bind:value={newName}
            on:keydown={handleInputKeydown}
            on:click|stopPropagation
            placeholder={$t('playlist_name_placeholder')}
            class="bg-transparent border-none outline-none text-white font-bold text-[10px] uppercase tracking-widest w-full placeholder-white/20"
            use:focusOnMount
          />
          <div class="flex gap-2 mt-1">
            <button
              on:click={handleCreate}
              class="flex-1 py-2 bg-accent-primary text-black rounded-md font-black text-[9px] uppercase tracking-widest hover:brightness-110 transition-all"
            >
              {$t('confirm_btn')}
            </button>
            <button
              on:click={() => (showNamingInput = false)}
              class="px-3 py-2 bg-white/5 text-white/40 rounded-md font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              ✕
            </button>
          </div>
        </div>
      {:else}
        <button
          class="w-full px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-white/50 hover:bg-white/5 hover:text-white transition-all flex items-center gap-3 group/item border-l-2 border-transparent hover:border-accent-primary"
          on:click={startNaming}
        >
          <div
            class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover/item:bg-accent-primary/20 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              /></svg
            >
          </div>
          {$t('create_playlist')}
        </button>
      {/if}
    {/if}

    {#if $library.playlists.length > 0}
      <div class="px-4 py-2 mt-2 text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">
        {$t('add_to_playlist')}
      </div>
      <div class="max-h-48 overflow-y-auto custom-scrollbar">
        {#each $library.playlists as p}
          <button
            class="w-full px-6 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white transition-all truncate border-l-2 border-transparent hover:border-accent-primary/40"
            on:click={() => addToExisting(p)}
          >
            {p.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
