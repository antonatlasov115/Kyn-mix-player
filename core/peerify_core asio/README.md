# 🔊 Peerify Native Audio Engine

The high-performance core of Peerify, providing ultra-low latency audio processing, intelligent mixing, and real-time analysis through a hybrid C++ architecture.

---

## 🏛️ Architecture Overview

The engine is built on a dual-backend system to provide both professional-grade stability and lightweight agility:

- **BASS Backend (Pro)**: Leverages the industry-standard BASS library for advanced features like VST hosting, complex effects (Echo, Reverb, EQ), and high-fidelity output.
- **Miniaudio Backend (Lite)**: A lightweight, low-level abstraction for minimal resource usage and highly predictable timing.
- **Analyzer Engine**: A dedicated multi-threaded component that processes your music library to detect BPM, frequency intensity, and signal peaks (drops/transitions).

---

## 🛠️ Key Components

### 1. `PeerifyAudio` (Miniaudio)
Handles basic playback, FFT generation, and waveform extraction. It uses a custom `analyzer_node` integrated into the Miniaudio graph for real-time spectral analysis.

### 2. `PeerifyBassEngine` (Pro)
The heavy-duty mixer. It supports:
- **VST Loaders**: Interacting with external 32/64-bit plugins.
- **Advanced DSP**: Hardware-accelerated EQ and high-quality effect chains.
- **Automix & Crossfading**: Sample-accurate transitions with customizable curve types.

### 3. `PeerifyAnalyzer`
The brain of the system. It builds an offline JSON database (`music_library.json`) and provides:
- **BPM Detection**: High-accuracy tempo estimation.
- **Feature Extraction**: Identification of Intro/Outro points and Track Drops.
- **Similarity Scoring**: Finds the next musically compatible track based on energy and genre.

---

## 🔌 API Reference (C-Exports)

The engine exposes a flat C-style API (exported from `dll_main.cpp`) for easy integration with Node.js via `koffi`:

### Player Control
- `Player_Init()`: Bootstraps the engines.
- `Player_SetEngine(bool usePro)`: Dynamically swaps between Miniaudio and BASS.
- `Player_SetAudioConfig(bool exclusive, int latencyMs, int deviceIndex)`: Configures hardware parameters.

### Mixing & Effects
- `Mixer_SetEq(int channel, float bass, float mid, float high)`: Real-time 3-band EQ.
- `Mixer_SetReverb(int channel, float level)`: Adjusts temporal diffusion.
- `Mixer_SetEcho(int channel, float wet, float feedback, float delayMs)`: Real-time echo processor.

### AI & Automation
- `AI_AnalyzeLibrary(const char* inputPath)`: Triggers recursive scanning and metadata extraction.
- `AI_GetNextSimilar(const char* current, char* out, int max)`: Recommendation engine query.
- `DJ_Automix(int fadeMs, int curveType, ...)`: Triggers a phrase-aligned transition.

---

## 🏗️ Build Guide

### Prerequisites
- **Visual Studio 2022** (MSVC 14.3+)
- **CMake 3.10+**
- **BASS Libraries**: Place `bass.lib` and `bass_vst.lib` in `peerify_core/`.

### Commands
```bash
mkdir build && cd build
cmake ..
cmake --build . --config Release
```

The resulting `peerify_core.dll` should be placed in the `ui/peerify/core/` directory for use by the Electron application.

---

## 📄 License
Proprietary. Developed by the Peerify Team.
