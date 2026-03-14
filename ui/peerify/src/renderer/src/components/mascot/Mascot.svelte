<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { t } from '../../lib/i18n'
  import { MascotPhysicsExtended } from '../../lib/MascotPhysics.ts'
  import { BeatDetector } from '../../lib/BeatDetector.ts'
  import MascotBody from './MascotBody.svelte'
  import MascotUI from './MascotUI.svelte'
  import { activeLyricLine } from '../../lib/LyricsManager'

  // Default skin assets
  import chillMascot from '../../assets/chill.png'
  import drumMascot from '../../assets/drum.png'
  import autodjMascot from '../../assets/autodj.png'
  import gotovnostMascot from '../../assets/gotovnost.png'
  import scanMascot from '../../assets/scan.png'

  // Gubby skin assets
  import gubbyIdle from '../../assets/gubby/gubby_idle.png'
  import gubbyMixing from '../../assets/gubby/gobby_mix_2.png'
  import gubbyBeat1 from '../../assets/gubby/gobby_1.png'
  import gubbyBeat2 from '../../assets/gubby/gubby_2.png'

  // Slowed skin assets
  import slowedIdle from '../../assets/slowed/idle.png'
  import slowedMixing from '../../assets/slowed/mixing.png'
  import slowedDance1 from '../../assets/slowed/slowed_dance1.png'
  import slowedDance2 from '../../assets/slowed/slowed_dance_2.png'
  import slowedDance3 from '../../assets/slowed/slowed_dance_3.png'

  interface SkinData {
    scan?: string
    autodj?: string
    ready?: string
    drum?: string
    chill?: string
    slowedIdle?: string
    slowedMixing?: string
    slowedDance1?: string
    slowedDance2?: string
    slowedDance3?: string
  }

  export let announcement: string = ''
  export let onSensitivityChange: (val: number) => void = () => {}

  import { audioVisuals, playback, playbackProgress } from '../../lib/stores/playback'
  import { settings as settingsStore } from '../../lib/stores/settings'
  import { library } from '../../lib/stores/library'
  import { isModalOpen } from '../../lib/stores/ui'

  $: ({ audioLevel, kickLevel, bassLevel, vocalLevel } = $audioVisuals)
  $: ({ isPlaying, isCrossfading: isMixingZone, activeEffect, drop_pos } = $playback)
  $: isNearDrop =
    isPlaying &&
    drop_pos > 0 &&
    Math.abs($playbackProgress.value - drop_pos) < 0.2
  $: ({ isScanning } = $library)
  $: hideDueToModal = $isModalOpen
  $: ({
    mascotSkin,
    mascotCustomSkin: customSkin,
    showMascotName,
    mascotRipple: rippleIntensity,
    mascotSensitivity,
    mascotBlur: blurIntensity,
    mascotAberration: aberrationIntensity,
    mascotGhosts: ghostIntensity,
    mascotScale,
    mascotProfaneMode,
    mascotLyricsMode,
    performanceProfile
  } = $settingsStore)

  $: isSlowed = ['slowed', 'super_slowed', 'slowed_reverb'].includes(activeEffect)
  $: skin = isSlowed && mascotSkin !== 'gubby' ? activeEffect : mascotSkin

  $: mascotDisplayName = mascotSkin === 'gubby' ? 'Gubby' : 'Yuki'

  const physics = new MascotPhysicsExtended()
  const beatDetector = new BeatDetector()

  function handleSensitivityInput(e: Event) {
    onSensitivityChange(parseFloat((e.target as HTMLInputElement).value))
  }

  let x = 0,
    y = 0,
    scale = 0.82 * mascotScale
  let rotation = 0
  let isBeat = false

  // Object Pooling for Ghost Trails (REDUCED FOR PERFORMANCE)
  const MAX_TRAILS = 8
  let trailPoints = Array(MAX_TRAILS)
    .fill(0)
    .map((_, i) => ({
      id: i,
      x: 0,
      y: 0,
      jump: 0,
      tilt: 0,
      opacity: 0,
      texture: '',
      velocityX: 0,
      velocityY: 0,
      skinType: 'default',
      isSlowedEffect: false,
      active: false
    }))
  let trailIndex = 0

  let frame

  let isDragging = false
  let dragOffset = { x: 0, y: 0 }
  let isHovered = false
  let time = 0
  let currentMascotTexture = ''

  const fixPath = (p) => {
    if (!p) return null
    if (typeof p !== 'string') return p
    if (
      p.startsWith('http') ||
      p.startsWith('data:') ||
      p.startsWith('media:') ||
      p.startsWith('/')
    )
      return p
    const encodedPath = encodeURIComponent(p.replace(/\\/g, '/'))
    return `media://local/${encodedPath}`
  }

  let lSway = 0
  let tiltDir = 1

  let isBeatHit = false
  let smoothedEnergy = 0
  let mood = 0 // 0 to 1 (chill to hyper)
  let moodColor = 'cyan'
  let sensitivity = 1.15 // Internal multiplier base
  let lastHitTime = 0
  let danceFrameIndex = 0
  let lastMascotTexture = ''

  let jumpOffset = 0
  let tiltAngle = 0
  let warpScale = 1.0
  let smoothedVocals = 0
  let lastPhysicsTimeState = 0 // FOR THROTTLING

  $: if (mascotLyricsMode) {
    announcement = $activeLyricLine
  }

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  const imageCache = new Map()

  const profaneWords = ['blyat', 'ebaat', 'ahuet', 'nihuya', 'abas', 'zaibis', 'nifiga']

  let profanityTimeout: NodeJS.Timeout | null = null
  let lastUpdateTime = 0
  const THROTTLE_MS = 33 // ~30fps

  function drawTrails() {
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (ghostIntensity <= 0 || performanceProfile === 'low' || performanceProfile === 'potato')
      return

    for (let i = 0; i < MAX_TRAILS; i++) {
      const t = trailPoints[i]
      if (!t.active || t.opacity < 0.05) continue

      let img = imageCache.get(t.texture)
      if (!img) {
        img = new Image()
        img.src = t.texture
        imageCache.set(t.texture, img)
      }

      if (img.complete) {
        ctx.save()
        const s = scale * mascotScale

        // Per-skin Ghost Styles
        if (t.skinType === 'gubby') {
          // Gooby: Source-over, shaky, low opacity
          // Even if slowed/mixing, Gooby stays "drawn"
          ctx.globalAlpha = t.opacity * 0.4
          ctx.globalCompositeOperation = 'source-over'

          // Random jitter for "sketchy" look
          const jx = (Math.random() - 0.5) * 4
          const jy = (Math.random() - 0.5) * 4
          ctx.translate(t.x + jx, t.y - t.jump + jy)

          // If it was a slowed gubby, add a tiny bit of blur but NO color shift
          if (t.isSlowedEffect) {
            // ctx.filter is slow, using lower opacity instead
            ctx.globalAlpha = t.opacity * 0.25
          }
        } else if (
          t.skinType === 'slowed' ||
          t.skinType === 'super_slowed' ||
          t.skinType === 'slowed_reverb'
        ) {
          // Slowed (Yuki): Screen, purple tint, high blur
          ctx.globalAlpha = t.opacity * 0.8
          ctx.globalCompositeOperation = 'screen'
          // Removed ctx.filter (hue-rotate/blur) as it's very slow
          ctx.translate(t.x, t.y - t.jump)
        } else {
          // Default (Yuki): Screen, cyan tint
          ctx.globalAlpha = t.opacity * 0.6
          ctx.globalCompositeOperation = 'screen'
          // Removed ctx.filter
          ctx.translate(t.x, t.y - t.jump)
        }

        ctx.rotate((t.tilt * Math.PI) / 180)
        ctx.scale(s, s)
        ctx.drawImage(img, -128, -128, 256, 256)
        ctx.restore()
      }
    }
  }

  $: if (!isPlaying) {
    smoothedVocals = 0
    kickLevel = 0
    bassLevel = 0
    vocalLevel = 0
  }

  // themeColor calculation
  $: themeColor =
    mascotSkin === 'gubby'
      ? '#ffffff'
      : isSlowed
        ? '#B900FF'
        : customSkin.ready
          ? '#00E5FF'
          : 'var(--accent-primary)'

  function startDrag(e) {
    if (e.button !== 0) return
    isDragging = true
    dragOffset = { x: e.clientX - x, y: e.clientY - y }
    window.addEventListener('mousemove', handleDrag)
    window.addEventListener('mouseup', stopDrag)
  }

  function handleDrag(e) {
    if (isDragging) {
      physics.pos = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
      physics.target = { ...physics.pos }
    }
  }

  function stopDrag() {
    isDragging = false
    window.removeEventListener('mousemove', handleDrag)
    window.removeEventListener('mouseup', stopDrag)
    localStorage.setItem('peerify_mascot_pos', JSON.stringify(physics.pos))
  }

  let lastTrailTime = 0
  const TRAIL_INTERVAL = 60 // ~16fps for trails (increased interval)

  function animate() {
    const now = performance.now()
    frame = requestAnimationFrame(animate)

    // Limit logic and rendering to 30fps
    if (now - lastUpdateTime < THROTTLE_MS) return
    lastUpdateTime = now

    // 0. Update Texture Reference FIRST (so trails use the current frame's asset)
    if (isMixingZone) {
      currentMascotTexture =
        fixPath(
          isSlowed && mascotSkin !== 'gubby'
            ? customSkin.slowedMixing
            : mascotSkin === 'gubby'
              ? customSkin.autodj || gubbyMixing
              : customSkin.autodj
        ) || (mascotSkin === 'gubby' ? gubbyMixing : isSlowed ? slowedMixing : autodjMascot)
    } else if (isScanning) {
      currentMascotTexture = fixPath(customSkin.scan) || scanMascot
    } else if (isPlaying) {
      if (isSlowed && mascotSkin !== 'gubby') {
        currentMascotTexture =
          fixPath(
            [customSkin.slowedDance1, customSkin.slowedDance2, customSkin.slowedDance3][
              danceFrameIndex
            ]
          ) || [slowedDance1, slowedDance2, slowedDance3][danceFrameIndex]
      } else {
        if (mascotSkin === 'gubby') {
          currentMascotTexture = isBeatHit
            ? fixPath(customSkin.drum) || gubbyBeat2
            : fixPath(customSkin.ready) || gubbyBeat1
        } else {
          currentMascotTexture = isBeatHit
            ? fixPath(customSkin.drum) || drumMascot
            : fixPath(customSkin.ready) || gotovnostMascot
        }
      }
    } else {
      currentMascotTexture =
        fixPath(
          isSlowed && mascotSkin !== 'gubby'
            ? customSkin.slowedIdle
            : mascotSkin === 'gubby'
              ? customSkin.chill || gubbyIdle
              : customSkin.chill
        ) || (mascotSkin === 'gubby' ? gubbyIdle : isSlowed ? slowedIdle : chillMascot)
    }

    // 1. Mouse Follow (only if not dragging)
    if (!isDragging) {
      physics.target = { ...physics.pos }
    }

    if (!isPlaying) {
      audioLevel = 0
      smoothedEnergy *= 0.8
      if (smoothedEnergy < 0.01) smoothedEnergy = 0
    }

    const beatThreshold = 0.18
    const currentAudioLevel = isPlaying ? audioLevel : 0
    const finalSensitivity = (mascotSensitivity || 1.0) * sensitivity

    // 1. Improved Beat Detection
    if (beatDetector.process(kickLevel, finalSensitivity) && isPlaying) {
      isBeatHit = true
      lastHitTime = now
      tiltDir *= -1
      danceFrameIndex = (danceFrameIndex + 1) % 3

      // Dynamic jump height based on beat energy
      const energy = beatDetector.getEnergyFactor()
      physics.jump.vel = Math.min(10 + energy * 4, 22)

      // Profanity (Only if lyrics mode is OFF)
      if (mascotProfaneMode && !mascotLyricsMode) {
        announcement = profaneWords[Math.floor(Math.random() * profaneWords.length)]
        if (profanityTimeout) clearTimeout(profanityTimeout)
        profanityTimeout = setTimeout(() => {
          announcement = ''
        }, 400)
      }

      setTimeout(() => (isBeatHit = false), 120)
    }

    isBeat = isBeatHit // Drive visual swap state
    smoothedEnergy += (kickLevel - smoothedEnergy) * 0.25
    smoothedVocals += ((isPlaying ? vocalLevel : 0) - smoothedVocals) * 0.15 // Smoother transition for glow

    // Hard cutoff for glow persistence
    if (smoothedVocals < 0.005) smoothedVocals = 0

    // 2. Mood & Energy Calculation
    const currentBpm = beatDetector.getEstimatedBpm()
    const bpmFactor = Math.min(Math.max((currentBpm - 80) / 80, 0), 1)
    const energyFactor = Math.min(smoothedEnergy * 2.0, 1.0)

    // Smoothly interpolate mood
    const targetMood = isPlaying ? bpmFactor * 0.4 + energyFactor * 0.6 : 0
    mood += (targetMood - mood) * 0.05

    // Determine mood color (Cyan -> Purple -> Pink)
    const hueShift = mood * 120 // 0 to 120 deg shift
    moodColor = mascotSkin === 'gubby' ? '#ffffff' : `hsl(${180 + hueShift}, 100%, 65%)`

    // 3. Update Springs with Stem Detail (THROTTLED TO 30fps)
    if (now - lastPhysicsTimeState > 32) {
      lastPhysicsTimeState = now

      const k = kickLevel > 0.08 ? kickLevel : 0
      const b = bassLevel > 0.05 ? bassLevel : 0
      const v = vocalLevel > 0.05 ? vocalLevel : 0

      // Jumps higher on kick, squashes more on bass, tilts on vocals
      const jumpBase = isPlaying ? Math.min(k * sensitivity * 140, 130) : 0
      physics.jump.target = jumpBase * (mascotSensitivity || 1.0)

      const tiltBase = isPlaying ? (audioLevel * 10 + v * 30) * tiltDir : 0
      physics.tilt.target = tiltBase * (mascotSensitivity || 1.0)

      const squashBase = isPlaying ? b * 0.7 + k * 0.3 : 0
      physics.squash.target = squashBase * (mascotSensitivity || 1.0)

      physics.update()
    }

    // 4. Liquid Sway (Slowed mode)
    if (isSlowed && isPlaying) {
      lSway = Math.sin(now / 800) * 12
    } else {
      lSway = 0
    }

    // 5. Final Transforms
    x = physics.pos.x
    y = physics.pos.y

    jumpOffset = physics.jump.value
    tiltAngle = physics.tilt.value
    warpScale = isBeatHit ? (isSlowed ? 1.04 : 1.1) : 1.0

    // We pass these to MascotBody for rendering
    // scaleX = (0.82 * mascotScale) + squashX, scaleY = (0.82 * mascotScale) - squashY
    // translateY = -jumpOffset
    // rotate = tiltAngle + lSway * 0.2

    // 6. Ghosts (Motion Trails & Texture Swap Persistence)
    const isTextureSwap = currentMascotTexture !== lastMascotTexture
    const shouldUpdateTrails = now - lastTrailTime >= TRAIL_INTERVAL || isTextureSwap

    if (shouldUpdateTrails) {
      lastTrailTime = now

      const spawnGhost = (op, vx = 0, vy = 0) => {
        const g = trailPoints[trailIndex]
        g.x = x
        g.y = y
        g.jump = jumpOffset
        g.tilt = tiltAngle
        g.opacity = op
        g.texture = currentMascotTexture
        g.velocityX = vx
        g.velocityY = vy
        g.skinType = skin // This reactive variable already correctly handles gubby override
        g.isSlowedEffect = isSlowed
        g.active = true
        trailIndex = (trailIndex + 1) % MAX_TRAILS
      }

      if (isTextureSwap) {
        spawnGhost(0.8 * ghostIntensity)
        lastMascotTexture = currentMascotTexture
      }

      if (
        isPlaying &&
        (isSlowed || isMixingZone || Math.abs(physics.vel.x) > 5 || Math.abs(physics.vel.y) > 5)
      ) {
        const energyMultiplier = isMixingZone ? 1.5 : isSlowed ? 1.2 : 0.8
        const moveEnergy = (Math.abs(physics.vel.x) + Math.abs(physics.vel.y)) / 20
        const ghostThreshold =
          1.0 - (ghostIntensity * energyMultiplier * (isBeatHit ? 0.8 : 0.4) + moveEnergy)

        if (Math.random() > ghostThreshold) {
          spawnGhost(
            0.15 + ghostIntensity * energyMultiplier * 0.4,
            physics.vel.x,
            physics.vel.y - physics.jump.vel
          )
        }
      }

      // Decay opacity and update state in-place
      const decay = 0.75 + ghostIntensity * 0.1 // Faster decay for fewer overlaps
      for (let i = 0; i < MAX_TRAILS; i++) {
        const g = trailPoints[i]
        if (!g.active) continue

        g.opacity *= decay
        if (g.opacity < 0.05) {
          g.active = false
          g.opacity = 0
        }
      }

      if (performanceProfile !== 'low' && performanceProfile !== 'potato') {
        // Trigger Svelte reactivity by re-assigning the same array reference
        trailPoints = trailPoints
      }
    }

    if (performanceProfile !== 'low' && performanceProfile !== 'potato') {
      drawTrails()
    } else if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  function handleResize() {
    if (canvas) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
  }

  onMount(() => {
    ctx = canvas.getContext('2d')
    window.addEventListener('resize', handleResize)

    const savedPos = localStorage.getItem('peerify_mascot_pos')
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos)
        if (pos.x < 0 || pos.x > window.innerWidth || pos.y < 0 || pos.y > window.innerHeight) {
          physics.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        } else {
          physics.pos = pos
        }
      } catch (e) {
        physics.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      }
    } else {
      physics.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }
    frame = requestAnimationFrame(animate)
  })

  onDestroy(() => {
    window.removeEventListener('resize', handleResize)
    cancelAnimationFrame(frame)
  })
</script>

<!-- SVG Filters for Waves & Distortion -->
<svg class="absolute w-0 h-0 overflow-hidden pointer-events-none">
  <defs>
    <filter id="mascot-shadow-filter">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
    </filter>
  </defs>
</svg>

{#if !hideDueToModal}
  <div
    class="fixed inset-0 pointer-events-none z-[250] overflow-hidden"
    on:mouseenter={() => (isHovered = true)}
    on:mouseleave={() => (isHovered = false)}
    role="none"
  >
    <!-- High-Performance Canvas Trails -->
    <canvas
      bind:this={canvas}
      width={window.innerWidth}
      height={window.innerHeight}
      class="absolute inset-0 pointer-events-none"
      style="filter: blur({performanceProfile === 'low' || performanceProfile === 'potato'
        ? 0
        : blurIntensity * 1.5}px) brightness(1.2); opacity: {performanceProfile === 'low' ||
      performanceProfile === 'potato'
        ? 0
        : 1};"
    ></canvas>

    <!-- Hitbox & Main Body -->
    <div
      class="absolute pointer-events-auto cursor-grab active:cursor-grabbing"
      style="
      left: {x}px; top: {y}px; width: 256px; height: 256px;
      transform-origin: bottom center;
      transform: 
        scaleX({0.82 * mascotScale + physics.squash.value * 1.1}) 
        scaleY({0.82 * mascotScale - physics.squash.value * 0.9}) 
        translateY({isPlaying ? -physics.jump.value : 0}px)
        translateX({lSway}px)
        rotate({physics.tilt.value + lSway * 0.2}deg)
        scale({warpScale});
      z-index: 102;
    "
      on:mousedown={startDrag}
      role="button"
      tabindex="0"
      aria-label={$t('drag_mascot')}
    >
      {#if performanceProfile !== 'low' && performanceProfile !== 'potato'}
        <!-- NEW: Beat-Synced Dynamic Shadow -->
        <div
          class="absolute left-1/2 bottom-[-10px] w-40 h-8 -translate-x-1/2 blur-lg pointer-events-none transition-all duration-75"
          style="
              background: rgba(0,0,0, {0.3 + kickLevel * 0.4});
              transform: translateX(-50%) scale({0.8 + kickLevel * 0.5});
              filter: blur({8 + kickLevel * 10}px);
          "
        ></div>
      {/if}

      <!-- CSS Reactive Glow Fallback (Improved Vibrancy) -->
      <div
        class="absolute inset-0 rounded-full pointer-events-none transition-opacity duration-75"
        style="
        background: radial-gradient(circle, {themeColor}dd 0%, transparent 70%);
        opacity: {performanceProfile === 'low' || performanceProfile === 'potato'
          ? 0
          : smoothedVocals * (isSlowed ? 2.0 : 1.5) +
            (isBeat ? 0.6 : 0) +
            (isMixingZone ? 0.3 : 0)};
        transform: scale({(isSlowed ? 1.4 : 1.2) +
          smoothedVocals * 0.8 +
          (isBeat ? 0.4 : 0) +
          (isMixingZone ? 0.2 : 0)});
        filter: blur({(isSlowed ? 30 : 20) + smoothedVocals * 30 + (isBeat ? 15 : 0)}px);
        mix-blend-mode: screen;
      "
      ></div>

      <MascotBody
        {isBeat}
        {isPlaying}
        {isScanning}
        {isMixingZone}
        {skin}
        {customSkin}
        {isSlowed}
        energy={smoothedEnergy}
        {danceFrameIndex}
        {blurIntensity}
        {aberrationIntensity}
        velocityX={physics.vel.x}
        velocityY={physics.vel.y - physics.jump.vel}
        glowColor={moodColor}
        glowIntensity={0.2 + mood * 0.8 + smoothedVocals * 1.2}
        style="filter: hue-rotate({mood * 120}deg);"
      />
    </div>

    <MascotUI
      {x}
      {y}
      {showMascotName}
      {isHovered}
      {announcement}
      {activeEffect}
      {themeColor}
      skin={mascotSkin}
      name={mascotDisplayName}
      isLyrics={mascotLyricsMode}
      energy={smoothedEnergy}
      vocals={smoothedVocals}
      {isNearDrop}
    />
  </div>
{/if}
