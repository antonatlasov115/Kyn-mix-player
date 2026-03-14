<script lang="ts">
  export let isBeat: boolean = false
  export let isPlaying: boolean = false
  export let isScanning: boolean = false
  export let isMixingZone: boolean = false
  export let skin: string = 'default'
  export let customSkin: any = {}
  export let energy: number = 0
  export let isTrail: boolean = false
  export let danceFrameIndex: number = 0
  export let blurIntensity: number = 1.0
  export let aberrationIntensity: number = 1.0
  export let velocityX: number = 0
  export let velocityY: number = 0
  export let glowColor: string = 'cyan'
  export let glowIntensity: number = 0
  export let isSlowed: boolean = false
  export let style: string = ''

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
    // Encode the entire path to safely handle spaces and special chars
    const encodedPath = encodeURIComponent(p.replace(/\\/g, '/'))
    return `media://local/${encodedPath}`
  }

  $: themeColor = isSlowed ? 'var(--accent-secondary)' : 'var(--accent-primary)'

  // Effects logic
  // Effects logic (Simplified for GPU)
  $: chromaticFactor = (isBeat ? (isSlowed ? 3 : 1.5) : 0) * aberrationIntensity

  // Dynamic Motion Blur (Simplified to CSS only)
  $: blurAmount = Math.max(Math.abs(velocityX), Math.abs(velocityY)) * 0.15 * blurIntensity
</script>

<div
  class="relative w-64 h-64 flex items-center justify-center mascot-content-wrapper"
  style="
    filter: blur({blurAmount + blurIntensity * 2}px) {isSlowed ? 'hue-rotate(-15deg) saturate(1.2)' : ''} {style};
    opacity: {isTrail ? 0.4 : isScanning || energy > 0.01 ? 1 : 0.8};
  "
>
  <!-- Simplified Chromatic Aberration -->
  {#if chromaticFactor > 1.0}
    <div class="absolute inset-0 pointer-events-none opacity-40 mix-blend-screen" style="transform: translateX({chromaticFactor}px); filter: brightness(1.2) hue-rotate(0deg);">
       <img 
         src={isScanning 
           ? (fixPath(customSkin.scan) || scanMascot) 
           : (isMixingZone 
               ? (skin === 'gubby' ? gubbyMixing : fixPath(isSlowed ? customSkin.slowedMixing : customSkin.autodj) || (isSlowed ? slowedMixing : autodjMascot)) 
               : (skin === 'gubby' 
                   ? (isBeat ? (fixPath(customSkin.drum) || gubbyBeat2) : (fixPath(customSkin.ready) || gubbyBeat1))
                   : (fixPath([customSkin.slowedDance1, customSkin.slowedDance2, customSkin.slowedDance3][danceFrameIndex]) || [slowedDance1, slowedDance2, slowedDance3][danceFrameIndex])
                 )
             )} 
         alt="" 
         class="w-full h-full object-contain" 
       />
    </div>
  {/if}

  {#if isScanning}
    <img
      src={fixPath(customSkin.scan) || scanMascot}
      alt="Scanning..."
      class="w-full h-full object-contain animate-pulse relative z-10"
      draggable="false"
    />
  {:else if isMixingZone || isScanning}
    <img
      src={skin === 'gubby'
        ? gubbyMixing
        : fixPath(
            isSlowed ? customSkin.slowedMixing : isScanning ? customSkin.scan : customSkin.autodj
          ) || (isSlowed ? slowedMixing : isScanning ? scanMascot : autodjMascot)}
      alt=""
      class="w-full h-full object-contain animate-jelly relative z-10"
      draggable="false"
    />
  {:else if isPlaying && (energy > 0.005 || isSlowed)}
    <div class="relative w-full h-full {isSlowed ? 'glitch-container' : ''} z-10">
      {#if isSlowed}
        <!-- Main Layer (Simplified Glitch) -->
        <img
          src={skin === 'gubby' 
            ? (isBeat ? (fixPath(customSkin.drum) || gubbyBeat2) : (fixPath(customSkin.ready) || gubbyBeat1))
            : fixPath(
                [customSkin.slowedDance1, customSkin.slowedDance2, customSkin.slowedDance3][
                  danceFrameIndex
                ]
              ) || [slowedDance1, slowedDance2, slowedDance3][danceFrameIndex]}
          alt=""
          class="relative w-full h-full object-contain scale-105 transition-all duration-75 {isBeat
            ? 'opacity-100'
            : 'opacity-90'}"
          draggable="false"
        />
      {:else if skin === 'gubby'}
        <img
          src={fixPath(customSkin.ready) || gubbyBeat1}
          alt=""
          class="absolute inset-0 w-full h-full object-contain mascot-ready-base {isBeat
            ? 'opacity-0 scale-95'
            : 'opacity-100 scale-100'}"
          draggable="false"
        />
        <img
          src={fixPath(customSkin.drum) || gubbyBeat2}
          alt=""
          class="absolute inset-0 w-full h-full object-contain mascot-drum-impact {isBeat
            ? 'opacity-100 scale-105'
            : 'opacity-0 scale-100'}"
          draggable="false"
        />
      {:else}
        <img
          src={fixPath(customSkin.ready) || gotovnostMascot}
          alt=""
          class="absolute inset-0 w-full h-full object-contain mascot-ready-base {isBeat
            ? 'opacity-0 scale-95'
            : 'opacity-100 scale-100'}"
          draggable="false"
        />
        <img
          src={fixPath(customSkin.drum) || drumMascot}
          alt=""
          class="absolute inset-0 w-full h-full object-contain mascot-drum-impact {isBeat
            ? 'opacity-100 scale-105'
            : 'opacity-0 scale-100'}"
          draggable="false"
        />
      {/if}
    </div>
  {:else}
    <div class="relative w-full h-full {isSlowed && isPlaying ? 'glitch-container' : ''} z-10">
      <img
        src={skin === 'gubby'
          ? gubbyIdle
          : fixPath(isSlowed ? customSkin.slowedIdle : customSkin.chill) ||
            (isSlowed ? slowedIdle : chillMascot)}
        alt=""
        class="w-full h-full object-contain mascot-chill"
        draggable="false"
      />
    </div>
  {/if}

  <!-- Premium Glow (Relocated to separate layer for GPU efficiency) -->
  <div
    class="absolute inset-0 rounded-full blur-[40px] -z-10 transition-all duration-300"
    style="
        background: radial-gradient(circle, {glowColor || themeColor} 0%, transparent {isSlowed ? '85%' : '70%'});
        opacity: {glowIntensity * 0.4 + energy * 0.2};
        transform: scale({(isSlowed ? 0.9 : 0.4) + energy * 1.2});
        mix-blend-mode: screen;
    "
  ></div>

  <!-- Shadow (Simple Blur) -->
  <div
    class="absolute bottom-4 w-32 h-6 bg-black/40 blur-2xl rounded-full -z-20 transition-all duration-300"
    style="opacity: {0.3 + energy}; transform: scale({1 + energy})"
  ></div>

</div>


<style>
  .animate-jelly {
    animation: jelly 0.4s infinite cubic-bezier(0.45, 0.05, 0.55, 0.95);
  }

  @keyframes jelly {
    0%,
    100% {
      transform: scale(1, 1);
    }
    30% {
      transform: scale(1.15, 0.85);
    }
    50% {
      transform: scale(0.85, 1.15);
    }
    70% {
      transform: scale(1.05, 0.95);
    }
  }

  .mascot-ready-base,
  .mascot-drum-impact {
    transition: all 0.08s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    transform-origin: bottom center;
  }

  .mascot-drum-impact {
    filter: brightness(1.2) drop-shadow(0 0 25px var(--accent-glow));
  }

  .mascot-chill {
    animation: chillFloat 3s infinite ease-in-out;
    opacity: 0.8;
  }

  @keyframes chillFloat {
    0%,
    100% {
      transform: translateY(0) rotate(0deg);
      filter: brightness(0.9) blur(0px);
    }
    50% {
      transform: translateY(-8px) rotate(2deg);
      filter: brightness(1.1) blur(1px);
    }
  }

  .glitch-container {
    animation: glitchJitter 0.2s infinite steps(2);
  }

  @keyframes glitchJitter {
    0% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(-1px, 1px);
    }
    100% {
      transform: translate(1px, -1px);
    }
  }
</style>
