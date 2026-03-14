#define NOMINMAX // Must be first — prevents windows.h min/max macros from
                 // shadowing std::max/min
#include "PeerifyBassEngine.h"
#include "json.hpp"

#pragma comment(lib, "bass.lib")
#pragma comment(lib, "bass_vst.lib")

#include <algorithm>
#include <cmath>
#include <iostream>
#include <thread>

static std::string globalVstPath = "";

#ifdef _WIN32
#define NOMINMAX // Prevent windows.h from defining min/max macros that conflict
                 // with std::max
#include <objbase.h>
#include <windows.h>

static HWND g_VstWindow = NULL;

LRESULT CALLBACK VstWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  if (msg == WM_CLOSE) {
    DestroyWindow(hwnd);
    return 0;
  }
  if (msg == WM_DESTROY) {
    g_VstWindow = NULL;
    // PostQuitMessage(0); // REMOVED: This signaled the entire process to quit
    return 0;
  }
  return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static std::wstring Utf8ToWide(const std::string &utf8) {
  if (utf8.empty())
    return L"";
  int size = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, NULL, 0);
  std::wstring wide(size, 0);
  MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &wide[0], size);
  if (wide.back() == L'\0')
    wide.pop_back();
  return wide;
}

static std::string AnsiToUtf8(const char *ansiStr) {
  if (!ansiStr || !ansiStr[0])
    return "";
  int wideSize = MultiByteToWideChar(CP_ACP, 0, ansiStr, -1, NULL, 0);
  std::wstring wide(wideSize, 0);
  MultiByteToWideChar(CP_ACP, 0, ansiStr, -1, &wide[0], wideSize);
  int utf8Size =
      WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, NULL, 0, NULL, NULL);
  std::string utf8(utf8Size, 0);
  WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, &utf8[0], utf8Size, NULL,
                      NULL);
  while (!utf8.empty() && utf8.back() == '\0')
    utf8.pop_back();
  return utf8;
}
#endif

PeerifyBassEngine::PeerifyBassEngine() {
  currentState.store(1);
  ReinitAudioBackend(-1, 50);
}

PeerifyBassEngine::~PeerifyBassEngine() {
  for (int i = 0; i < 4; ++i)
    SafeUninit(i);
  BASS_Free();
}

void PeerifyBassEngine::GetAudioDevices(char *outBuffer, int maxLength) {
  if (!outBuffer || maxLength <= 0)
    return;
  try {
    nlohmann::json j = nlohmann::json::array();
    BASS_DEVICEINFO info;
    for (int i = 1; BASS_GetDeviceInfo(i, &info); i++) {
      if (info.flags & BASS_DEVICE_ENABLED) {
        j.push_back({{"index", i},
                     {"name", AnsiToUtf8(info.name)},
                     {"isDefault", (info.flags & BASS_DEVICE_DEFAULT) != 0}});
      }
    }
    snprintf(outBuffer, maxLength, "%s", j.dump().c_str());
  } catch (...) {
    snprintf(outBuffer, maxLength, "[]");
  }
}

bool PeerifyBassEngine::ReinitAudioBackend(int deviceIndex, int latencyMs) {
  std::lock_guard<std::mutex> lock(audioMutex);
  if (isEngineInitialized) {
    for (int i = 0; i < 4; ++i)
      SafeUninit(i);
    BASS_Free();
  }
  currentDeviceIndex = deviceIndex;

  int bufferMs =
      (std::max)(100, latencyMs * 2); // Adaptive: 2x latency, minimum 100ms
  BASS_SetConfig(BASS_CONFIG_UPDATEPERIOD, 20);
  BASS_SetConfig(BASS_CONFIG_BUFFER, bufferMs);

  if (BASS_Init(deviceIndex, 44100, BASS_DEVICE_LATENCY, 0, NULL)) {
    isEngineInitialized = true;
    return true;
  }
  isEngineInitialized = false;
  return false;
}

void PeerifyBassEngine::SafeUninit(int channel) {
  if (channel < 0 || channel >= 4 || channels[channel].handle == 0)
    return;

  // REMOVE ALL FX HANDLES TO PREVENT LEAKS
  if (channels[channel].eqHandles[0])
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].eqHandles[0]);
  if (channels[channel].midEqHandles[0])
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].midEqHandles[0]);
  if (channels[channel].highEqHandles[0])
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].highEqHandles[0]);
  if (channels[channel].hpfHandle)
    BASS_ChannelRemoveFX(channels[channel].handle, channels[channel].hpfHandle);

  if (channels[channel].reverbHandle)
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].reverbHandle);
  if (channels[channel].echoHandle)
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].echoHandle);
  if (channels[channel].compHandle)
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].compHandle);
  if (channels[channel].normHandle)
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].normHandle);

  if (channels[channel].vstHandle != 0) {
    BASS_VST_ChannelRemoveDSP(channels[channel].handle,
                              channels[channel].vstHandle);
    channels[channel].vstHandle = 0;
  }

  BASS_StreamFree(channels[channel].handle);
  channels[channel].handle = 0;
  channels[channel].eqHandles[0] = 0;
  channels[channel].midEqHandles[0] = 0; // Fix: was missing
  channels[channel].highEqHandles[0] = 0;
  channels[channel].hpfHandle = 0; // Fix: was missing
  channels[channel].reverbHandle = 0;
  channels[channel].echoHandle = 0;
  channels[channel].compHandle = 0;
  channels[channel].normHandle = 0;
  channels[channel].isInitialized = false;
}

bool PeerifyBassEngine::LoadTrack(int channel, const std::string &filepath,
                                  float bpm) {
  std::lock_guard<std::mutex> lock(audioMutex);
  if (!isEngineInitialized || channel < 0 || channel >= 4)
    return false;

  SafeUninit(channel);
  std::wstring widePath = Utf8ToWide(filepath);
  HSTREAM handle = BASS_StreamCreateFile(FALSE, widePath.c_str(), 0, 0,
                                         BASS_UNICODE | BASS_STREAM_PRESCAN);
  if (!handle)
    return false;

  channels[channel].handle = handle;
  channels[channel].cachedWidePath = widePath;
  channels[channel].bpm = (bpm > 0.0f) ? bpm : 120.0f;
  channels[channel].isInitialized = true;
  channels[channel].eqHandles[0] =
      BASS_ChannelSetFX(handle, BASS_FX_DX8_PARAMEQ, 10);
  channels[channel].midEqHandles[0] =
      BASS_ChannelSetFX(handle, BASS_FX_DX8_PARAMEQ, 11);
  channels[channel].highEqHandles[0] =
      BASS_ChannelSetFX(handle, BASS_FX_DX8_PARAMEQ, 12);
  channels[channel].hpfHandle =
      BASS_ChannelSetFX(handle, BASS_FX_DX8_PARAMEQ, 13);

  if (!globalVstPath.empty()) {
    channels[channel].vstHandle =
        BASS_VST_ChannelSetDSP(handle, Utf8ToWide(globalVstPath).c_str(), 0, 1);
  }

  int myLoadId = ++channels[channel].loadCount;

  channels[channel].pitch = 1.0f;
  SetTrackEq(channel, 0.0f, 0.0f, 0.0f);
  SetTrackFilters(channel, 0.0f);
  SetTrackReverb(channel, 0.0f);

  GenerateWaveform(channel, widePath, myLoadId);

  // Apply normalization if enabled
  if (normalizationEnabled) {
    channels[channel].normHandle =
        BASS_ChannelSetFX(handle, BASS_FX_DX8_COMPRESSOR, 5);
    BASS_DX8_COMPRESSOR c;
    c.fGain = 6.0f;      // Less makeup gain - avoids clipping
    c.fAttack = 20.0f;   // Slower attack - transparent, preserves transients
    c.fRelease = 400.0f; // Slower release - no pumping artifacts
    c.fThreshold = -18.0f;
    c.fRatio = 4.0f; // Gentle 4:1 ratio (was 16:1 - near-limiter)
    c.fPredelay = 4.0f;
    BASS_FXSetParameters(channels[channel].normHandle, &c);
  }

  return true;
}

bool PeerifyBassEngine::LoadVstPlugin(int channel, const std::string &dllPath) {
  std::lock_guard<std::mutex> lock(audioMutex);
  globalVstPath = dllPath;
  for (int i = 0; i < 4; i++) {
    if (channels[i].isInitialized && channels[i].handle != 0) {
      if (channels[i].vstHandle != 0)
        BASS_VST_ChannelRemoveDSP(channels[i].handle, channels[i].vstHandle);
      channels[i].vstHandle = BASS_VST_ChannelSetDSP(
          channels[i].handle, Utf8ToWide(dllPath).c_str(), 0, 1);
    }
  }
  return true;
}

void PeerifyBassEngine::RemoveVstPlugin(int channel) {
  std::lock_guard<std::mutex> lock(audioMutex);
  if (g_VstWindow != NULL) {
    SendMessageW(g_VstWindow, WM_CLOSE, 0, 0);
    g_VstWindow = NULL;
  }
  globalVstPath = "";
  for (int i = 0; i < 4; i++) {
    if (channels[i].vstHandle != 0) {
      BASS_VST_ChannelRemoveDSP(channels[i].handle, channels[i].vstHandle);
      channels[i].vstHandle = 0;
    }
  }
}

void PeerifyBassEngine::OpenVstEditor() {
  if (g_VstWindow != NULL) {
    SetWindowPos(g_VstWindow, HWND_TOPMOST, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE);
    return;
  }
  DWORD activeVstHandle = 0;
  for (int i = 0; i < 4; i++) {
    if (channels[i].vstHandle != 0) {
      activeVstHandle = channels[i].vstHandle;
      break;
    }
  }
  if (activeVstHandle == 0)
    return;

  std::thread([activeVstHandle]() {
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    HINSTANCE hInstance = GetModuleHandle(NULL);
    WNDCLASSW wc = {0};
    wc.lpfnWndProc = VstWndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = L"PeerifyVstClass";
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW);
    RegisterClassW(&wc);

    BASS_VST_INFO vstInfo;
    if (BASS_VST_GetInfo(activeVstHandle, &vstInfo)) {
      if (vstInfo.hasEditor == 0) {
        CoUninitialize();
        return;
      }
      RECT rc = {0, 0, (LONG)vstInfo.editorWidth, (LONG)vstInfo.editorHeight};
      AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);
      g_VstWindow = CreateWindowW(
          L"PeerifyVstClass", L"VST Plugin Editor",
          WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT,
          rc.right - rc.left, rc.bottom - rc.top, NULL, NULL, hInstance, NULL);
      if (g_VstWindow) {
        SetWindowPos(g_VstWindow, HWND_TOPMOST, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE);
        BASS_VST_EmbedEditor(activeVstHandle, g_VstWindow);
        MSG msg;
        while (GetMessage(&msg, NULL, 0, 0)) {
          TranslateMessage(&msg);
          DispatchMessage(&msg);
        }
      }
    }
    CoUninitialize();
  }).detach();
}

void PeerifyBassEngine::GenerateWaveform(int channel,
                                         const std::wstring &filepath,
                                         int loadId) {
  channels[channel].waveformData.clear();
  std::thread([this, channel, filepath, loadId]() {
    HSTREAM dec = BASS_StreamCreateFile(FALSE, filepath.c_str(), 0, 0,
                                        BASS_UNICODE | BASS_STREAM_DECODE);
    if (!dec)
      return;
    QWORD lengthBytes = BASS_ChannelGetLength(dec, BASS_POS_BYTE);
    const int NUM_BINS = 2000;
    QWORD bytesPerBin = lengthBytes / NUM_BINS;

    if (bytesPerBin < 4) bytesPerBin = 4;

    std::vector<float> tempWave(NUM_BINS, 0.0f);
    float maxPeak = 0.0f;

    // Use a larger processing buffer (64KB) for better I/O performance
    const DWORD PROCESS_BUF_SIZE = 65536; 
    std::vector<short> buffer(PROCESS_BUF_SIZE / 2);

    QWORD totalBytesRead = 0;
    int currentBin = 0;
    float currentBinPeak = 0.0f;
    QWORD bytesInCurrentBin = 0;

    while (totalBytesRead < lengthBytes && currentBin < NUM_BINS) {
        if (channels[channel].loadCount != loadId) {
            BASS_StreamFree(dec);
            return;
        }

        DWORD toRead = (DWORD)(std::min)((QWORD)PROCESS_BUF_SIZE, lengthBytes - totalBytesRead);
        DWORD bytesRead = BASS_ChannelGetData(dec, buffer.data(), toRead);
        if (bytesRead == (DWORD)-1 || bytesRead == 0) break;

        int samplesRead = bytesRead / sizeof(short);
        for (int s = 0; s < samplesRead; s++) {
            float val = std::abs((float)buffer[s] * (1.0f / 32768.0f));
            if (val > currentBinPeak) currentBinPeak = val;

            bytesInCurrentBin += sizeof(short);
            if (bytesInCurrentBin >= bytesPerBin) {
                tempWave[currentBin] = currentBinPeak;
                if (currentBinPeak > maxPeak) maxPeak = currentBinPeak;
                
                currentBin++;
                currentBinPeak = 0.0f;
                bytesInCurrentBin = 0;
                if (currentBin >= NUM_BINS) break;
            }
        }
        totalBytesRead += bytesRead;
    }

    if (maxPeak > 0.0001f) {
      float invMax = 1.0f / maxPeak;
      for (int i = 0; i < NUM_BINS; i++)
        tempWave[i] *= invMax;
    }
    {
      std::lock_guard<std::mutex> lock(audioMutex);
      if (channels[channel].isInitialized &&
          channels[channel].loadCount == loadId) {
        channels[channel].waveformData = std::move(tempWave);
        channels[channel].hasWaveform.store(true);
      }
    }
    BASS_StreamFree(dec);
  }).detach();
}

void PeerifyBassEngine::PlayTrack(int channel) {
  if (channels[channel].isInitialized) {
    BASS_ChannelPlay(channels[channel].handle, FALSE);
    currentState.store(2);
  }
}

void PeerifyBassEngine::PauseTrack(int channel) {
  if (channels[channel].isInitialized) {
    BASS_ChannelPause(channels[channel].handle);
    currentState.store(3);
  }
}

void PeerifyBassEngine::StopTrack(int channel) {
  if (channels[channel].isInitialized) {
    BASS_ChannelStop(channels[channel].handle);
    BASS_ChannelSetPosition(channels[channel].handle, 0, BASS_POS_BYTE);
  }
}

void PeerifyBassEngine::SetTrackVolume(int channel, float volume) {
  if (channels[channel].isInitialized) {
    channels[channel].targetVolume = volume;
    float headroom = 0.75f;
    // SMOOTHING: Slide to target volume over 40ms - longer slide prevents
    // stepping at high IPC update rates
    BASS_ChannelSlideAttribute(channels[channel].handle, BASS_ATTRIB_VOL,
                               volume * headroom, 40);
  }
}

void PeerifyBassEngine::SeekTrack(int channel, float seconds) {
  if (channels[channel].isInitialized) {
    QWORD pos =
        BASS_ChannelSeconds2Bytes(channels[channel].handle, (double)seconds);
    BASS_ChannelSetPosition(channels[channel].handle, pos, BASS_POS_BYTE);
  }
}

void PeerifyBassEngine::SetTrackPitch(int channel, float pitch) {
  if (channels[channel].isInitialized) {
    channels[channel].pitch = pitch;
    float defaultFreq = 44100.0f;
    BASS_CHANNELINFO info;
    if (BASS_ChannelGetInfo(channels[channel].handle, &info)) {
      defaultFreq = (float)info.freq;
    }
    BASS_ChannelSetAttribute(channels[channel].handle, BASS_ATTRIB_FREQ,
                             defaultFreq * pitch);
  }
}

void PeerifyBassEngine::SetTrackEq(int channel, float bassAmount,
                                   float midAmount, float highAmount) {
  if (!channels[channel].isInitialized)
    return;

  if (channels[channel].eqHandles[0]) {
    BASS_DX8_PARAMEQ p;
    BASS_FXGetParameters(channels[channel].eqHandles[0], &p);
    p.fCenter = 100.0f;
    p.fBandwidth = 18.0f; // Tighter band - prevents bass EQ bleeding into mids
    p.fGain = (bassAmount > 0 ? bassAmount * 1.5f : bassAmount); // Direct dB
    BASS_FXSetParameters(channels[channel].eqHandles[0], &p);
  }

  if (channels[channel].midEqHandles[0]) {
    BASS_DX8_PARAMEQ p;
    BASS_FXGetParameters(channels[channel].midEqHandles[0], &p);
    p.fCenter = 1000.0f;
    p.fBandwidth = 16.0f; // Focused mid band for cleaner EQ separation
    p.fGain = midAmount;  // Direct dB
    BASS_FXSetParameters(channels[channel].midEqHandles[0], &p);
  }

  if (channels[channel].highEqHandles[0]) {
    BASS_DX8_PARAMEQ p;
    BASS_FXGetParameters(channels[channel].highEqHandles[0], &p);
    p.fCenter = 8000.0f;
    p.fBandwidth = 18.0f; // Slightly tighter highs
    p.fGain = highAmount; // Direct dB
    BASS_FXSetParameters(channels[channel].highEqHandles[0], &p);
  }
}

void PeerifyBassEngine::SetTrackFilters(int channel, float hpfAmount) {
  if (!channels[channel].isInitialized || !channels[channel].hpfHandle)
    return;

  BASS_DX8_PARAMEQ p;
  BASS_FXGetParameters(channels[channel].hpfHandle, &p);

  if (hpfAmount <= 0.01f) {
    p.fGain = 0.0f;
    p.fCenter = 100.0f;
  } else {
    // PROFESSIONAL DJ HPF SIMULATION
    // Sweep up to 12kHz instead of 880Hz
    p.fCenter = 100.0f + (std::pow(hpfAmount, 1.5f) * 12000.0f);
    p.fBandwidth =
        36.0f - (hpfAmount * 12.0f); // Sharpen bandwidth as we sweep up
    p.fGain = -45.0f * hpfAmount;    // Much deeper cut (complete attenuation)
  }
  BASS_FXSetParameters(channels[channel].hpfHandle, &p);
}

void PeerifyBassEngine::SetTrackReverb(int channel, float level) {
  channels[channel].reverbLevel = level;
  if (!channels[channel].isInitialized)
    return;

  if (level > 0.01f) {
    if (!channels[channel].reverbHandle) {
      // SET FX WITH LOWEST PRIORITY (0, 1) to be processed LAST in the chain
      // (BASS rule: lower = later)
      channels[channel].reverbHandle =
          BASS_ChannelSetFX(channels[channel].handle, BASS_FX_DX8_REVERB, 0);
      channels[channel].compHandle = BASS_ChannelSetFX(
          channels[channel].handle, BASS_FX_DX8_COMPRESSOR, 1);

      BASS_DX8_COMPRESSOR c;
      c.fGain = 0.0f;
      c.fAttack = 25.0f;
      c.fRelease = 300.0f;
      c.fThreshold = -12.0f;
      c.fRatio = 3.0f;
      c.fPredelay = 0.0f;
      BASS_FXSetParameters(channels[channel].compHandle, &c);
    }
    BASS_DX8_REVERB p;
    BASS_FXGetParameters(channels[channel].reverbHandle, &p);
    // Improved mapping: level 0.1-1.0 maps to -45dB to -2dB (much more audible)
    p.fReverbMix = -50.0f + (level * 48.0f);
    p.fReverbTime =
        1800.0f; // Shorter tail - less bleed into next track (was 2800ms)
    p.fHighFreqRTRatio =
        0.45f; // Darker reverb character - less harsh in the mix (was 0.6)
    p.fInGain = 0.0f;
    BASS_FXSetParameters(channels[channel].reverbHandle, &p);

    SetTrackVolume(channel, channels[channel].targetVolume);
  } else if (channels[channel].reverbHandle) {
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].reverbHandle);
    channels[channel].reverbHandle = 0;
    if (channels[channel].compHandle) {
      BASS_ChannelRemoveFX(channels[channel].handle,
                           channels[channel].compHandle);
      channels[channel].compHandle = 0;
    }
    SetTrackVolume(channel, channels[channel].targetVolume);
  }
}

void PeerifyBassEngine::SetTrackEcho(int channel, float wet, float feedback,
                                     float delayMs) {
  if (!channels[channel].isInitialized)
    return;

  if (wet > 0.01f) {
    if (!channels[channel].echoHandle) {
      channels[channel].echoHandle =
          BASS_ChannelSetFX(channels[channel].handle, BASS_FX_DX8_ECHO, 2);
    }
    if (channels[channel].echoHandle) {
      BASS_DX8_ECHO p;
      BASS_FXGetParameters(channels[channel].echoHandle, &p);
      // wet: 0-100 (percentage of wet signal mixed)
      p.fWetDryMix = wet * 100.0f;    // 0.0-1.0 -> 0-100
      p.fFeedback = feedback * 80.0f; // 0.0-1.0 -> 0-80 (feedback percentage)
      p.fLeftDelay = delayMs;         // ms (up to 2000)
      p.fRightDelay = delayMs;        // sync both channels
      p.lPanDelay = FALSE;
      BASS_FXSetParameters(channels[channel].echoHandle, &p);
    }
  } else if (channels[channel].echoHandle) {
    BASS_ChannelRemoveFX(channels[channel].handle,
                         channels[channel].echoHandle);
    channels[channel].echoHandle = 0;
  }
}

void PeerifyBassEngine::SetTrackLoop(int channel, float startSec,
                                     float endSec) {
  if (!channels[channel].isInitialized || !channels[channel].handle)
    return;

  if (startSec < 0 || endSec <= startSec) {
    // Disable loop
    BASS_ChannelFlags(channels[channel].handle, 0, BASS_SAMPLE_LOOP);
    return;
  }

  QWORD startBytes =
      BASS_ChannelSeconds2Bytes(channels[channel].handle, (double)startSec);
  QWORD endBytes =
      BASS_ChannelSeconds2Bytes(channels[channel].handle, (double)endSec);

  BASS_ChannelSetPosition(channels[channel].handle, startBytes, BASS_POS_LOOP);
  // Note: BASS uses BASS_POS_LOOP flag with start position for loop point
  // Set the loop end with BASS_POS_END
  // For BASS, we use BASS_ChannelSetPosition with BASS_POS_LOOP for the loop
  // start and enable the BASS_SAMPLE_LOOP flag
  BASS_ChannelFlags(channels[channel].handle, BASS_SAMPLE_LOOP,
                    BASS_SAMPLE_LOOP);
}

void PeerifyBassEngine::SetNormalization(bool enabled) {
  normalizationEnabled = enabled;
  for (int i = 0; i < 4; i++) {
    if (!channels[i].isInitialized || !channels[i].handle)
      continue;

    if (enabled) {
      if (!channels[i].normHandle) {
        channels[i].normHandle =
            BASS_ChannelSetFX(channels[i].handle, BASS_FX_DX8_COMPRESSOR, 5);
        BASS_DX8_COMPRESSOR c;
        c.fGain = 9.0f;
        c.fAttack = 20.0f;
        c.fRelease = 400.0f;
        c.fThreshold = -18.0f;
        c.fRatio = 4.0f;
        c.fPredelay = 4.0f;
        BASS_FXSetParameters(channels[i].normHandle, &c);
      }
    } else if (channels[i].normHandle) {
      BASS_ChannelRemoveFX(channels[i].handle, channels[i].normHandle);
      channels[i].normHandle = 0;
    }
  }
}

bool PeerifyBassEngine::Crossfade(int outChannel, int inChannel, int fadeMs,
                                  bool syncBpm, int curveType, int dropSwapMs,
                                  int inSeekMs) {
  if (!isEngineInitialized)
    return false;

  float phaseOffsetSec = 0.0f;
  float pitchRatio = 1.0f;

  if (outChannel >= 0 && outChannel < 4 && channels[outChannel].isInitialized) {
    float outBpm = channels[outChannel].bpm;

    if (outBpm > 10.0f) {
      double beatLen = 60.0 / (double)outBpm;
      double phraseLen = beatLen * 32.0; // 8 bars (Elite Sync)
      phaseOffsetSec =
          (float)std::fmod((double)GetTrackTime(outChannel), phraseLen);
    }

    if (inChannel >= 0 && inChannel < 4 && channels[inChannel].isInitialized &&
        syncBpm) {
      if (channels[inChannel].bpm > 10.0f)
        pitchRatio = outBpm / channels[inChannel].bpm;
    }
  }

  if (inChannel >= 0 && inChannel < 4 && channels[inChannel].isInitialized) {
    if (inSeekMs > 0) {
      // PRIORITY: Use frontend's precision seek (Kick Sync)
      SeekTrack(inChannel, (float)inSeekMs / 1000.0f);
    } else {
      // FALLBACK: Phrase sync
      SeekTrack(inChannel, phaseOffsetSec);
    }

    // USER REGULATION: Do NOT auto-pitch in crossfade (maintain natural pitch)
    // if (syncBpm) SetTrackPitch(inChannel, pitchRatio);

    BASS_ChannelSetAttribute(channels[inChannel].handle, BASS_ATTRIB_VOL, 0.0f);
    BASS_ChannelPlay(channels[inChannel].handle, FALSE);
  }

  currentState.store(2);
  return true;
}

float PeerifyBassEngine::GetTrackDuration(int channel) {
  if (channel < 0 || channel >= 4 || !channels[channel].isInitialized)
    return 0.0f;
  QWORD len = BASS_ChannelGetLength(channels[channel].handle, BASS_POS_BYTE);
  return (float)BASS_ChannelBytes2Seconds(channels[channel].handle, len);
}

float PeerifyBassEngine::GetTrackTime(int channel) {
  if (channel < 0 || channel >= 4 || !channels[channel].isInitialized)
    return 0.0f;
  QWORD pos = BASS_ChannelGetPosition(channels[channel].handle, BASS_POS_BYTE);
  return (float)BASS_ChannelBytes2Seconds(channels[channel].handle, pos);
}

bool PeerifyBassEngine::IsTrackPlaying(int channel) {
  if (channel < 0 || channel >= 4 || !channels[channel].isInitialized)
    return false;
  return BASS_ChannelIsActive(channels[channel].handle) == BASS_ACTIVE_PLAYING;
}

float PeerifyBassEngine::GetTrackBpm(int channel) {
  if (channel < 0 || channel >= 4)
    return 120.0f;
  return channels[channel].bpm;
}

void PeerifyBassEngine::GetStats(char *outBuffer, int maxLength) {
  if (!isEngineInitialized || !outBuffer)
    return;
  BASS_INFO info;
  BASS_GetInfo(&info);
  snprintf(outBuffer, maxLength,
           "{\"sampleRate\":%d,\"latencyMs\":%d,\"backend\":\"BASS_PRO\","
           "\"exclusive\":false}",
           (int)info.freq, (int)info.latency);
}

int PeerifyBassEngine::GetState() { return currentState.load(); }

int PeerifyBassEngine::GetWaveform(int channel, float *outBuffer,
                                   int maxLength) {
  if (channel < 0 || channel >= 4 || !outBuffer || maxLength <= 0)
    return 0;
  
  // LOCK-FREE CHECK
  if (!channels[channel].hasWaveform.load())
    return 0;

  // Since waveformData is static after generation, we can read it without locking audioMutex
  // The only risk is if it's being cleared during LoadTrack. 
  // We use a small local copy/check.
  const auto& data = channels[channel].waveformData;
  int availableSize = (int)data.size();
  if (availableSize == 0)
    return 0;

  int toCopy = (std::min)(availableSize, maxLength);
  for (int i = 0; i < toCopy; i++)
    outBuffer[i] = data[i];
  return toCopy;
}

float PeerifyBassEngine::GetLevel(int channel) {
  if (channel < 0 || channel >= 4 || !channels[channel].isInitialized)
    return 0.0f;
  float levels[2];
  if (BASS_ChannelGetLevelEx(channels[channel].handle, levels, 0.02,
                             BASS_LEVEL_RMS)) {
    return (levels[0] + levels[1]) / 2.0f;
  }
  return 0.0f;
}

int PeerifyBassEngine::GetFFT(int channel, float *outBuffer) {
  if (channel < 0 || channel >= 4 || !channels[channel].isInitialized ||
      !outBuffer)
    return 0;
  int read = BASS_ChannelGetData(channels[channel].handle, outBuffer,
                                 BASS_DATA_FFT512);
  if (read == -1)
    return 0;
  return 256;
}