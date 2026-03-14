<script>
  import { onMount } from 'svelte'

  export let track = null
  export let color = 'var(--accent-primary)'
  export let align = 'left' // 'left' для входящего трека (Track B), 'right' для уходящего (Track A)
  export let height = 60
  export let showCurve = false // 'outgoing' | 'incoming' | false
  export let curveType = 'equal' // 'equal' | 'linear' | 'cut'
  export let width = 0
  export let opacity = 0.8
  export let bpm = 120
  export let pixelsPerSecond = 15
  export let showPhrases = false

  let canvas
  let ctx
  let waveform = []

  $: if (track?.staticWaveform) {
    waveform = track.staticWaveform
  } else if (track?.static_waveform) {
    waveform = track.static_waveform
  } else if (track?.track?.static_waveform) {
    waveform = track.track.static_waveform
  } else {
    // Generate high-resolution mock for empty states
    waveform = Array.from({ length: 200 }, (_, i) => 
      0.1 + Math.abs(Math.sin(i * 0.1)) * 0.4 + Math.random() * 0.2
    )
  }

  $: if (canvas && (waveform || width || height || showCurve || curveType || bpm || showPhrases)) {
    draw()
  }

  onMount(() => {
    ctx = canvas.getContext('2d')
    draw()
  })

  function draw() {
    if (!ctx || !waveform || waveform.length === 0) return

    const w = width || canvas.clientWidth || 800
    const h = height || canvas.clientHeight || 100
    
    // Support high DPI
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }
    
    ctx.clearRect(0, 0, w, h)

    const count = waveform.length
    const availableWidth = w
    const barGap = 1
    const barWidth = Math.max(1, (availableWidth / count) - barGap)
    
    // Draw Waveform
    ctx.globalAlpha = opacity
    
    // Create vibrant vertical gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, color)
    gradient.addColorStop(0.5, 'white')
    gradient.addColorStop(1, color)
    ctx.fillStyle = gradient

    // Add subtle glow to bars
    ctx.shadowBlur = 10
    ctx.shadowColor = color

    // Draw Phrase Markers
    if (showPhrases && bpm > 0) {
        ctx.save()
        ctx.globalAlpha = 0.2
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1
        const beatSeconds = 60 / bpm
        const phraseSeconds = beatSeconds * 32
        const pxPerPhrase = phraseSeconds * pixelsPerSecond
        
        for (let x = 0; x < w; x += pxPerPhrase) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
            ctx.stroke()
        }
        ctx.restore()
    }

    for (let i = 0; i < count; i++) {
        const dataIdx = align === 'right' ? (count - 1 - i) : i
        const val = waveform[dataIdx]
        const barH = Math.max(3, val * h * 0.9)
        
        const x = align === 'right' ? (w - (i * (availableWidth / count)) - barWidth) : (i * (availableWidth / count))
        const y = (h - barH) / 2

        ctx.beginPath()
        if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth, barH, Math.max(0.5, barWidth / 2))
        } else {
            ctx.rect(x, y, barWidth, barH)
        }
        ctx.fill()
    }
    
    ctx.shadowBlur = 0

    // Draw Transition Curve Overlay
    if (showCurve) {
      drawCurve(w, h)
    }
  }

  function drawCurve(w, h) {
    ctx.globalAlpha = 1.0
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 3
    ctx.shadowBlur = 15
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
    ctx.setLineDash([6, 6])
    ctx.beginPath()

    const steps = 60
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      let gain = 1.0

      if (curveType === 'linear') {
        gain = showCurve === 'outgoing' ? (1 - t) : t
      } else if (curveType === 'equal') {
        gain = showCurve === 'outgoing' ? Math.cos(t * Math.PI * 0.5) : Math.sin(t * Math.PI * 0.5)
      } else if (curveType === 'power_mix') {
        // Power Mix: smooth volume crossfade + bass swap (visualized as a slight dip or color change?)
        // Let's just draw it as a Cos/Sin for now but maybe thicker
        gain = showCurve === 'outgoing' ? Math.cos(t * Math.PI * 0.5) : Math.sin(t * Math.PI * 0.5)
        ctx.lineWidth = 4
      } else if (curveType === 'cut') {
        gain = showCurve === 'outgoing' ? (t < 0.5 ? 1 : 0) : (t >= 0.5 ? 1 : 0)
      }

      const x = t * w
      const y = h - (gain * h * 0.8) - (h * 0.1) // 10% padding

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    
    // Fill under curve
    ctx.globalAlpha = 0.15
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = 'white'
    ctx.fill()
    ctx.shadowBlur = 0
  }
</script>

<canvas
  bind:this={canvas}
  class="waveform-static w-full h-full"
  style="image-rendering: auto;"
></canvas>

<style>
  .waveform-static {
    display: block;
  }
</style>
