<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import { t } from '../../lib/i18n'
  import TransportBar from './mix/TransportBar.svelte'
  import Timeline from './mix/Timeline.svelte'
  import TrackLane from './mix/TrackLane.svelte'
  import AutomationEditor from './mix/AutomationEditor.svelte'

  const dispatch = createEventDispatcher()

  export let initialTrack1 = ''
  export let initialTrack2 = ''

  // Track state
  let track1 = {
    id: 0,
    name: $t('track_outgoing'),
    filepath: '',
    duration: 0,
    isPlayingInternal: false,
    color: 'var(--accent-primary)',
    waveform: [],
    meta: null
  }
  let track2 = {
    id: 1,
    name: $t('track_incoming'),
    filepath: '',
    duration: 0,
    offset: 0,
    isPlayingInternal: false,
    color: '#B900FF',
    waveform: [],
    meta: null
  }

  let isPlaying = false
  let playheadTime = 0
  let zoom = 100
  let updater
  let scrollContainer

  let crossfadeDuration = 4.0
  let preListenSeconds = 3.0
  let isDraggingTrack2 = false
  let dragStartX = 0
  let dragStartOffset = 0
  let isSnapped = false

  export let curveType = 'equal'
  export let isVisible = false
  let curveHandle = { cx: 25, cy: 10 }
  let isDraggingHandle = false
  let handleDragSvgRect = null

  let eqTrack1 = false
  let eqTrack2 = false
  let isAiAutomationEnabled = true
  let isTempoSyncEnabled = false

  let customVolT1 = [
    { t: 0, v: 1 },
    { t: 1, v: 0 }
  ]
  let customVolT2 = [
    { t: 0, v: 0 },
    { t: 1, v: 1 }
  ]
  let customEqT1 = [
    { t: 0, v: 1 },
    { t: 1, v: 1 }
  ]
  let customEqT2 = [
    { t: 0, v: 0 },
    { t: 1, v: 1 }
  ]

  let draggingPointIdx = -1
  let draggingCurveId = ''
  let editingLane = 'volume'
  let tooltip = { show: false, x: 0, y: 0, text: '' }
  let isSeeking = false

  $: totalTimelineDuration = Math.max(
    track1.duration > 0 ? track1.duration + 5 : 60,
    track2.filepath ? track2.offset + track2.duration + 5 : 60
  )
  $: t2PitchRatio =
    isTempoSyncEnabled && track1.meta && track2.meta && track1.meta.bpm > 0 && track2.meta.bpm > 0
      ? track1.meta.bpm / track2.meta.bpm
      : 1.0
  $: equalCurvePath1 = `M 0 0 Q ${curveHandle.cx} ${curveHandle.cy} 100 100`
  $: equalCurvePath2 = `M 0 100 Q ${100 - curveHandle.cx} ${100 - curveHandle.cy} 100 0`
  $: overlapStart = Math.max(0, track2.offset)
  $: overlapEnd = track2.filepath
    ? Math.min(track1.duration, track2.offset + track2.duration * (1.0 / t2PitchRatio))
    : 0
  $: overlapWidth = Math.max(0, overlapEnd - overlapStart)
  $: track1BodyPath = generateWaveformPath(track1.waveform, track1.duration, 100, false)
  $: track1PunchPath = generateWaveformPath(track1.waveform, track1.duration, 100, true)
  $: track2BodyPath = generateWaveformPath(track2.waveform, track2.duration, 100, false)
  $: track2PunchPath = generateWaveformPath(track2.waveform, track2.duration, 100, true)

  function generateWaveformPath(data, duration, height, isPunch) {
    if (!data || data.length === 0) return ''
    const step = duration / data.length
    let path = isPunch ? '' : `M 0 ${height / 2} `
    for (let i = 0; i < data.length; i++) {
      const x = i * step
      const val = data[i] * (height / 2)
      const y = height / 2 - val
      if (i === 0 && isPunch) path += `M ${x} ${y} `
      else path += `L ${x} ${y} `
    }
    if (!isPunch) {
      for (let i = data.length - 1; i >= 0; i--) {
        const x = i * step
        const val = data[i] * (height / 2)
        const y = height / 2 + val
        path += `L ${x} ${y} `
      }
      path += ' Z'
    }
    return path
  }

  function seekClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    playheadTime = Math.max(0, x / zoom)
  }

  function onTimelineWheel(e) {
    if (e.ctrlKey) {
      e.preventDefault()
      const zoomSpeed = 1.2
      if (e.deltaY < 0) zoom *= zoomSpeed
      else zoom /= zoomSpeed
      zoom = Math.max(10, Math.min(2000, zoom))
    }
  }

  function handleDragStart(e) {
    if (!isVisible) return
    isDraggingTrack2 = true
    dragStartX = e.clientX
    dragStartOffset = track2.offset
  }

  function addCustomPoint(e, curveId) {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    const pt = { t: x, v: y }
    if (curveId === 'vol1') customVolT1 = [...customVolT1, pt].sort((a, b) => a.t - b.t)
    else if (curveId === 'vol2') customVolT2 = [...customVolT2, pt].sort((a, b) => a.t - b.t)
    else if (curveId === 'eq1') customEqT1 = [...customEqT1, pt].sort((a, b) => a.t - b.t)
    else if (curveId === 'eq2') customEqT2 = [...customEqT2, pt].sort((a, b) => a.t - b.t)
  }

  function customCurveToSvgPath(points) {
    if (!points || points.length < 2) return ''
    const sorted = [...points].sort((a, b) => a.t - b.t)
    let path = `M ${sorted[0].t * 100} ${100 - sorted[0].v * 100}`
    for (let i = 1; i < sorted.length; i++) {
      path += ` L ${sorted[i].t * 100} ${100 - sorted[i].v * 100}`
    }
    return path
  }

  function startPointDrag(curveId, idx) {
    draggingCurveId = curveId
    draggingPointIdx = idx
  }

  onMount(() => {
    updater = setInterval(async () => {
      if (!isVisible || !isPlaying || isSeeking) return
      if (scrollContainer) {
        const playheadPx = playheadTime * zoom
        const containerW = scrollContainer.clientWidth
        const scrollLeft = scrollContainer.scrollLeft
        const margin = containerW * 0.2
        if (playheadPx > scrollLeft + containerW - margin || playheadPx < scrollLeft + margin) {
          scrollContainer.scrollLeft = Math.max(0, playheadPx - containerW * 0.3)
        }
      }

      const t1Active = playheadTime < track1.duration
      const t2EffectiveDuration = track2.duration * (1.0 / t2PitchRatio)
      const t2Active =
        playheadTime >= track2.offset && playheadTime < track2.offset + t2EffectiveDuration

      if (window.peerifyAPI) {
        if (track1.filepath) {
          if (t1Active && !track1.isPlayingInternal) {
            track1.isPlayingInternal = true
            await window.peerifyAPI.mixer.seek(track1.id, playheadTime)
            await window.peerifyAPI.mixer.play(track1.id)
          } else if (!t1Active && track1.isPlayingInternal) {
            track1.isPlayingInternal = false
            await window.peerifyAPI.mixer.pause(track1.id)
          }
        }
        if (track2.filepath) {
          if (t2Active && !track2.isPlayingInternal) {
            track2.isPlayingInternal = true
            await window.peerifyAPI.mixer.seek(
              track2.id,
              (playheadTime - track2.offset) * t2PitchRatio
            )
            await window.peerifyAPI.mixer.play(track2.id)
          } else if (!t2Active && track2.isPlayingInternal) {
            track2.isPlayingInternal = false
            await window.peerifyAPI.mixer.pause(track2.id)
          }
        }

        let t1Vol = 1.0,
          t2Vol = 1.0
        let t1Pitch = 1.0,
          t2Pitch = t2PitchRatio
        let t1Eq = 0.0,
          t2Eq = 0.0

        let fadeLength = track1.duration - track2.offset
        if (playheadTime >= track2.offset && playheadTime <= track1.duration && fadeLength > 0) {
          let overlapT = Math.max(0, Math.min(1, (playheadTime - track2.offset) / fadeLength))

          if (curveType === 'linear') {
            t1Vol = 1.0 - overlapT
            t2Vol = overlapT
          } else if (curveType === 'cut') {
            t1Vol = overlapT >= 1.0 ? 0.0 : 1.0
            t2Vol = 1.0
          } else if (curveType === 'custom') {
            t1Vol = interpolateCustomCurve(customVolT1, overlapT)
            t2Vol = interpolateCustomCurve(customVolT2, overlapT)
            t1Eq = interpolateCustomCurve(customEqT1, overlapT) < 0.5 ? -45.0 : 0.0
            t2Eq = interpolateCustomCurve(customEqT2, overlapT) < 0.5 ? -45.0 : 0.0
          } else {
            // Sinusoidal (S-Curve) for premium smoothness
            t1Vol = Math.cos(overlapT * Math.PI * 0.5)
            t2Vol = Math.sin(overlapT * Math.PI * 0.5)
          }

          if (isTempoSyncEnabled && track1.meta && track2.meta) {
            const bpm1 = track1.meta.bpm,
              bpm2 = track2.meta.bpm
            t1Pitch = 1.0 * (1.0 - overlapT) + (bpm2 / bpm1) * overlapT
            t2Pitch = (bpm1 / bpm2) * (1.0 - overlapT) + 1.0 * overlapT
          }
        } else if (playheadTime > track1.duration) {
          t1Vol = 0.0
          t2Pitch = 1.0
        } else if (playheadTime < track2.offset) {
          t2Vol = 0.0
        }

        if (isAiAutomationEnabled && curveType !== 'custom') {
          let track2RelPos = playheadTime - track2.offset
          let dropPoint = (track2.meta?.drop_pos ?? fadeLength * 0.5) / t2PitchRatio
          t1Eq = track2RelPos > dropPoint ? -45.0 : 0.0
          t2Eq = track2RelPos < dropPoint ? -45.0 : 0.0
        }

        // BATCH SYNC
        if (window.peerifyAPI?.mixer?.syncAll) {
          await window.peerifyAPI.mixer.syncAll({
            c0Vol: t1Vol,
            c0Pitch: t1Pitch,
            c0Bass: t1Eq,
            c1Vol: t2Vol,
            c1Pitch: t2Pitch,
            c1Bass: t2Eq
          })
          // Update visual flags
          eqTrack1 = t1Eq > 0.5
          eqTrack2 = t2Eq > 0.5
        }
      }
      playheadTime += 0.05
      if (
        !t1Active &&
        !t2Active &&
        playheadTime > track1.duration &&
        playheadTime > track2.offset
      ) {
        stopPreview()
      }
    }, 50)

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  })

  onDestroy(() => {
    clearInterval(updater)
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
  })

  function handleGlobalMouseMove(e) {
    if (!isVisible) return
    handleDragMove(e)
    handleCurveDragMove(e)
  }

  function handleGlobalMouseUp() {
    if (!isVisible) return
    handleDragEnd()
    handleCurveDragEnd()
  }

  $: if (!isVisible && isPlaying) {
    stopPreview()
  }

  $: if (isVisible && initialTrack1 && track1.filepath !== initialTrack1) {
    setTrackDirect(true, initialTrack1)
  }
  $: if (isVisible && initialTrack2 && track2.filepath !== initialTrack2) {
    setTrackDirect(false, initialTrack2)
  }

  async function setTrackDirect(isFirstTrack, filePath) {
    if (!window.peerifyAPI) return
    const track = isFirstTrack ? track1 : track2
    track.filepath = filePath
    track.name = filePath.split(/[\\/]/).pop()
    track.isPlayingInternal = false
    track.waveform = []
    await window.peerifyAPI.mixer.load(track.id, filePath)
    setTimeout(async () => {
      let dur = await window.peerifyAPI.mixer.getDuration(track.id)
      if (isFirstTrack) {
        track1.duration = dur
        if (!track2.filepath || track2.offset === 0)
          track2.offset = Math.max(0, dur - crossfadeDuration)
        track1 = track1
      } else {
        track2.duration = dur
        if (track1.duration > 0) track2.offset = Math.max(0, track1.duration - crossfadeDuration)
        track2 = track2
      }
      pollWaveform(isFirstTrack ? track1 : track2)
      fetchMetadata(isFirstTrack ? track1 : track2)
    }, 100)
  }

  async function loadTrack(isFirstTrack) {
    if (!window.peerifyAPI || !window.peerifyAPI.selectAudioFile) return
    const filePath = await window.peerifyAPI.selectAudioFile()
    if (!filePath) return
    const track = isFirstTrack ? track1 : track2
    track.filepath = filePath
    track.name = filePath.split(/[\\/]/).pop()
    track.isPlayingInternal = false
    track.waveform = []
    await window.peerifyAPI.mixer.load(track.id, filePath)
    setTimeout(async () => {
      let dur = await window.peerifyAPI.mixer.getDuration(track.id)
      if (isFirstTrack) {
        track1.duration = dur
        if (!track2.filepath || track2.offset === 0)
          track2.offset = Math.max(0, dur - crossfadeDuration)
        track1 = track1
      } else {
        track2.duration = dur
        if (track1.duration > 0) track2.offset = Math.max(0, track1.duration - crossfadeDuration)
        track2 = track2
      }
      if (track1.filepath && track2.filepath && scrollContainer) {
        let targetScroll = (track2.offset - preListenSeconds - 1) * zoom
        if (targetScroll > 0) scrollContainer.scrollTo({ left: targetScroll, behavior: 'smooth' })
      }
      pollWaveform(isFirstTrack ? track1 : track2)
      fetchMetadata(isFirstTrack ? track1 : track2)
    }, 100)
  }

  async function pollWaveform(track) {
    if (!window.peerifyAPI || !window.peerifyAPI.mixer.getWaveform) return
    let wf = await window.peerifyAPI.mixer.getWaveform(track.id)
    if (wf && wf.length > 0 && Math.max(...wf) > 0) {
      track.waveform = wf
      track.id === 0 ? (track1 = track1) : (track2 = track2)
    } else {
      setTimeout(() => pollWaveform(track), 400)
    }
  }

  function clearTrack(isFirstTrack) {
    if (isFirstTrack) track1 = { ...track1, filepath: '', duration: 0, waveform: [], meta: null }
    else track2 = { ...track2, filepath: '', duration: 0, waveform: [], meta: null, offset: 0 }
    stopPreview()
  }

  async function fetchMetadata(track) {
    if (!window.peerifyAPI || !window.peerifyAPI.getTrackMetadata) return
    try {
      const metaStr = await window.peerifyAPI.getTrackMetadata(track.filepath)
      if (metaStr) {
        track.meta = typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr
        track.id === 0 ? (track1 = track1) : (track2 = track2)
      }
    } catch (e) {}
  }

  async function stopPreview() {
    if (!window.peerifyAPI) return
    isPlaying = false
    track1.isPlayingInternal = false
    track2.isPlayingInternal = false
    await window.peerifyAPI.mixer.pause(track1.id)
    await window.peerifyAPI.mixer.pause(track2.id)
    window.peerifyAPI.mixer.setVolume(track1.id, 1.0)
    window.peerifyAPI.mixer.setVolume(track2.id, 1.0)
    window.peerifyAPI.mixer.setPitch(track1.id, 1.0)
    window.peerifyAPI.mixer.setPitch(track2.id, 1.0)
    window.peerifyAPI.mixer.setEq(track1.id, 0.0, 0.0)
    window.peerifyAPI.mixer.setEq(track2.id, 0.0, 0.0)
    eqTrack1 = false
    eqTrack2 = false
  }

  async function auditionTransition() {
    if (!track1.filepath || !track2.filepath) return
    playheadTime = Math.max(0, track2.offset - preListenSeconds)
    isPlaying = true
  }

  async function autoAlign() {
    if (
      !track1.filepath ||
      !track2.filepath ||
      !window.peerifyAPI ||
      !window.peerifyAPI.mixer.autoAlign
    )
      return
    const result = await window.peerifyAPI.mixer.autoAlign(track1.id, track2.id)
    if (result && result.offset !== undefined) {
      track2.offset = result.offset
      track2 = track2
    }
  }

  function formatTimeWithMs(seconds) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    const milliseconds = Math.floor((seconds - Math.floor(seconds)) * 100)
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
  }

  function handleDragMove(event) {
    if (!isDraggingTrack2) return
    const deltaX = event.clientX - dragStartX
    let newOffset = dragStartOffset + deltaX / zoom
    if (newOffset < 0) newOffset = 0
    let snappedThisFrame = false
    if (track1.meta && track1.meta.bpm > 0) {
      const beatDur = 60.0 / track1.meta.bpm
      const snapOffset = Math.round(newOffset / beatDur) * beatDur
      if (Math.abs(newOffset - snapOffset) * zoom < 15) {
        newOffset = snapOffset
        snappedThisFrame = true
      }
    }
    isSnapped = snappedThisFrame
    track2.offset = newOffset
    track2 = track2
  }

  function handleDragEnd() {
    isDraggingTrack2 = false
    isSnapped = false
  }

  function handleCurveDragMove(e) {
    if (isDraggingHandle && handleDragSvgRect) {
      const x = ((e.clientX - handleDragSvgRect.left) / handleDragSvgRect.width) * 100
      const y = ((e.clientY - handleDragSvgRect.top) / handleDragSvgRect.height) * 100
      curveHandle = { cx: Math.max(0, Math.min(100, x)), cy: Math.max(0, Math.min(100, y)) }
    } else if (draggingPointIdx >= 0 && draggingCurveId) {
      const rect = scrollContainer.getBoundingClientRect() // Approx
      let x = Math.max(0, Math.min(1, (e.clientX - overlapStart * zoom) / (overlapWidth * zoom))) // Simplified
      let y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / 100)) // Simplified
      if (x < 0.03) x = 0
      if (x > 0.97) x = 1
      if (y < 0.03) y = 0
      if (y > 0.97) y = 1
      if (Math.abs(y - 0.5) < 0.03) y = 0.5
      const arr = getCurveArray(draggingCurveId)
      if (draggingPointIdx === 0) arr[0].v = y
      else if (draggingPointIdx === arr.length - 1) arr[arr.length - 1].v = y
      else {
        arr[draggingPointIdx].t = x
        arr[draggingPointIdx].v = y
      }
      triggerCurveReactivity()
      tooltip = {
        show: true,
        x: e.clientX,
        y: e.clientY - 30,
        text:
          editingLane === 'volume'
            ? `Vol: ${Math.round(y * 100)}%`
            : y < 0.5
              ? 'Bass: CUT'
              : 'Bass: FULL'
      }
    }
  }

  function handleCurveDragEnd() {
    isDraggingHandle = false
    draggingPointIdx = -1
    draggingCurveId = ''
    tooltip.show = false
  }

  function interpolateCustomCurve(points, t) {
    if (!points || points.length < 2) return t
    const sorted = [...points].sort((a, b) => a.t - b.t)
    if (t <= sorted[0].t) return sorted[0].v
    if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].t && t <= sorted[i + 1].t) {
        const seg = (t - sorted[i].t) / (sorted[i + 1].t - sorted[i].t)
        return sorted[i].v + (sorted[i + 1].v - sorted[i].v) * seg
      }
    }
    return 0
  }

  function getCurveArray(curveId) {
    if (curveId === 'vol1') return customVolT1
    if (curveId === 'vol2') return customVolT2
    if (curveId === 'eq1') return customEqT1
    if (curveId === 'eq2') return customEqT2
    return []
  }

  function triggerCurveReactivity() {
    if (draggingCurveId === 'vol1') customVolT1 = customVolT1
    else if (draggingCurveId === 'vol2') customVolT2 = customVolT2
    else if (draggingCurveId === 'eq1') customEqT1 = customEqT1
    else if (draggingCurveId === 'eq2') customEqT2 = customEqT2
  }

  function handleAddPoint(e) {
    if (draggingPointIdx !== -1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    const pt = { t: x, v: y }
    if (editingLane === 'volume') {
      customVolT1 = [...customVolT1, pt].sort((a, b) => a.t - b.t)
      customVolT2 = [...customVolT2, pt].sort((a, b) => a.t - b.t)
    } else {
      customEqT1 = [...customEqT1, pt].sort((a, b) => a.t - b.t)
      customEqT2 = [...customEqT2, pt].sort((a, b) => a.t - b.t)
    }
  }

  function removeCustomPoint(curveId, idx) {
    const arr = getCurveArray(curveId)
    if (idx === 0 || idx === arr.length - 1) return
    if (curveId === 'vol1') customVolT1 = customVolT1.filter((_, i) => i !== idx)
    else if (curveId === 'vol2') customVolT2 = customVolT2.filter((_, i) => i !== idx)
    else if (curveId === 'eq1') customEqT1 = customEqT1.filter((_, i) => i !== idx)
    else if (curveId === 'eq2') customEqT2 = customEqT2.filter((_, i) => i !== idx)
  }

  function getFilledCurvePath(points) {
    if (!points || points.length < 2) return ''
    const sorted = [...points].sort((a, b) => a.t - b.t)
    let path = `M ${sorted[0].t * 100} ${100 - sorted[0].v * 100}`
    for (let i = 1; i < sorted.length; i++) {
      path += ` L ${sorted[i].t * 100} ${100 - sorted[i].v * 100}`
    }
    path += ` L 100 100 L 0 100 Z`
    return path
  }
</script>

<div
  class="flex flex-col h-full bg-[var(--bg-app)] text-white select-none font-sans relative dj-grid-bg overflow-hidden"
>
  <div
    class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--accent-primary-transparent),transparent_50%)] pointer-events-none"
  ></div>

  {#if tooltip.show}
    <div
      class="fixed z-50 px-2 py-1 bg-black/90 border border-white/20 rounded text-[10px] font-mono font-bold text-white pointer-events-none transform -translate-x-1/2"
      style="left: {tooltip.x}px; top: {tooltip.y}px;"
    >
      {tooltip.text}
    </div>
  {/if}

  <div
    class="h-auto min-h-[52px] py-2 bg-white/5 backdrop-blur-2xl border-b border-white/5 flex flex-wrap items-center px-4 shrink-0 z-20 shadow-[0_4px_15px_rgba(0,0,0,0.5)] gap-4"
  >
    <div
      class="text-[10px] font-black tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
    >
      <div class="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></div>
      {$t('daw_mode_label')}
    </div>

    <div class="flex bg-black/50 rounded-lg p-0.5 gap-0.5 border border-white/5 shrink-0 ml-4">
      <button
        on:click={() => (curveType = 'equal')}
        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all {curveType ===
        'equal'
          ? 'text-accent-primary bg-white/10'
          : 'text-text-main/40 hover:text-white'}">{$t('mix_smooth')}</button
      >
      <button
        on:click={() => (curveType = 'linear')}
        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all {curveType ===
        'linear'
          ? 'text-accent-primary bg-white/10'
          : 'text-text-main/40 hover:text-white'}">{$t('mix_linear')}</button
      >
      <button
        on:click={() => (curveType = 'cut')}
        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all {curveType ===
        'cut'
          ? 'text-[#FF4081] bg-[#FF4081]/10'
          : 'text-text-main/40 hover:text-white'}">{$t('mix_cut')}</button
      >
      <button
        on:click={() => (curveType = 'custom')}
        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all {curveType ===
        'custom'
          ? 'text-[#FFD700] bg-[#FFD700]/10 shadow-[0_0_10px_rgba(255,215,0,0.2)]'
          : 'text-text-main/40 hover:text-white'}">{$t('mix_draw')}</button
      >
    </div>

    <div class="h-4 w-px bg-white/10 mx-2"></div>

    <button
      on:click={autoAlign}
      class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-accent-primary/40 text-accent-primary hover:bg-accent-primary/20 transition-all shrink-0 shadow-[0_0_10px_var(--accent-glow)]"
    >
      {$t('auto_mix_btn')}
    </button>

    <button
      on:click={() => (isTempoSyncEnabled = !isTempoSyncEnabled)}
      class="px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 {isTempoSyncEnabled
        ? 'bg-[#1DB954]/15 border border-[#1DB954]/40 text-[#1DB954]'
        : 'bg-transparent border border-white/10 text-white/40 hover:text-white'}"
    >
      {$t('tempo_sync_btn')}
    </button>

    <button
      on:click={() => (isAiAutomationEnabled = !isAiAutomationEnabled)}
      class="px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 {isAiAutomationEnabled
        ? 'bg-[#B900FF]/15 border border-[#B900FF]/40 text-[#B900FF]'
        : 'bg-transparent border border-white/10 text-white/40 hover:text-white'}"
    >
      {$t('ai_eq_btn')}
    </button>

    <div class="flex-1"></div>

    <div
      class="text-[12px] font-mono font-black text-white tabular-nums bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 shrink-0 shadow-inner"
    >
      {formatTimeWithMs(playheadTime)}
    </div>

    <button
      on:click={isPlaying ? stopPreview : auditionTransition}
      class="w-10 h-10 rounded-full flex items-center justify-center transition-all focus:outline-none shrink-0 {isPlaying
        ? 'bg-[#FF4081] text-white shadow-[0_0_15px_rgba(255,64,129,0.5)] scale-105'
        : 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:scale-110'}"
    >
      {#if isPlaying}
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"
          ><rect x="6" y="6" width="12" height="12" rx="2" /></svg
        >
      {:else}
        <svg class="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"
          ><path d="M8 5v14l11-7z" /></svg
        >
      {/if}
    </button>

    <div class="h-4 w-px bg-white/10 mx-2"></div>

    <button
      on:click={() =>
        dispatch('saveRecipe', {
          name: `${track1.name} ➜ ${track2.name}`,
          track1: track1.filepath,
          track2: track2.filepath,
          offset: track2.offset,
          crossfadeDuration: overlapWidth,
          curveType,
          pitch2: t2PitchRatio,
          automation: {
            vol1: customVolT1,
            vol2: customVolT2,
            eq1: customEqT1,
            eq2: customEqT2
          }
        })}
      class="px-4 py-1.5 rounded-full bg-accent-primary text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_var(--accent-glow)]"
    >
      {$t('save_mix')}
    </button>
  </div>

  <div
    class="flex-1 overflow-x-auto overflow-y-hidden bg-transparent relative mix-scrollbar flex flex-col"
    bind:this={scrollContainer}
    on:wheel={onTimelineWheel}
    role="main"
  >
    <div
      class="relative min-h-full"
      style="width: {totalTimelineDuration * zoom}px;"
      on:mousemove={handleCurveDragMove}
      on:mouseup={handleCurveDragEnd}
      on:mouseleave={handleCurveDragEnd}
      role="presentation"
    >
      <div
        class="h-8 border-b border-white/10 flex items-end sticky top-0 bg-[#060A14]/95 backdrop-blur-xl z-30 shadow-[0_4px_15px_rgba(0,0,0,0.6)] cursor-text group"
        on:mousedown={seekClick}
        on:keydown={(e) => {
          if (e.key === 'ArrowLeft') playheadTime = Math.max(0, playheadTime - 1)
          if (e.key === 'ArrowRight')
            playheadTime = Math.min(totalTimelineDuration, playheadTime + 1)
        }}
        role="slider"
        tabindex="0"
        aria-valuenow={playheadTime}
        aria-valuemin="0"
        aria-valuemax={totalTimelineDuration}
        aria-label="Timeline Seeker"
      >
        {#each Array(Math.ceil(totalTimelineDuration)) as _, sec}
          {#if sec % 5 === 0}
            <div class="absolute" style="left: {sec * zoom}px;">
              <span class="text-[9px] text-accent-primary font-mono font-black pl-1"
                >{formatTimeWithMs(sec).split('.')[0]}</span
              >
              <div class="h-3 border-l-2 border-accent-primary/40 mt-0.5"></div>
            </div>
          {:else}
            <div class="absolute h-2 border-l border-white/10" style="left: {sec * zoom}px;"></div>
          {/if}
        {/each}
      </div>

      {#if track1.meta && track1.meta.bpm > 0}
        {@const beatDur = 60.0 / track1.meta.bpm}
        {@const beatsTotal = Math.min(500, Math.ceil(totalTimelineDuration / beatDur))}
        <div
          class="absolute top-8 bottom-0 left-0 pointer-events-none z-5"
          style="width: {totalTimelineDuration * zoom}px;"
        >
          {#each Array(beatsTotal) as _, i}
            {@const beatX = i * beatDur * zoom}
            {@const isBar = i % 4 === 0}
            <div
              class="absolute top-0 bottom-0 w-px {isBar ? 'opacity-20' : 'opacity-5'}"
              style="left: {beatX}px; background: {isBar ? 'white' : 'white'};"
            ></div>
          {/each}
        </div>
      {/if}

      <div class="px-4 py-6 flex flex-col gap-2 relative">
        {#if track1.filepath && track2.filepath && overlapWidth > 0}
          <div
            class="absolute top-0 bottom-0 z-0 pointer-events-none"
            style="left: {overlapStart * zoom}px; width: {overlapWidth * zoom}px;"
          >
            <div
              class="absolute inset-0 bg-[repeating-linear-gradient(45deg,var(--accent-primary-transparent),var(--accent-primary-transparent)_10px,transparent_10px,transparent_20px)] border-l border-r border-accent-primary/20 backdrop-blur-[2px]"
            ></div>
            <div
              class="absolute top-0 left-1/2 -translate-x-1/2 px-4 py-1 rounded-b-xl bg-accent-primary/10 border border-t-0 border-accent-primary/30 text-[9px] font-black text-accent-primary uppercase tracking-widest shadow-[0_5px_20px_var(--accent-glow)]"
            >
              {overlapWidth.toFixed(1)}S {$t('mix_zone')}
            </div>
          </div>
        {/if}

        <div class="relative h-[130px] flex items-center z-10 group">
          <button
            on:click={() => loadTrack(true)}
            class="absolute z-20 text-[10px] font-black uppercase tracking-wider bg-black/80 border border-white/20 text-white px-4 py-2 rounded-xl hover:bg-accent-primary hover:text-black hover:border-transparent transition-all shadow-xl"
            style="left: 8px;"
          >
            {track1.filepath ? `⟳ ${$t('reload_track')} 1` : `+ ${$t('load_track')} 1`}
          </button>

          {#if track1.filepath}
            <button
              on:click|stopPropagation={() => clearTrack(true)}
              class="absolute z-30 flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all shadow-lg"
              style="left: 8px; top: 10px;"
              title={$t('remove_from_lib')}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          {/if}

          {#if track1.filepath && track1.duration > 0}
            <div
              class="absolute h-[110px] rounded-2xl overflow-hidden bg-[#0A1128]/80 backdrop-blur-md border-2 border-accent-primary/30 shadow-[0_10px_30px_rgba(0,0,0,0.6)] transition-all hover:border-accent-primary/70"
              style="left: 0; width: {track1.duration * zoom}px;"
            >
              <div
                class="absolute top-2 left-[150px] flex items-center gap-2 px-3 py-1 rounded-lg bg-black/80 z-10"
              >
                <div
                  class="w-2.5 h-2.5 rounded-full bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]"
                ></div>
                <span class="text-[10px] font-bold text-white truncate max-w-[250px]"
                  >{track1.name}</span
                >
                {#if track1.meta && track1.meta.bpm}
                  <span class="text-[9px] font-mono text-accent-primary ml-2"
                    >{Math.round(track1.meta.bpm)} BPM</span
                  >
                {/if}
              </div>

              {#if track1.waveform && track1.waveform.length > 0}
                <svg
                  class="absolute inset-0 w-full h-full pointer-events-none opacity-80"
                  viewBox="0 0 {track1.duration} 100"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <filter id="kickGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="waveGrad1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.8" />
                      <stop offset="100%" stop-color="var(--accent-secondary)" stop-opacity="0.4" />
                    </linearGradient>
                  </defs>
                  <!-- Body Layer: Dim background -->
                  <path
                    d={track1BodyPath}
                    fill="url(#waveGrad1)"
                    fill-opacity="0.15"
                    stroke="none"
                  />
                  <!-- Ultimate Punch Layer: Thick, Bright, Glowing -->
                  <path
                    d={track1PunchPath}
                    stroke="#FFFFFF"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    filter="url(#kickGlow)"
                    stroke-opacity="1.0"
                    fill="none"
                  />
                  <path
                    d={track1PunchPath}
                    stroke="url(#waveGrad1)"
                    stroke-width="1.0"
                    stroke-linecap="round"
                    stroke-opacity="1.0"
                    fill="none"
                  />
                </svg>

                {#if track1.meta}
                  {#if track1.meta.outro_start}
                    <div
                      class="absolute top-0 bottom-0 z-10 w-px border-l border-dashed border-[#FF0055]/70 pointer-events-none"
                      style="left: {(track1.meta.outro_start / track1.duration) * 100}%;"
                    ></div>
                    <div
                      class="absolute bottom-2 z-20 px-2 py-0.5 rounded bg-[#FF0055] text-[8px] font-black text-white shadow-[0_0_10px_#FF0055] -translate-x-1/2"
                      style="left: {(track1.meta.outro_start / track1.duration) * 100}%;"
                    >
                      OUTRO
                    </div>
                  {/if}
                  {#if track1.meta.drop_pos}
                    <div
                      class="absolute top-0 bottom-0 z-10 w-[2px] bg-gradient-to-b from-transparent via-[#FFD700] to-transparent pointer-events-none shadow-[0_0_8px_#FFD700]"
                      style="left: {(track1.meta.drop_pos / track1.duration) * 100}%;"
                    ></div>
                    <div
                      class="absolute top-0 z-20 px-2 py-0.5 rounded-b-md bg-[#FFD700] text-[8px] font-black text-black shadow-[0_0_10px_#FFD700] -translate-x-1/2"
                      style="left: {(track1.meta.drop_pos / track1.duration) * 100}%;"
                    >
                      DROP
                    </div>
                  {/if}
                {/if}
              {/if}

              {#if track2.filepath && overlapWidth > 0}
                <svg
                  class="absolute top-0 right-0 h-full z-20 pointer-events-none"
                  style="width: {overlapWidth * zoom}px;"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.5)" />
                  <path
                    d={curveType === 'custom'
                      ? getFilledCurvePath(customVolT1)
                      : curveType === 'linear'
                        ? 'M 0 0 L 100 100 L 0 100 Z'
                        : 'M 0 0 L 100 100 Z'}
                    fill="var(--accent-primary)"
                    opacity="0.1"
                  />
                </svg>
              {/if}

              {#if eqTrack1}
                <div
                  class="absolute bottom-3 right-3 px-2 py-1 rounded bg-[#FF0055] text-[9px] font-black text-white shadow-[0_0_10px_#FF0055] z-10"
                >
                  BASS CUT
                </div>
              {/if}
            </div>
          {/if}
        </div>

        {#if track1.filepath && track2.filepath && overlapWidth > 0}
          <div
            class="relative h-[100px] z-20 my-2 rounded-xl bg-black/40 border border-white/5 backdrop-blur-sm"
          >
            {#if curveType === 'custom'}
              <div class="absolute -top-4 left-4 flex gap-2 z-30">
                <button
                  on:click={() => (editingLane = 'volume')}
                  class="px-3 py-1 rounded-t-lg text-[9px] font-black uppercase transition-all {editingLane ===
                  'volume'
                    ? 'bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.4)]'
                    : 'bg-white/10 text-white/50 hover:bg-white/20'}">{$t('volume')}</button
                >
                <button
                  on:click={() => (editingLane = 'eq')}
                  class="px-3 py-1 rounded-t-lg text-[9px] font-black uppercase transition-all {editingLane ===
                  'eq'
                    ? 'bg-[#FF6B35] text-white shadow-[0_0_15px_rgba(255,107,53,0.4)]'
                    : 'bg-white/10 text-white/50 hover:bg-white/20'}">{$t('eq_label')}</button
                >
              </div>
            {/if}

            <div
              class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:100%_25%] pointer-events-none"
            ></div>

            {#if curveType === 'custom' && editingLane === 'eq'}
              <div
                class="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-[#FF6B35]/70 z-10 pointer-events-none"
              ></div>
              <div
                class="absolute top-1/2 left-2 -translate-y-[120%] text-[8px] font-black text-[#FF6B35]/70"
              >
                {$t('enable_bass_cut')}
              </div>
            {/if}

            <svg
              class="absolute inset-0 w-full h-full overflow-visible"
              style="left: {overlapStart * zoom}px; width: {overlapWidth * zoom}px;"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <path
                d={curveType === 'custom'
                  ? customCurveToSvgPath(editingLane === 'volume' ? customVolT1 : customEqT1)
                  : curveType === 'linear'
                    ? 'M 0 0 L 100 100'
                    : curveType === 'cut'
                      ? 'M 0 0 L 95 0 L 100 100'
                      : equalCurvePath1}
                fill="none"
                stroke={editingLane === 'volume' || curveType !== 'custom'
                  ? track1.color
                  : '#FF6B35'}
                stroke-width="5"
                stroke-linecap="round"
                filter="url(#glow)"
                class="drop-shadow-lg"
                opacity="1"
              />

              <path
                d={curveType === 'custom'
                  ? customCurveToSvgPath(editingLane === 'volume' ? customVolT2 : customEqT2)
                  : curveType === 'linear'
                    ? 'M 0 100 L 100 0'
                    : curveType === 'cut'
                      ? 'M 0 100 L 5 0 L 100 0'
                      : equalCurvePath2}
                fill="none"
                stroke={editingLane === 'volume' || curveType !== 'custom'
                  ? track2.color
                  : '#FF6B35'}
                stroke-width="5"
                stroke-linecap="round"
                filter="url(#glow)"
                class="drop-shadow-lg"
                opacity="1"
              />
            </svg>

            {#if curveType === 'custom'}
              <div
                class="absolute inset-0 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                style="left: {overlapStart * zoom}px; width: {overlapWidth * zoom}px;"
                role="presentation"
                on:mousedown={(e) => addCustomPoint(e, editingLane === 'volume' ? 'vol1' : 'eq1')}
              >
                {#each editingLane === 'volume' ? customVolT1 : customEqT1 as pt, i}
                  <div
                    class="absolute w-4 h-4 rounded-full border-2 bg-black cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2 z-40 transition-transform hover:scale-125 focus:scale-125 outline-none"
                    style="left: {pt.t * 100}%; top: {(1 - pt.v) *
                      100}%; border-color: {editingLane === 'volume'
                      ? track1.color
                      : '#FF6B35'}; box-shadow: 0 0 10px {editingLane === 'volume'
                      ? track1.color
                      : '#FF6B35'};"
                    on:mousedown|stopPropagation={() =>
                      startPointDrag(editingLane === 'volume' ? 'vol1' : 'eq1', i)}
                    on:contextmenu|preventDefault|stopPropagation={() =>
                      removeCustomPoint(editingLane === 'volume' ? 'vol1' : 'eq1', i)}
                    role="button"
                    tabindex="0"
                    aria-label="Automation Point (T1)"
                    on:keydown={(e) => {
                      if (e.key === 'Delete' || e.key === 'Backspace')
                        removeCustomPoint(editingLane === 'volume' ? 'vol1' : 'eq1', i)
                    }}
                  ></div>
                {/each}
                {#each editingLane === 'volume' ? customVolT2 : customEqT2 as pt, i}
                  <div
                    class="absolute w-4 h-4 rounded-full border-2 bg-black cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2 z-40 transition-transform hover:scale-125 focus:scale-125 outline-none"
                    style="left: {pt.t * 100}%; top: {(1 - pt.v) *
                      100}%; border-color: {editingLane === 'volume'
                      ? track2.color
                      : '#FF6B35'}; box-shadow: 0 0 10px {editingLane === 'volume'
                      ? track2.color
                      : '#FF6B35'};"
                    on:mousedown|stopPropagation={() =>
                      startPointDrag(editingLane === 'volume' ? 'vol2' : 'eq2', i)}
                    on:contextmenu|preventDefault|stopPropagation={() =>
                      removeCustomPoint(editingLane === 'volume' ? 'vol2' : 'eq2', i)}
                    role="button"
                    tabindex="0"
                    aria-label="Automation Point (T2)"
                    on:keydown={(e) => {
                      if (e.key === 'Delete' || e.key === 'Backspace')
                        removeCustomPoint(editingLane === 'volume' ? 'vol2' : 'eq2', i)
                    }}
                  ></div>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="h-[20px]"></div>
        {/if}

        <div class="relative h-[130px] flex items-center z-10 group mt-2">
          {#if !track2.filepath}
            <button
              on:click={() => loadTrack(false)}
              class="absolute z-20 text-[10px] font-black uppercase tracking-wider bg-black/80 border border-white/20 text-white px-4 py-2 rounded-xl hover:bg-[#B900FF] hover:text-white hover:border-transparent transition-all shadow-xl"
              style="left: 8px;"
            >
              {track2.filepath ? `⟳ ${$t('reload_track')} 2` : `+ ${$t('load_track')} 2`}
            </button>
          {:else}
            <button
              on:click={() => loadTrack(false)}
              class="absolute z-30 flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all shadow-lg"
              style="left: 8px; top: 10px;"
              title={$t('remove_from_lib')}
              on:click|stopPropagation={() => clearTrack(false)}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          {/if}

          {#if track2.filepath && track2.duration > 0}
            <div
              class="absolute h-[110px] rounded-2xl overflow-hidden bg-[#1A0B2E]/80 backdrop-blur-md border-2 cursor-grab active:cursor-grabbing transition-all z-20 shadow-[0_10px_30px_rgba(0,0,0,0.6)] {isSnapped
                ? 'border-accent-primary shadow-[0_0_25px_var(--accent-glow)]'
                : 'border-accent-secondary/30 hover:border-accent-secondary/70'}"
              style="left: {track2.offset * zoom}px; width: {track2.duration *
                zoom}px; transform-origin: left; transform: scaleX({1.0 / t2PitchRatio});"
              on:mousedown={handleDragStart}
              role="button"
              tabindex="0"
              aria-label="Track 2 (Draggable)"
            >
              <div
                class="absolute top-0 bottom-0 left-0 w-8 bg-white/5 hover:bg-white/10 flex flex-col justify-center items-center gap-1.5 border-r border-white/10 transition-colors z-20"
              >
                <div class="w-1 h-1 bg-white/60 rounded-full"></div>
                <div class="w-1 h-1 bg-white/60 rounded-full"></div>
                <div class="w-1 h-1 bg-white/60 rounded-full"></div>
              </div>

              <div
                class="absolute top-2 left-12 flex items-center gap-2 px-3 py-1 rounded-lg bg-black/80 z-10"
                style="transform: scaleX({t2PitchRatio}); transform-origin: left;"
              >
                <div class="w-2.5 h-2.5 rounded-full bg-[#B900FF] shadow-[0_0_8px_#B900FF]"></div>
                <span class="text-[10px] font-bold text-white truncate max-w-[250px]"
                  >{track2.name}</span
                >
                {#if track2.meta && track2.meta.bpm}
                  <span class="text-[9px] font-mono text-[#B900FF] ml-2"
                    >{Math.round(track2.meta.bpm)} BPM</span
                  >
                {/if}
              </div>

              {#if track2.waveform && track2.waveform.length > 0}
                <svg
                  class="absolute inset-0 w-full h-full pointer-events-none opacity-80"
                  viewBox="0 0 {track2.duration} 100"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <filter id="kickGlow2" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="waveGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#B900FF" stop-opacity="0.8" />
                      <stop offset="100%" stop-color="#FF0088" stop-opacity="0.4" />
                    </linearGradient>
                  </defs>
                  <!-- Body Layer: Dim background -->
                  <path
                    d={track2BodyPath}
                    fill="url(#waveGrad2)"
                    fill-opacity="0.15"
                    stroke="none"
                  />
                  <!-- Ultimate Punch Layer: Thick, Bright, Glowing -->
                  <path
                    d={track2PunchPath}
                    stroke="#FFFFFF"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    filter="url(#kickGlow2)"
                    stroke-opacity="1.0"
                    fill="none"
                  />
                  <path
                    d={track2PunchPath}
                    stroke="url(#waveGrad2)"
                    stroke-width="1.0"
                    stroke-linecap="round"
                    stroke-opacity="1.0"
                    fill="none"
                  />
                </svg>

                {#if track2.meta}
                  {#if track2.meta.intro_end}
                    <div
                      class="absolute top-0 bottom-0 z-10 w-[2px] bg-gradient-to-t from-transparent via-[#00FF88] to-transparent pointer-events-none shadow-[0_0_8px_#00FF88]"
                      style="left: {(track2.meta.intro_end / track2.duration) * 100}%;"
                    ></div>
                    <div
                      class="absolute bottom-0 z-20 px-2 py-0.5 rounded-t-md bg-[#00FF88] text-[8px] font-black text-black shadow-[0_0_10px_#00FF88] -translate-x-1/2"
                      style="left: {(track2.meta.intro_end / track2.duration) *
                        100}%; transform: scaleX({t2PitchRatio});"
                    >
                      INTRO
                    </div>
                  {/if}
                  {#if track2.meta.drop_pos}
                    <div
                      class="absolute top-0 bottom-0 z-10 w-[2px] bg-gradient-to-b from-transparent via-[#FFD700] to-transparent pointer-events-none shadow-[0_0_8px_#FFD700]"
                      style="left: {(track2.meta.drop_pos / track2.duration) * 100}%;"
                    ></div>
                    <div
                      class="absolute top-0 z-20 px-2 py-0.5 rounded-b-md bg-[#FFD700] text-[8px] font-black text-black shadow-[0_0_10px_#FFD700] -translate-x-1/2"
                      style="left: {(track2.meta.drop_pos / track2.duration) *
                        100}%; transform: scaleX({t2PitchRatio});"
                    >
                      DROP
                    </div>
                  {/if}
                {/if}
              {/if}

              {#if eqTrack2}
                <div
                  class="absolute bottom-3 right-3 px-2 py-1 rounded bg-[#FF0055] text-[9px] font-black text-white shadow-[0_0_10px_#FF0055] z-10"
                  style="transform: scaleX({t2PitchRatio}); transform-origin: right;"
                >
                  BASS CUT
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div
        class="absolute top-0 bottom-0 w-[2px] bg-[#FF0055] z-40 pointer-events-none shadow-[0_0_10px_#FF0055]"
        style="left: {playheadTime * zoom}px; transform: translateX(-50%);"
      >
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#FF0055] rounded-b-full shadow-[0_0_10px_#FF0055]"
          style="clip-path: polygon(0 0, 100% 0, 50% 100%);"
        ></div>
      </div>
    </div>
  </div>
</div>

<style>
  .mix-scrollbar::-webkit-scrollbar {
    height: 14px;
  }
  .mix-scrollbar::-webkit-scrollbar-track {
    background: #03050a;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 7px;
    border: 3px solid #03050a;
  }
  .mix-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 229, 255, 0.5);
  }
  .dj-grid-bg {
    background-color: #03050a;
    background-image:
      linear-gradient(var(--accent-primary-transparent) 1px, transparent 1px),
      linear-gradient(90deg, var(--accent-primary-transparent) 1px, transparent 1px);
    background-size: 50px 50px;
    background-position: center center;
  }
</style>
