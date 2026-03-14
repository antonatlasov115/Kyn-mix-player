<script lang="ts">
  export let rippleIntensity: number = 1.0
</script>

<svg class="absolute w-0 h-0 overflow-hidden pointer-events-none">
  <defs>
    <!-- Simple Warp Noise (for general use) -->
    <filter id="warpNoise" x="-50%" y="-50%" width="200%" height="200%">
      <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" result="noise" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale={20 * rippleIntensity}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    <!-- Base Backdrop Distortion Noise -->
    <filter id="liquidDistortion" x="-100%" y="-100%" width="300%" height="300%">
      <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale={60 * rippleIntensity}
        xChannelSelector="R"
        yChannelSelector="G"
      />
      <feGaussianBlur stdDeviation="1.5" />
    </filter>
  </defs>
</svg>
