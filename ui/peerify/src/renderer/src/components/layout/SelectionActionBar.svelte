<script>
  import { t } from '../../lib/i18n'
  import { fly, fade } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { selection } from '../../lib/stores/selection'
  import { library } from '../../lib/stores/library'
  import { libraryManager } from '../../lib/managers/LibraryManager'
  import { onMount, tick } from 'svelte'

  $: count = $selection.selectedTracks.length
  $: playlists = $library.playlists
  $: isPlaylistActive = !!$library.selectedPlaylist

  let showPlaylistPicker = false
  let showNamingInput = false
  let newName = ''
  let namingInputRef

  async function toggleNaming() {
    showNamingInput = !showNamingInput
    showPlaylistPicker = false
    if (showNamingInput) {
      newName = ''
      await tick()
      namingInputRef?.focus()
    }
  }

  async function handleCreate() {
    const finalName = newName.trim() || $t('new_playlist')
    if (await libraryManager.createPlaylistFromSelection($selection.selectedTracks, finalName)) {
      selection.clear()
      showNamingInput = false
      newName = ''
    }
  }

  async function addToPlaylist(playlist) {
    const existingPaths = new Set(playlist.tracks.map((t) => t.track?.filePath))
    const newItems = $selection.selectedTracks
      .filter((t) => !existingPaths.has(t.filePath))
      .map((t) => ({
        track: t,
        id: Date.now() + Math.random(),
        crossfade: 4,
        curve: 'equal',
        offset: 0
      }))

    const updatedTracks = [...playlist.tracks, ...newItems]

    if (await libraryManager.savePlaylist(playlist.name, updatedTracks)) {
      selection.clear()
      showPlaylistPicker = false
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') showNamingInput = false
  }
</script>

{#if count > 0}
  <div
    class="fixed bottom-32 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-4"
    transition:fly={{ y: 50, duration: 600, easing: quintOut }}
  >
    <!-- Counter Badge -->
    <div
      class="px-4 py-1.5 bg-accent-primary text-black rounded-full flex items-center gap-2 shadow-[0_10px_20px_var(--accent-glow)] ring-2 ring-black/20"
    >
      <span class="text-sm font-black leading-none">{count}</span>
      <span class="text-[9px] font-black uppercase tracking-widest opacity-60"
        >{$t('mixed_tracks_selected')}</span
      >
    </div>

    <!-- The Action Pill -->
    <div
      class="bg-[#0A0E1A]/90 backdrop-blur-3xl border border-white/10 rounded-full p-1.5 flex items-center gap-1.5 shadow-[0_40px_80px_rgba(0,0,0,0.8)] glass-noise"
    >
      {#if showNamingInput}
        <div
          class="flex items-center gap-2 px-4 py-1 animate-in slide-in-from-left-4 fade-in duration-300"
        >
          <input
            bind:this={namingInputRef}
            bind:value={newName}
            on:keydown={handleKeydown}
            placeholder={$t('playlist_name_placeholder')}
            class="bg-transparent border-none outline-none text-white font-bold text-[11px] uppercase tracking-widest w-48 placeholder-white/20"
          />
          <button
            on:click={handleCreate}
            class="px-4 py-1.5 bg-accent-primary text-black rounded-full font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
          >
            {$t('confirm_btn')}
          </button>
          <button
            on:click={() => (showNamingInput = false)}
            class="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>
      {:else}
        {#if !isPlaylistActive}
          <button
            on:click={toggleNaming}
            class="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-accent-primary hover:text-black rounded-full transition-all group"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="3"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span class="text-[10px] font-black uppercase tracking-[0.2em]"
              >{$t('create_mix_btn')}</span
            >
          </button>

          <div class="w-[1px] h-6 bg-white/10 mx-1"></div>
        {/if}

        <div class="relative">
          <button
            on:click={() => {
              showPlaylistPicker = !showPlaylistPicker
              showNamingInput = false
            }}
            class="flex items-center gap-2 px-6 py-3 {showPlaylistPicker
              ? 'bg-accent-primary text-black'
              : 'bg-white/5 text-white/40'} hover:bg-white/10 hover:text-white rounded-full transition-all"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="3"
                d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-[10px] font-black uppercase tracking-[0.2em]"
              >{$t('add_to_mix_btn')}</span
            >
          </button>

          {#if showPlaylistPicker}
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 w-64 bg-[#0A0E1A]/95 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.9)] overflow-hidden"
              transition:fly={{ y: 10, duration: 400, easing: quintOut }}
            >
              <div
                class="px-6 py-4 border-b border-white/5 bg-white/5 flex justify-between items-center"
              >
                <span class="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]"
                  >{$t('select_collection')}</span
                >
                <button
                  on:click={toggleNaming}
                  class="text-[9px] font-black text-accent-primary hover:underline">NEW</button
                >
              </div>
              <div class="max-h-72 overflow-y-auto custom-scrollbar-mini">
                {#each playlists as p}
                  <button
                    on:click={() => addToPlaylist(p)}
                    class="w-full px-6 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-white/40 hover:bg-accent-primary hover:text-black transition-all border-b border-white/5 last:border-0 truncate"
                  >
                    {p.name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <button
          on:click={() => libraryManager.handleDeleteMultiple($selection.selectedTracks)}
          class="w-10 h-10 flex items-center justify-center text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all ml-1"
          title={$t('remove_selected')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 2 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>

        <button
          on:click={selection.clear}
          class="w-10 h-10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 rounded-full transition-all ml-1"
          title={$t('cancel')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .glass-noise {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Ffilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    background-size: 150px;
    background-blend-mode: overlay;
  }

  .custom-scrollbar-mini::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar-mini::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar-mini::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
</style>
