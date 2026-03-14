# <img src="ui/peerify/build/icon.png" width="48" align="center" /> Peerify

**Advanced Audio Engine ➜ High-Performance Visualizer ➜ Intelligent Automix**

Peerify is a next-generation desktop audio player built for power users, DJs, and audiophiles. It combines a high-performance C++ audio engine with a stunning, reactive Svelte-based interface to deliver a premium listening experience.

---

## ⚡ Core Features

### 🛠️ Professional Audio Engine
- **Native Performance**: Powered by a custom C++ engine (via Koffi) for sub-millisecond latency.
- **BASS & Miniaudio**: Hybrid engine support for ultra-stable playback and high-fidelity sound.
- **Low-Latency Architecture**: Fixed 85ms engine compensation with jitter-resistant IPC polling.
- **IntelliGain & Limiter**: Real-time energy normalization and soft-knee clipping to protect your ears.

### 🎧 Intelligent Automix
- **Spotify-Inspired Transitions**: Phrase-aligned, BPM-matched transitions between tracks.
- **Dynamic Transition Styles**:
  - `Smooth`: Equalized crossover with bass-swap logic.
  - `Wash Out`: High-pass filtering and high-diffuse reverb tails.
  - `Vinyl Brake`: Classic tempo-ramp shutdown with physical modeling.
  - `Power Mix`: Instant energy-swapping for high-tempo drops.

### 🎭 Animated Mascot (Kyn-Kun)
- **Beat-Synced Physics**: The mascot reacts in real-time to track energy and frequency bands.
- **Interactive UI**: Draggable, personalizable, and context-aware (announces drops, lyrics, and peaks).
- **Multiple Skins**: Supports custom skins (Gooby, Yuki, etc.) with unique animation profiles.

### 📊 Performance & Optimization
- **Potato Mode**: One-click toggle to strip heavy blurs and filters for maximum performance on low-end hardware.
- **Adaptive Sync**: Visualizer throttles based on window visibility to save CPU/GPU cycles.
- **Resource Monitor**: Built-in real-time telemetry for CPU and RAM usage.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Visual Studio 2022](https://visualstudio.microsoft.com/vs/) with C++ Desktop Development (for native engine compilation)
- **FFmpeg**: Required for audio processing.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/peerify.git
   cd peerify
   ```

2. **Setup Frontend** (Electron + Svelte)
   ```bash
   cd ui/peerify
   npm install
   ```

3. **Setup Engine** (Optional - if compiling from source)
   ```bash
   cd core/peerify_core asio
   mkdir build && cd build
   cmake ..
   cmake --build . --config Release
   ```

### Running

```bash
cd ui/peerify
npm run dev
```

---

## 🏗️ Tech Stack

- **UI Layer**: Svelte 5 + TailwindCSS + Vite
- **Shell**: Electron 39
- **Core Engine**: C++ 17 (BASS / Miniaudio)
- **Native Bridge**: Koffi (Fastest Node.js FFI)
- **Lyrics & API**: LRCLib, YouTube-DL-Exec

---

## 🌑 Customization

Peerify supports deep theming through CSS Variables. Check `src/renderer/src/App.svelte` and `index.css` to customize the primary accent glow and background palettes.

---

## 📄 License

Proprietary / In-Development. Please contact the maintainer for usage rights.
