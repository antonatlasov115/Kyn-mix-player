<script>
  export let points = []
  export let color = 'var(--accent-primary)'
</script>

<svg class="absolute inset-0 w-full h-full pointer-events-none z-0">
  <defs>
    <linearGradient id="trailGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color={color} stop-opacity="0" />
      <stop offset="100%" stop-color={color} stop-opacity="0.4" />
    </linearGradient>
  </defs>

  {#if points.length > 1}
    <polyline
      points={points.map((p) => `${p.x + 32},${p.y + 32}`).join(' ')}
      fill="none"
      stroke="url(#trailGrad)"
      stroke-width="8"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray="2 4"
    />
  {/if}
</svg>
