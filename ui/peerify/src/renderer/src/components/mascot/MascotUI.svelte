<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  export let x: number = 0
  export let y: number = 0
  export let showMascotName: boolean = true
  export let name: string = 'Yuki'
  export let isHovered: boolean = false
  export let announcement: string = ''
  export let activeEffect: string = 'none'
  export let isLyrics: boolean = false
  export let energy: number = 0
  export let vocals: number = 0
  export let themeColor: string = '#ffffff'
  export let skin: string = 'yuki'
  export let isNearDrop: boolean = false

  let randomTilt = 0
  let randomScale = 1
  let isSlowed = false

  $: isSlowed = ['slowed', 'super_slowed', 'slowed_reverb'].includes(activeEffect)
  let isGubby = false
  $: isGubby = skin === 'gubby'
  $: if (announcement) {
    randomTilt = (Math.random() - 0.5) * 30 // -15 to 15 deg
    randomScale = (isSlowed ? 1.2 : 0.9) + Math.random() * 0.4
  }

  // Draggable State
  let dragX = 0
  let dragY = 0
  let isDragging = false
  let startX = 0
  let startY = 0

  function handleMouseDown(e: MouseEvent) {
    if (!isLyrics) return
    isDragging = true
    startX = e.clientX - dragX
    startY = e.clientY - dragY
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return
    dragX = e.clientX - startX
    dragY = e.clientY - startY
  }

  function handleMouseUp() {
    isDragging = false
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }
</script>

<div
  class="absolute flex flex-col items-center gap-2 z-[110] pointer-events-none {isSlowed ? 'is-slowed' : ''} {isLyrics ? 'is-lyrics' : ''} {isGubby ? 'is-gubby' : ''}"
  style="
    left: 0; 
    top: 0; 
    transform: translate3d(calc({x + 128 + dragX}px - 50%), {y - 40 + dragY}px, 0);
    will-change: transform;
    --vocals: {vocals};
    --energy: {energy};
  "
>
  <!-- Lyrics Backdrop Glow -->
  {#if isLyrics && announcement && !isGubby}
    <div 
      class="lyrics-backdrop" 
      transition:fade={{ duration: 1000 }}
      style="
        opacity: {isGubby ? 0.8 : 0.5 + energy * 0.5}; 
        transform: translate(-50%, -50%) scale({1.2 + energy * 0.4});
        background: radial-gradient(circle, {isGubby ? '#ffffff' : themeColor} 0%, transparent 75%);
        filter: blur({isGubby ? 20 : 60 + energy * 40}px);
      "
    ></div>
  {/if}

  <!-- Stylized Drop Announcement -->
  {#if announcement}
    {#key announcement}
      <div 
        class="drop-text-wrapper" 
        on:mousedown={handleMouseDown}
        role="button"
        tabindex="0"
        transition:fade={{ duration: isSlowed ? 800 : 400 }}
        style="
          transform: rotate({isLyrics ? (-1 + (energy * 2)) : randomTilt}deg) scale({randomScale + (isLyrics ? energy * 0.15 : 0)});
          font-size: {isLyrics ? (announcement.length > 20 ? '2.0rem' : '2.8rem') : (announcement.length > 6 ? (announcement.length > 10 ? '2.2rem' : '3.0rem') : '3.8rem')};
          filter: {isLyrics ? `drop-shadow(0 ${6 + energy * 12}px ${12 + energy * 18}px rgba(0,0,0,${0.5 + energy * 0.3}))` : 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.6))'};
        "
      >
        <!-- Impact Splash / Flash -->
        <div class="impact-splash"></div>
        
        <div class="{isNearDrop ? 'text-dance' : ''}">
          <h2 class="drop-text" data-text={announcement}>
            {#if isLyrics}
              {#each announcement.split(' ') as word, i}
                <span 
                  class="lyric-word" 
                  style="
                    animation-delay: {i * 0.12}s; 
                    --weight: {((i * 133) % 10) / 10};
                    --index: {i};
                    --dir: {i % 2 === 0 ? 1 : -1};
                    --glow-color: {themeColor}88;
                  "
                >
                  {#if isGubby}
                    {#each word.split('') as char, j}
                      <span class="lyric-char" style="animation-delay: {-((j * 17) % 40) / 100}s">
                        {char}
                      </span>
                    {/each}
                  {:else}
                    {word}
                  {/if}
                </span>
              {/each}
            {:else}
              {announcement}
            {/if}
          </h2>
        </div>
      </div>
    {/key}
  {/if}

  {#if showMascotName}
    <div
      class="backdrop-blur-md px-4 py-1 rounded-full border border-white/20 bg-accent-primary/80 shadow-[0_0_20px_var(--accent-glow)] transition-opacity duration-500"
      style="opacity: {isHovered ? 1 : 0};"
    >
      <span class="text-[10px] font-black text-white uppercase tracking-[0.2em]">{name}</span>
    </div>
  {/if}
</div>

<style>
  .drop-text-wrapper {
    position: relative;
    perspective: 1000px;
    filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.6));
    display: flex;
    align-items: center;
    justify-content: center;
    transition: font-size 0.2s, transform 0.3s;
  }

  .is-lyrics .drop-text-wrapper {
    animation: lyrics-float 4s ease-in-out infinite;
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
    transition: all 1s ease-out;
    max-width: 90vw;
    display: flex;
    justify-content: center;
    pointer-events: auto;
    cursor: grab;
  }

  .is-lyrics .drop-text-wrapper:active {
    cursor: grabbing;
  }

  .is-lyrics.is-slowed .drop-text-wrapper {
    animation-duration: 10s;
    filter: drop-shadow(0 8px 16px rgba(160, 244, 255, 0.3)) drop-shadow(0 4px 8px rgba(0,0,0,0.6));
  }

  .is-lyrics .impact-splash {
    display: none;
  }

  .impact-splash {
    position: absolute;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, white 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    z-index: -1;
    animation: impact-ring 0.4s ease-out forwards;
  }

  .is-slowed .impact-splash {
     background: radial-gradient(circle, #ff00ff 0%, transparent 70%);
     animation: impact-ring 1.2s ease-out forwards;
  }

  .drop-text {
    position: relative;
    font-size: 1em; /* Controlled by wrapper */
    font-weight: 1000;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: -0.08em;
    font-style: italic;
    margin: 0;
    padding: 0;
    line-height: 1;
    text-shadow: 0 0 20px rgba(0,0,0,0.5);
    animation:
      hit-impact 0.4s cubic-bezier(0.12, 0, 0.39, 0) forwards,
      text-strobe 0.1s infinite;
  }

  .is-lyrics .drop-text {
    font-style: normal;
    text-transform: none;
    letter-spacing: 0.1rem;
    font-weight: 800;
    animation: lyrics-entry 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    text-shadow: 
      0 4px 8px rgba(0,0,0,0.8),
      0 12px 24px rgba(0,0,0,0.4);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.2rem 0.8rem;
    max-width: min(90vw, 750px);
    line-height: 1.2;
    font-weight: 950;
    color: #ffffff;
    background: linear-gradient(180deg, #ffffff 30%, #e0e0e0 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-stroke: 2.2px rgba(0,0,0,0.95);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .is-gubby .drop-text {
    font-family: 'Comic Sans MS', 'Marker Felt', cursive;
    color: #000 !important;
    background: none !important;
    -webkit-background-clip: initial !important;
    background-clip: initial !important;
    -webkit-text-stroke: 1.5px #fff !important;
    filter: drop-shadow(4px 4px 0px rgba(0,0,0,0.15)) !important;
    letter-spacing: -0.01em;
    animation: 
      lyrics-entry 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
      gubby-wiggle 0.3s steps(2, end) infinite !important;
  }

  .is-gubby .lyric-word {
    animation-timing-function: steps(4, end);
  }

  .is-gubby .lyric-word::after {
    background: #fff;
    filter: blur(5px);
  }

  .is-gubby .lyric-char {
    display: inline-block;
    animation: gubby-jitter 0.2s steps(2, end) infinite;
    will-change: transform;
  }

  .lyrics-backdrop {
    position: absolute;
    top: 60%;
    left: 50%;
    width: 180%;
    height: 180%;
    pointer-events: none;
    z-index: -1;
    transition: background 1s ease, filter 0.5s ease;
  }

  .is-lyrics.is-slowed .drop-text {
    animation-duration: 4s;
    animation-name: lyrics-entry-slow;
    filter: blur(0.4px);
    letter-spacing: 0.25rem;
  }

  .is-lyrics .drop-text::before,
  .is-lyrics .drop-text::after {
    display: none;
  }

  .lyric-word {
    display: inline-block;
    animation: lyric-word-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    position: relative;
    will-change: transform;
    transform: 
        translateY(calc(var(--vocals) * (15px + var(--weight) * 15px) * var(--dir))) 
        rotate(calc(var(--energy) * (5deg + var(--weight) * 8deg) * var(--dir) * -1))
        scale(calc(1 + var(--energy) * (0.1 + var(--weight) * 0.15)));
  }

  .lyric-word::after {
    content: '';
    position: absolute;
    inset: -2px;
    background: var(--glow-color, white);
    filter: blur(10px);
    opacity: 0;
    animation: karaoke-highlight 0.6s ease-out both;
    animation-delay: inherit;
    z-index: -1;
  }

  @keyframes karaoke-highlight {
    0% { opacity: 0; transform: scale(0.8); }
    30% { opacity: 0.8; transform: scale(1.1); }
    100% { opacity: 0; transform: scale(1.3); }
  }

  .is-slowed .drop-text {
    color: #ff00ff;
    animation:
      hit-impact-heavy 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards,
      text-strobe 0.3s infinite;
    filter: blur(1px) contrast(1.5);
  }

  /* Chromatic Aberration via pseudo-elements */
  .drop-text::before,
  .drop-text::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0.9;
  }

  .drop-text::before {
    color: #ff004c; /* Punchy red */
    z-index: -1;
    animation: glitch-hit-1 0.15s infinite;
  }

  .drop-text::after {
    color: #00e5ff; /* Icy cyan */
    z-index: -2;
    animation: glitch-hit-2 0.15s infinite;
  }

  @keyframes hit-impact {
    0% {
      transform: scale(0.2) rotate(-10deg);
      opacity: 0;
      filter: blur(20px) brightness(4);
    }
    15% {
      transform: scale(1.6) rotate(5deg);
      opacity: 1;
      filter: blur(0px) brightness(2);
    }
    30% {
      transform: scale(1.1) rotate(0deg);
      filter: brightness(1);
    }
    100% {
      transform: scale(1.05) translateY(-20px);
      opacity: 0;
    }
  }

  @keyframes hit-impact-heavy {
    0% {
      transform: scale(0.5) translateY(40px) skewX(20deg);
      opacity: 0;
      filter: blur(30px) brightness(5);
    }
    20% {
      transform: scale(2.0) translateY(-10px) skewX(-10deg);
      opacity: 1;
      filter: blur(2px) brightness(2);
    }
    100% {
      transform: scale(1.5) translateY(-40px) skewX(0deg);
      opacity: 0;
      filter: blur(10px);
    }
  }

  @keyframes impact-ring {
    0% {
      transform: scale(0.1);
      opacity: 1;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  @keyframes text-strobe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
  }

  @keyframes glitch-hit-1 {
    0% { transform: translate(-5px, -3px) skew(5deg); }
    50% { transform: translate(5px, 2px) skew(-5deg); }
    100% { transform: translate(-5px, -3px) skew(5deg); }
  }

  @keyframes glitch-hit-2 {
    0% { transform: translate(5px, 3px) skew(-5deg); }
    50% { transform: translate(-5px, -2px) skew(5deg); }
    100% { transform: translate(5px, 3px) skew(-5deg); }
  }

  @keyframes lyrics-float {
    0%, 100% { transform: translateY(0) rotate(-1deg); }
    50% { transform: translateY(-15px) rotate(1deg); }
  }

  @keyframes lyrics-entry {
    0% { 
      opacity: 0; 
      transform: translateY(40px) scale(0.8); 
      filter: blur(15px);
    }
    100% { 
      opacity: 1; 
      transform: translateY(0) scale(1); 
      filter: blur(0);
    }
  }

  @keyframes lyrics-entry-slow {
    0% { 
      opacity: 0; 
      transform: translateY(30px) scale(0.85); 
      filter: blur(25px); 
    }
    100% { 
      opacity: 1; 
      transform: translateY(0) scale(1); 
      filter: blur(0.8px); 
    }
  }

  @keyframes lyric-word-pop {
    0% { 
      opacity: 0; 
      transform: translateY(20px) scale(0.5); 
      filter: blur(5px);
    }
    100% { 
      opacity: 1; 
      transform: translateY(0) scale(1); 
      filter: blur(0);
    }
  }

  @keyframes gubby-wiggle {
    0% { transform: rotate(-1deg); }
    50% { transform: rotate(1deg) scale(1.02); }
    100% { transform: rotate(-1.5deg); }
  }

  @keyframes gubby-jitter {
    0% { transform: translate(0, 0) rotate(0deg); }
    33% { transform: translate(-1px, 1px) rotate(-1.5deg); }
    66% { transform: translate(1px, -1px) rotate(1.5deg); }
    100% { transform: translate(0.5px, 0.5px) rotate(-0.5deg); }
  }

  @keyframes text-dance {
    0%,
    100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.05) rotate(-1.5deg) translateY(-3px);
    }
    50% {
      transform: scale(1.1) rotate(1.5deg) translateY(0px);
    }
    75% {
      transform: scale(1.05) rotate(-0.5deg) translateY(-1.5px);
    }
  }

  .text-dance {
    animation: text-dance 0.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    display: inline-block;
    will-change: transform;
  }
</style>
