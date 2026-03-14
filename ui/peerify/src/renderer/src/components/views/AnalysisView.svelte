<script>
  import { onMount, onDestroy } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import { t } from '../../lib/i18n'
  import { audioVisuals } from '../../lib/stores/playback'

  export let track = null
  export let isPlaying = false

  let canvas
  let animationId
  let time = 0

  // 6 осей для радара
  $: labels = [
    $t('sub_bass'),
    $t('mid_bass'),
    $t('low_mid'),
    $t('up_mid'),
    $t('highs'),
    $t('energy_rms')
  ]
  let targetData = [0, 0, 0, 0, 0, 0]
  let currentData = [0, 0, 0, 0, 0, 0]

  // Real-time data from stores
  $: ({ spectrum: rawSpectrum, audioLevel, kickLevel, bassLevel, vocalLevel } = $audioVisuals)

  // Interpolate 32-band to 64-band for visual density
  let spectrum64 = Array(64).fill(0)
  $: {
    if (rawSpectrum && rawSpectrum.length > 0) {
      for (let i = 0; i < 64; i++) {
        const rawIdx = Math.floor(i / 2)
        spectrum64[i] += (rawSpectrum[rawIdx] - spectrum64[i]) * 0.2
      }
    }
  }

  // Energy history for sparkline
  let energyHistory = Array(50).fill(0)
  $: if (isPlaying) {
    energyHistory = [...energyHistory.slice(1), audioLevel]
  }

  $: if (track && track.fingerprint && track.fingerprint.length >= 25) {
    const f = track.fingerprint

    // Данные уже идеально откалиброваны в C++ (от 0.0 до 1.0)
    targetData = [
      f[0], // Саб-бас (самая мощная частота)
      (f[1] + f[2] + f[3]) / 3, // Мид-бас
      (f[4] + f[5] + f[6] + f[7]) / 4, // Нижняя середина
      (f[8] + f[9] + f[10] + f[11] + f[12]) / 5, // Верхняя Середина
      //  ИСПРАВЛЕНИЕ: Теперь мы собираем все оставшиеся высокие частоты (с 13 до 23 корзины)
      (f[13] + f[14] + f[15] + f[16] + f[17] + f[18] + f[19] + f[20] + f[21] + f[22] + f[23]) / 11,
      f[24] // Общая Энергия (RMS)
    ]
  } else {
    targetData = [0, 0, 0, 0, 0, 0]
  }

  onMount(() => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      if (!canvas) return
      if (canvas.width !== canvas.offsetWidth) canvas.width = canvas.offsetWidth
      if (canvas.height !== canvas.offsetHeight) canvas.height = canvas.offsetHeight

      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2 + 10
      const radius = (Math.min(w, h) / 2) * 0.65

      ctx.clearRect(0, 0, w, h)

      // Плавная интерполяция данных (сглаживание движений)
      for (let i = 0; i < 6; i++) {
        currentData[i] += (targetData[i] - currentData[i]) * 0.1
      }

      // Анимация дыхания (пульс под музыку)
      time += isPlaying ? 0.05 : 0.01
      const pulse = isPlaying ? 1 + Math.sin(time) * 0.03 : 1

      // 1. Рисуем фоновую сетку (паутину)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      for (let level = 1; level <= 4; level++) {
        const r = radius * (level / 4)
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = ((Math.PI * 2) / 6) * i - Math.PI / 2
          const x = cx + Math.cos(angle) * r
          const y = cy + Math.sin(angle) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }

      // 2. Рисуем оси и текст
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (let i = 0; i < 6; i++) {
        const angle = ((Math.PI * 2) / 6) * i - Math.PI / 2

        // Линии осей
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
        ctx.stroke()

        // Текст
        const textDist = radius + 25
        const tx = cx + Math.cos(angle) * textDist
        const ty = cy + Math.sin(angle) * textDist
        ctx.fillStyle = i === 5 ? 'var(--accent-secondary)' : '#A7A7A7' // Выделяем Энергию цветом
        ctx.fillText(labels[i].toUpperCase(), tx, ty)
      }

      // 3. Рисуем сам радарный многоугольник трека
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = ((Math.PI * 2) / 6) * i - Math.PI / 2
        // Ограничиваем значение до 1.0, умножаем на пульс
        const val = Math.min(Math.max(currentData[i], 0.05), 1.0) * pulse
        const x = cx + Math.cos(angle) * (radius * val)
        const y = cy + Math.sin(angle) * (radius * val)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()

      // Градиент заливки
      const getCSSVar = (name, fallback) => {
        const val = getComputedStyle(canvas).getPropertyValue(name).trim()
        if (!val || val.startsWith('var')) return fallback
        return val
      }

      const accentPrimaryRGB = getCSSVar('--accent-primary-rgb', '0, 229, 255')
      const accentSecondaryRGB = getCSSVar('--accent-primary-rgb', '0, 136, 255')

      const accentPrimary = `rgb(${accentPrimaryRGB})`
      const accentPrimaryMid = `rgba(${accentPrimaryRGB}, 0.6)`
      const accentPrimaryDim = `rgba(${accentPrimaryRGB}, 0.2)`
      const accentSecondaryDim = `rgba(${accentSecondaryRGB}, 0.2)`

      const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius)
      gradient.addColorStop(0, accentPrimaryDim)
      gradient.addColorStop(1, accentSecondaryDim)

      ctx.fillStyle = gradient
      ctx.fill()

      // Неоновая обводка
      ctx.lineWidth = 2
      ctx.strokeStyle = accentPrimary
      ctx.shadowBlur = 15
      ctx.shadowColor = accentPrimary
      ctx.stroke()

      // Сброс теней
      ctx.shadowBlur = 0

      animationId = requestAnimationFrame(draw)
    }

    draw()
  })

  onDestroy(() => {
    if (animationId) cancelAnimationFrame(animationId)
  })
</script>

<div
  class="p-6 lg:p-10 h-full flex flex-col glass-container text-white overflow-hidden relative z-0"
>
  <div class="mb-8 z-10 shrink-0 relative flex justify-between items-end">
    <div>
      <h1 class="text-4xl lg:text-5xl font-black tracking-tighter mb-2 drop-shadow-md">
        {$t('spectral_analysis')}
      </h1>
      <p
        class="text-[11px] lg:text-[13px] text-[#B8C5D6] font-bold uppercase tracking-[0.4em] opacity-40"
      >
        {$t('studio_dashboard')}
      </p>
    </div>

    {#if isPlaying}
      <div
        class="px-4 py-2 bg-accent-primary/10 border border-accent-primary/20 rounded-xl flex items-center gap-3 animate-pulse"
        in:fade
      >
        <div
          class="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--accent-glow)]"
        ></div>
        <span class="text-[10px] font-black uppercase tracking-widest text-accent-primary"
          >{$t('live_data')}</span
        >
      </div>
    {/if}
  </div>

  {#if !track}
    <div
      class="flex-1 flex flex-col items-center justify-center text-[#B8C5D6] opacity-60 relative z-10"
      in:fade
    >
      <div
        class="w-24 h-24 bg-white/5 border border-white/10 rounded-3xl mb-8 flex items-center justify-center animate-pulse"
      >
        <svg class="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      </div>
      <p class="font-black tracking-[0.3em] uppercase text-sm">{$t('waiting_audio')}</p>
    </div>
  {:else}
    <div class="flex-1 grid grid-cols-12 gap-6 z-10 overflow-hidden pb-6">
      <!-- LEFT COLUMN: Track Info & Granular Metrics -->
      <div class="col-span-3 flex flex-col gap-6 overflow-y-auto mix-scrollbar pr-1">
        <!-- Track Card -->
        <div
          class="bg-black/20 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden shrink-0 group"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity"
          ></div>

          <div class="flex items-center gap-5 mb-6 relative z-10">
            <div
              class="w-14 h-14 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-2xl flex items-center justify-center shadow-[0_0_30px_var(--accent-glow)] border border-white/20"
            >
              <svg class="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 24 24"
                ><path d="M8 5v14l11-7z" /></svg
              >
            </div>
            <div class="min-w-0">
              <h2 class="text-xl font-black text-white truncate drop-shadow-md" title={track.query}>
                {track.query}
              </h2>
              <p
                class="text-[9px] font-black uppercase tracking-widest text-accent-primary drop-shadow-[0_0_5px_var(--accent-glow)]"
              >
                {track.genre || $t('genre_none_label')}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 relative z-10">
            <div class="bg-white/5 p-3 rounded-2xl border border-white/5">
              <span
                class="text-[8px] font-black uppercase tracking-widest text-[#B8C5D6] block mb-1"
                >{$t('tempo_label')}</span
              >
              <span class="text-lg font-black font-mono">{track.title.replace('BPM: ', '')}</span>
            </div>
            <div class="bg-white/5 p-3 rounded-2xl border border-white/5">
              <span
                class="text-[8px] font-black uppercase tracking-widest text-[#B8C5D6] block mb-1"
                >{$t('energy_label')}</span
              >
              <span class="text-lg font-black font-mono text-accent-primary"
                >{Math.round(currentData[5] * 100)}%</span
              >
            </div>
          </div>
        </div>

        <!-- Metric Meters -->
        <div
          class="bg-black/20 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/5 flex-1 flex flex-col gap-6"
        >
          <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-2">
            {$t('precision_metrics')}
          </h3>

          <div class="space-y-6">
            <!-- Kick Punch -->
            <div class="space-y-2">
              <div class="flex justify-between items-end">
                <span class="text-[9px] font-black uppercase tracking-widest text-white/60"
                  >{$t('kick_punch')}</span
                >
                <span class="text-[10px] font-bold font-mono text-accent-primary"
                  >{Math.round(kickLevel * 100)}</span
                >
              </div>
              <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent-primary transition-all duration-75 shadow-[0_0_10px_var(--accent-glow)]"
                  style="width: {Math.min(kickLevel * 100, 100)}%"
                ></div>
              </div>
            </div>

            <!-- Bass Texture -->
            <div class="space-y-2">
              <div class="flex justify-between items-end">
                <span class="text-[9px] font-black uppercase tracking-widest text-white/60"
                  >{$t('bass_texture')}</span
                >
                <span class="text-[10px] font-bold font-mono text-purple-400"
                  >{Math.round(bassLevel * 100)}</span
                >
              </div>
              <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent-secondary transition-all duration-100 shadow-[0_0_10px_var(--accent-glow)]"
                  style="width: {Math.min(bassLevel * 100, 100)}%"
                ></div>
              </div>
            </div>

            <!-- Vocal Clarity -->
            <div class="space-y-2">
              <div class="flex justify-between items-end">
                <span class="text-[9px] font-black uppercase tracking-widest text-white/60"
                  >{$t('vocal_range')}</span
                >
                <span class="text-[10px] font-bold font-mono text-accent-primary"
                  >{Math.round(vocalLevel * 100)}</span
                >
              </div>
              <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent-primary transition-all duration-100 shadow-[0_0_10px_var(--accent-glow)]"
                  style="width: {Math.min(vocalLevel * 100, 100)}%"
                ></div>
              </div>
            </div>
          </div>

          <!-- Energy Sparkline (Small) -->
          <div class="mt-auto pt-6 border-t border-white/5">
            <div class="flex justify-between items-center mb-3">
              <span class="text-[8px] font-black uppercase tracking-[0.3em] text-white/20"
                >{$t('energy_sparkline')}</span
              >
              <span class="text-[9px] font-black text-accent-primary"
                >{Math.round(audioLevel * 100)}%</span
              >
            </div>
            <div class="h-12 w-full flex items-end gap-[2px]">
              {#each energyHistory as val}
                <div
                  class="flex-1 bg-accent-primary/20 rounded-t-sm transition-all"
                  style="height: {val * 100}%; opacity: {0.3 + val}"
                ></div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- CENTER COLUMN: RADAR & WAVEFORM -->
      <div class="col-span-6 flex flex-col gap-6">
        <div
          class="flex-1 bg-black/40 backdrop-blur-3xl rounded-[3rem] border border-white/5 relative overflow-hidden flex items-center justify-center shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]"
        >
          <!-- Background Grid Decor -->
          <div
            class="absolute inset-0 opacity-10 pointer-events-none"
            style="background-image: radial-gradient(circle, var(--accent-primary) 1px, transparent 1px); background-size: 40px 40px;"
          ></div>
          <div
            class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"
          ></div>

          <canvas bind:this={canvas} class="w-full h-full relative z-10"></canvas>
        </div>

        <!-- Waveform Profile -->
        <div
          class="h-32 bg-black/20 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-6 flex flex-col"
        >
          <div class="flex justify-between items-center mb-4">
            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-white/30"
              >{$t('spectral_fingerprint')}</span
            >
            <div class="flex gap-2">
              <div
                class="px-2 py-0.5 rounded-md bg-white/5 text-[8px] font-black text-white/40 uppercase"
              >
                >{$t('transient_optimized')}
              </div>
              <div
                class="px-2 py-0.5 rounded-md bg-accent-primary/10 text-[8px] font-black text-accent-primary uppercase border border-accent-primary/20"
              >
                >{$t('phase_correct')}
              </div>
            </div>
          </div>
          <div class="flex-1 flex items-center gap-[3px]">
            {#if track.fingerprint}
              {#each track.fingerprint.slice(0, 80) as val, i}
                <div
                  class="flex-1 rounded-full transition-all duration-500"
                  style="height: {10 + val * 80}%; background: {i % 10 === 0
                    ? 'var(--accent-primary)'
                    : 'rgba(255,255,255,0.05)'};"
                ></div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: 64-BAND REALTIME SPECTRUM -->
      <div
        class="col-span-3 bg-black/30 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/5 flex flex-col"
      >
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">
            {$t('fft_band_analyzer')}
          </h3>
          <span class="text-[9px] font-black text-accent-primary animate-pulse"
            >{$t('live_60fps')}</span
          >
        </div>

        <div class="flex-1 flex items-end gap-[3px] overflow-hidden">
          {#each spectrum64 as val, i}
            <div class="flex-1 flex flex-col items-center gap-1 group">
              <!-- Visual Peak -->
              <div
                class="w-full rounded-t-sm transition-all duration-100 relative group-hover:brightness-150"
                style="
                  height: {Math.max(val * 100, 2)}%; 
                  background: linear-gradient(to top, var(--accent-primary), var(--accent-secondary));
                  box-shadow: 0 0 {val * 30}px var(--accent-glow);
                "
              >
                {#if i % 8 === 0}
                  <div
                    class="absolute -top-6 left-1/2 -translate-x-1/2 text-[7px] font-black text-white/20 uppercase rotate-90 origin-bottom-left whitespace-nowrap"
                  >
                    {Math.round(i * 300)}Hz
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="mt-8 pt-6 border-t border-white/5 flex flex-col gap-4">
          <div
            class="flex justify-between items-center text-[9px] font-black text-white/30 uppercase tracking-widest"
          >
            <span>{$t('dynamic_range')}</span>
            <span class="text-white/60">{$t('ultra_high')}</span>
          </div>
          <div
            class="flex justify-between items-center text-[9px] font-black text-white/30 uppercase tracking-widest"
          >
            <span>{$t('phase_correlation')}</span>
            <span class="text-accent-secondary">{$t('monitored')}</span>
          </div>
          <div
            class="flex justify-between items-center text-[9px] font-black text-white/30 uppercase tracking-widest"
          >
            <span>{$t('latency_compensation')}</span>
            <span class="text-white/60">{$t('active')}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .mix-scrollbar::-webkit-scrollbar {
    width: 2px;
  }
  .mix-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
  }
</style>
