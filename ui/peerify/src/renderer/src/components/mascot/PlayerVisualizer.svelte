<script>
  import { onMount, onDestroy } from 'svelte'

  export let spectrum = []
  export let themeColor = 'var(--accent-primary)'
  export let energyMultiplier = 1.0

  // 10 Orbs with physics properties
  let orbs = new Array(10).fill(0).map((_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    y: 30 + Math.random() * 40,
    baseSize: 60 + Math.random() * 100,
    energy: 0,
    vx: (Math.random() - 0.5) * 0.1,
    vy: (Math.random() - 0.5) * 0.1,
    color: i % 2 === 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)' // Mix primary and secondary theme colors
  }))

  let animationFrame
  let lastTime = performance.now()

  function update() {
    const now = performance.now()
    // 30 FPS Throttling
    if (now - lastTime < 32) {
      animationFrame = requestAnimationFrame(update)
      return
    }
    const dt = (now - lastTime) / 16.66 // Keep physics normalized to 60fps
    lastTime = now

    // Zero-allocation in-place mutation
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i]
      
      // Map 32 bands to 10 orbs
      const bandStart = Math.floor((i / orbs.length) * 32)
      const bandEnd = Math.floor(((i + 1) / orbs.length) * 32)
      let sum = 0
      for (let j = bandStart; j < bandEnd; j++) sum += spectrum[j] || 0
      const targetEnergy = sum / (bandEnd - bandStart)

      // Smoothing
      orb.energy += (targetEnergy - orb.energy) * 0.2 * dt

      // Physics: Drift & Bounce
      orb.x += orb.vx * dt
      orb.y += orb.vy * dt

      if (orb.x < 5 || orb.x > 95) orb.vx *= -1
      if (orb.y < 10 || orb.y > 90) orb.vy *= -1
    }
    
    // Trigger Svelte reactivity
    orbs = orbs

    animationFrame = requestAnimationFrame(update)
  }

  onMount(() => {
    animationFrame = requestAnimationFrame(update)
  })

  onDestroy(() => {
    cancelAnimationFrame(animationFrame)
  })

  $: secondaryColor = 'var(--accent-secondary)'
</script>

<div
  class="absolute inset-0 w-full h-full pointer-events-none overflow-hidden select-none visualizer-container"
>
  <div class="liquid-wrapper w-full h-full" style="opacity: 0.6;">
    {#each orbs as orb, i}
      <div
        class="absolute rounded-full will-change-transform"
        style="
          left: {orb.x}%;
          top: {orb.y}%;
          width: {orb.baseSize}px;
          height: {orb.baseSize}px;
          transform: translate(-50%, -50%) scale({(0.4 + orb.energy * 3.0) * energyMultiplier});
          background: radial-gradient(circle, {i % 2 === 0 ? themeColor : secondaryColor} 0%, transparent 80%);
          filter: blur({20 + orb.energy * 10}px);
          opacity: {0.4 + orb.energy * 0.6};
        "
      >
        <!-- Cheaper Glow Layer -->
        <div 
          class="absolute inset-[-10%] rounded-full blur-[20px] opacity-40 -z-10"
          style="background: {i % 2 === 0 ? themeColor : secondaryColor}; transform: scale({1 + orb.energy * 1.5});"
        ></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .visualizer-container {
    opacity: 0.25;
    mix-blend-mode: screen;
  }
  .liquid-wrapper {
    will-change: filter;
  }
  .liquid-wrapper div {
    will-change: transform, opacity;
  }
</style>
