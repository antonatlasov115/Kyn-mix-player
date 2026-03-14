<script>
  import { createEventDispatcher } from 'svelte'
  import { t } from '../../../lib/i18n'

  const dispatch = createEventDispatcher()

  export let curveType = 'equal'
  export let editingLane = 'volume'
  export let overlapStart = 0
  export let overlapWidth = 0
  export let zoom = 100
  export let track1Color = 'var(--accent-primary)'
  export let track2Color = '#B900FF'
  export let customVolT1 = []
  export let customVolT2 = []
  export let customEqT1 = []
  export let customEqT2 = []
  export let equalCurvePath1 = ''
  export let equalCurvePath2 = ''

  function customCurveToSvgPath(points) {
    if (!points || points.length < 2) return ''
    const sorted = [...points].sort((a, b) => a.t - b.t)
    return sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.t * 100} ${(1 - p.v) * 100}`).join(' ')
  }

  function handleAddPoint(e) {
    dispatch('addPoint', e)
  }

  function handleStartDrag(curveId, idx) {
    dispatch('startDrag', { curveId, idx })
  }

  function handleRemovePoint(curveId, idx) {
    dispatch('removePoint', { curveId, idx })
  }
</script>

<div
  class="relative h-[100px] z-20 my-2 rounded-xl bg-black/40 border border-white/5 backdrop-blur-sm"
>
  {#if curveType === 'custom'}
    <div class="absolute -top-4 left-4 flex gap-2 z-30">
      <button
        on:click={() => dispatch('setLane', 'volume')}
        class="px-3 py-1 rounded-t-lg text-[9px] font-black uppercase transition-all {editingLane ===
        'volume'
          ? 'bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.4)]'
          : 'bg-white/10 text-white/50 hover:bg-white/20'}">{$t('volume')}</button
      >
      <button
        on:click={() => dispatch('setLane', 'eq')}
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
    class="absolute inset-0 h-full overflow-visible"
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
      stroke={editingLane === 'volume' || curveType !== 'custom' ? track1Color : '#FF6B35'}
      stroke-width="5"
      stroke-linecap="round"
      filter="url(#glow)"
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
      stroke={editingLane === 'volume' || curveType !== 'custom' ? track2Color : '#FF6B35'}
      stroke-width="5"
      stroke-linecap="round"
      filter="url(#glow)"
    />
  </svg>

  {#if curveType === 'custom'}
    <div
      class="absolute inset-0 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
      style="left: {overlapStart * zoom}px; width: {overlapWidth * zoom}px;"
      on:mousedown={handleAddPoint}
      role="presentation"
    >
      {#each editingLane === 'volume' ? customVolT1 : customEqT1 as pt, i}
        <div
          class="absolute w-4 h-4 rounded-full border-2 bg-black cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2 z-40 transition-transform hover:scale-125"
          style="left: {pt.t * 100}%; top: {(1 - pt.v) * 100}%; border-color: {editingLane ===
          'volume'
            ? track1Color
            : '#FF6B35'}; box-shadow: 0 0 10px {editingLane === 'volume'
            ? track1Color
            : '#FF6B35'};"
          on:mousedown|stopPropagation={() =>
            handleStartDrag(editingLane === 'volume' ? 'vol1' : 'eq1', i)}
          on:contextmenu|preventDefault|stopPropagation={() =>
            handleRemovePoint(editingLane === 'volume' ? 'vol1' : 'eq1', i)}
          role="button"
          tabindex="0"
        ></div>
      {/each}
      {#each editingLane === 'volume' ? customVolT2 : customEqT2 as pt, i}
        <div
          class="absolute w-4 h-4 rounded-full border-2 bg-black cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2 z-40 transition-transform hover:scale-125"
          style="left: {pt.t * 100}%; top: {(1 - pt.v) * 100}%; border-color: {editingLane ===
          'volume'
            ? track2Color
            : '#FF6B35'}; box-shadow: 0 0 10px {editingLane === 'volume'
            ? track2Color
            : '#FF6B35'};"
          on:mousedown|stopPropagation={() =>
            handleStartDrag(editingLane === 'volume' ? 'vol2' : 'eq2', i)}
          on:contextmenu|preventDefault|stopPropagation={() =>
            handleRemovePoint(editingLane === 'volume' ? 'vol2' : 'eq2', i)}
          role="button"
          tabindex="0"
        ></div>
      {/each}
    </div>
  {/if}
</div>
