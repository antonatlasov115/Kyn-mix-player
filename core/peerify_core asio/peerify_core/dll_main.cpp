#include "PeerifyAnalyzer.h"
#include "PeerifyAudio.h"
#include "PeerifyBassEngine.h"
#include "json.hpp"
#include <memory>
#include <mutex>
#include <string>

using json = nlohmann::json;

std::unique_ptr<PeerifyAudioEngine> g_AudioEngine;
std::unique_ptr<PeerifyBassEngine> g_BassEngine;
std::unique_ptr<PeerifyAnalyzer> g_Analyzer;

std::mutex g_AnalyzerMutex;
int g_ActivePlayerChannel = 0;

bool g_UseProEngine = true;
int g_LastBassState = 0;

extern "C" {

__declspec(dllexport) bool Player_Init() {
  try {
    if (!g_AudioEngine)
      g_AudioEngine = std::make_unique<PeerifyAudioEngine>();
    if (!g_BassEngine)
      g_BassEngine = std::make_unique<PeerifyBassEngine>();
    return true;
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) void Player_Shutdown() {
  try {
    g_AudioEngine.reset();
    g_BassEngine.reset();
    std::lock_guard<std::mutex> lock(g_AnalyzerMutex);
    g_Analyzer.reset();
  } catch (...) {
  }
}

__declspec(dllexport) void Player_SetEngine(bool usePro) {
  try {
    if (g_UseProEngine == usePro)
      return;

    if (g_UseProEngine && g_BassEngine) {
      g_BassEngine->StopTrack(0);
      g_BassEngine->StopTrack(1);
    } else if (!g_UseProEngine && g_AudioEngine) {
      g_AudioEngine->StopTrack(0);
      g_AudioEngine->StopTrack(1);
    }
    g_UseProEngine = usePro;
  } catch (...) {
  }
}

__declspec(dllexport) bool Player_GetEngine() { return g_UseProEngine; }

__declspec(dllexport) void Player_SetNormalization(bool enabled) {
  try {
    if (g_BassEngine)
      g_BassEngine->SetNormalization(enabled);
  } catch (...) {
  }
}

__declspec(dllexport) bool Player_LoadVst(const char *dllPath) {
  try {
    if (!dllPath)
      return false;
    if (g_UseProEngine && g_BassEngine) {
      return g_BassEngine->LoadVstPlugin(g_ActivePlayerChannel,
                                         std::string(dllPath));
    }
    return false;
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) void Player_RemoveVst() {
  try {
    if (g_UseProEngine && g_BassEngine) {
      g_BassEngine->RemoveVstPlugin(g_ActivePlayerChannel);
    }
  } catch (...) {
  }
}

__declspec(dllexport) void Player_OpenVstEditor() {
  try {
    if (g_UseProEngine && g_BassEngine) {
      g_BassEngine->OpenVstEditor();
    }
  } catch (...) {
  }
}

__declspec(dllexport) bool Player_SetAudioConfig(bool exclusive, int latencyMs,
                                                 int deviceIndex) {
  try {
    if (!g_AudioEngine || !g_BassEngine)
      Player_Init();

    if (g_UseProEngine)
      return g_BassEngine->ReinitAudioBackend(deviceIndex, latencyMs);
    else
      return g_AudioEngine->ReinitAudioBackend(exclusive, latencyMs,
                                               deviceIndex);
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) void Player_GetAudioDevices(char *outBuffer,
                                                  int maxLength) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->GetAudioDevices(outBuffer, maxLength);
    else if (g_AudioEngine)
      g_AudioEngine->GetAudioDevices(outBuffer, maxLength);
  } catch (...) {
  }
}

__declspec(dllexport) int Player_GetState() {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetState();
    return g_AudioEngine ? g_AudioEngine->GetState() : 0;
  } catch (...) {
    return 0;
  }
}

__declspec(dllexport) bool Player_PollEvent(PlayerEvent *outEvent) {
  try {
    if (g_UseProEngine && g_BassEngine) {
      int currentState = g_BassEngine->GetState();
      if (currentState != g_LastBassState) {
        g_LastBassState = currentState;
        outEvent->type = EVENT_STATE_CHANGED;
        outEvent->state = currentState;
        return true;
      }
      return false;
    }
    return g_AudioEngine ? g_AudioEngine->PollEvent(outEvent) : false;
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) bool Player_LoadAndPlay(const char *filepath, float bpm) {
  try {
    if (!g_AudioEngine || !g_BassEngine)
      Player_Init();
    if (!filepath)
      return false;
    g_ActivePlayerChannel = 0;

    if (g_UseProEngine) {
      g_BassEngine->StopTrack(1);
      bool loaded = g_BassEngine->LoadTrack(g_ActivePlayerChannel,
                                            std::string(filepath), bpm);
      if (loaded)
        g_BassEngine->PlayTrack(g_ActivePlayerChannel);
      return loaded;
    } else {
      g_AudioEngine->StopTrack(1);
      bool loaded = g_AudioEngine->LoadTrack(g_ActivePlayerChannel,
                                             std::string(filepath), bpm);
      if (loaded) {
        g_AudioEngine->PlayTrack(g_ActivePlayerChannel);
        g_AudioEngine->ChangeState(PLAYER_PLAYING);
      }
      return loaded;
    }
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) bool DJ_PreloadNext(const char *filepath, float bpm) {
  try {
    if (!g_AudioEngine || !g_BassEngine)
      Player_Init();
    if (!filepath)
      return false;

    int nextChannel = (g_ActivePlayerChannel == 0) ? 1 : 0;
    if (g_UseProEngine)
      return g_BassEngine->LoadTrack(nextChannel, std::string(filepath), bpm);
    else
      return g_AudioEngine->LoadTrack(nextChannel, std::string(filepath), bpm);
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) bool DJ_Automix(int fadeMs, int curveType,
                                      int dropSwapMs = 0, int inSeekMs = 0) {
  try {
    int outCh = g_ActivePlayerChannel;
    int inCh = (g_ActivePlayerChannel == 0) ? 1 : 0;
    bool success = false;

    if (g_UseProEngine && g_BassEngine) {
      success = g_BassEngine->Crossfade(outCh, inCh, fadeMs, true, curveType,
                                        dropSwapMs, inSeekMs);
    } else if (g_AudioEngine) {
      success = g_AudioEngine->Crossfade(outCh, inCh, fadeMs, true, curveType,
                                         dropSwapMs, inSeekMs);
      if (success)
        g_AudioEngine->ChangeState(PLAYER_PLAYING);
    }

    if (success)
      g_ActivePlayerChannel = inCh;
    return success;
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) void Player_TogglePlay() {
  try {
    if (g_UseProEngine && g_BassEngine) {
      if (g_BassEngine->IsTrackPlaying(g_ActivePlayerChannel))
        g_BassEngine->PauseTrack(g_ActivePlayerChannel);
      else
        g_BassEngine->PlayTrack(g_ActivePlayerChannel);
    } else if (g_AudioEngine) {
      if (g_AudioEngine->IsTrackPlaying(g_ActivePlayerChannel)) {
        g_AudioEngine->PauseTrack(g_ActivePlayerChannel);
        g_AudioEngine->ChangeState(PLAYER_PAUSED);
      } else {
        g_AudioEngine->PlayTrack(g_ActivePlayerChannel);
        g_AudioEngine->ChangeState(PLAYER_PLAYING);
      }
    }
  } catch (...) {
  }
}

__declspec(dllexport) void Player_SetVolume(float volume) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackVolume(g_ActivePlayerChannel, volume);
    else if (g_AudioEngine)
      g_AudioEngine->SetTrackVolume(g_ActivePlayerChannel, volume);
  } catch (...) {
  }
}

__declspec(dllexport) void Player_SeekTo(float seconds) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SeekTrack(g_ActivePlayerChannel, seconds);
    else if (g_AudioEngine)
      g_AudioEngine->SeekTrack(g_ActivePlayerChannel, seconds);
  } catch (...) {
  }
}

__declspec(dllexport) float Player_GetDuration() {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetTrackDuration(g_ActivePlayerChannel);
    return g_AudioEngine
               ? g_AudioEngine->GetTrackDuration(g_ActivePlayerChannel)
               : 0.0f;
  } catch (...) {
    return 0.0f;
  }
}

__declspec(dllexport) float Player_GetPlaybackTime() {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetTrackTime(g_ActivePlayerChannel);
    return g_AudioEngine ? g_AudioEngine->GetTrackTime(g_ActivePlayerChannel)
                         : 0.0f;
  } catch (...) {
    return 0.0f;
  }
}

__declspec(dllexport) void Player_GetStats(char *outBuffer, int maxLength) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->GetStats(outBuffer, maxLength);
    else if (g_AudioEngine)
      g_AudioEngine->GetStats(outBuffer, maxLength);
  } catch (...) {
  }
}

__declspec(dllexport) void Player_SetLatency(int ms) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->ReinitAudioBackend(-1, ms);
    else if (g_AudioEngine)
      g_AudioEngine->SetLatency(ms);
  } catch (...) {
  }
}

// --- MIX STUDIO API ---
__declspec(dllexport) bool Mixer_LoadTrack(int channel, const char *filepath,
                                           float bpm) {
  try {
    if (channel < 0 || channel >= 4)
      return false;
    if (!g_AudioEngine || !g_BassEngine)
      Player_Init();
    if (!filepath)
      return false;

    if (g_UseProEngine)
      return g_BassEngine->LoadTrack(channel, std::string(filepath), bpm);
    return g_AudioEngine->LoadTrack(channel, std::string(filepath), bpm);
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) void Mixer_PlayTrack(int channel) {
  try {
    if (channel >= 0 && channel < 4)
      g_ActivePlayerChannel = channel;

    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->PlayTrack(channel);
    else if (g_AudioEngine)
      g_AudioEngine->PlayTrack(channel);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_PauseTrack(int channel) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->PauseTrack(channel);
    else if (g_AudioEngine)
      g_AudioEngine->PauseTrack(channel);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_StopTrack(int channel) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->StopTrack(channel);
    else if (g_AudioEngine)
      g_AudioEngine->StopTrack(channel);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SetVolume(int channel, float volume) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackVolume(channel, volume);
    else if (g_AudioEngine)
      g_AudioEngine->SetTrackVolume(channel, volume);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SetEq(int channel, float bassAmount,
                                       float midAmount, float highAmount) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackEq(channel, bassAmount, midAmount, highAmount);
    else if (g_AudioEngine)
      g_AudioEngine->SetTrackEq(channel, bassAmount, midAmount, highAmount);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SetFilters(int channel, float hpfAmount) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackFilters(channel, hpfAmount);
    else if (g_AudioEngine)
      g_AudioEngine->SetTrackFilters(channel, hpfAmount);
  } catch (...) {
  }
}
__declspec(dllexport) void Mixer_SetPitch(int channel, float pitch) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackPitch(channel, pitch);
    else if (g_AudioEngine)
      g_AudioEngine->SetTrackPitch(channel, pitch);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SetReverb(int channel, float level) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackReverb(channel, level);
    else if (g_AudioEngine)
      g_AudioEngine->SetTrackReverb(channel, level);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SeekTrack(int channel, float seconds) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SeekTrack(channel, seconds);
    else if (g_AudioEngine)
      g_AudioEngine->SeekTrack(channel, seconds);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SetEcho(int channel, float wet, float feedback,
                                         float delayMs) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackEcho(channel, wet, feedback, delayMs);
  } catch (...) {
  }
}

__declspec(dllexport) void Mixer_SetLoop(int channel, float startSec,
                                         float endSec) {
  try {
    if (g_UseProEngine && g_BassEngine)
      g_BassEngine->SetTrackLoop(channel, startSec, endSec);
  } catch (...) {
  }
}

__declspec(dllexport) float Mixer_GetTime(int channel) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetTrackTime(channel);
    return g_AudioEngine ? g_AudioEngine->GetTrackTime(channel) : 0.0f;
  } catch (...) {
    return 0.0f;
  }
}

__declspec(dllexport) float Mixer_GetDuration(int channel) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetTrackDuration(channel);
    return g_AudioEngine ? g_AudioEngine->GetTrackDuration(channel) : 0.0f;
  } catch (...) {
    return 0.0f;
  }
}

__declspec(dllexport) bool Mixer_IsPlaying(int channel) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->IsTrackPlaying(channel);
    return g_AudioEngine ? g_AudioEngine->IsTrackPlaying(channel) : false;
  } catch (...) {
    return false;
  }
}

__declspec(dllexport) int Mixer_GetWaveform(int channel, float *outBuffer,
                                            int maxLength) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetWaveform(channel, outBuffer, maxLength);
    return g_AudioEngine
               ? g_AudioEngine->GetWaveform(channel, outBuffer, maxLength)
               : 0;
  } catch (...) {
    return 0;
  }
}

__declspec(dllexport) float Mixer_GetLevel(int channel) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetLevel(channel);
    return 0.0f;
  } catch (...) {
    return 0.0f;
  }
}

__declspec(dllexport) int Mixer_GetFFT(int channel, float *outBuffer) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetFFT(channel, outBuffer);
    if (g_AudioEngine)
      return g_AudioEngine->GetTrackFFT(channel, outBuffer);
    return 0;
  } catch (...) {
    return 0;
  }
}

__declspec(dllexport) int Mixer_GetActiveFFT(float *outBuffer) {
  try {
    if (g_UseProEngine && g_BassEngine)
      return g_BassEngine->GetFFT(g_ActivePlayerChannel, outBuffer);
    if (g_AudioEngine && g_ActivePlayerChannel >= 0)
      return g_AudioEngine->GetTrackFFT(g_ActivePlayerChannel, outBuffer);
    return 0;
  } catch (...) {
    return 0;
  }
}

__declspec(dllexport) int Mixer_GetActiveChannel() {
  return g_ActivePlayerChannel;
}

// --- АНАЛИЗАТОР ---
__declspec(dllexport) int AI_AnalyzeLibrary(const char *inputPath) {
  try {
    if (!inputPath)
      return 0;
    std::lock_guard<std::mutex> lock(g_AnalyzerMutex);

    if (!g_Analyzer)
      g_Analyzer = std::make_unique<PeerifyAnalyzer>("music_library.json");

    std::vector<std::string> paths;
    paths.push_back(std::string(inputPath));
    return g_Analyzer->BuildLibrary(paths);
  } catch (...) {
    return 0;
  }
}

__declspec(dllexport) int AI_GetNextSimilar(const char *currentFilepath,
                                            char *outBuffer, int maxLength) {
  try {
    if (!currentFilepath || !outBuffer || maxLength <= 0)
      return 0;
    std::lock_guard<std::mutex> lock(g_AnalyzerMutex);

    if (!g_Analyzer)
      return 0;
    auto results = g_Analyzer->FindSimilar(std::string(currentFilepath), 1);
    if (results.empty())
      return 0;

    std::string nextFile = results[0].filepath;
    if (nextFile.length() >= (size_t)maxLength)
      return 0;

    strcpy_s(outBuffer, maxLength, nextFile.c_str());
    return (int)nextFile.length();
  } catch (...) {
    return 0;
  }
}

__declspec(dllexport) void AI_GetProgress(int *current, int *total) {
  try {
    std::lock_guard<std::mutex> lock(g_AnalyzerMutex);
    if (g_Analyzer) {
      g_Analyzer->GetProgress(current, total);
    } else {
      if (current) *current = 0;
      if (total) *total = 0;
    }
  } catch (...) {
    if (current) *current = 0;
    if (total) *total = 0;
  }
}

__declspec(dllexport) bool AI_GetTrackMetadata(const char *filepath,
                                               char *outBuffer, int maxLength) {
  try {
    if (!filepath || !outBuffer)
      return false;
    std::lock_guard<std::mutex> lock(g_AnalyzerMutex);
    if (!g_Analyzer)
      return false;

    TrackMetadata meta;
    if (g_Analyzer->GetTrackMetadata(std::string(filepath), meta)) {
      json j = {{"bpm", meta.bpm},
                {"duration", meta.duration_seconds},
                {"genre", meta.genre},
                {"intro_end", meta.intro_end},
                {"outro_start", meta.outro_start},
                {"drop_pos", meta.drop_pos},
                {"static_waveform", meta.static_waveform}};

      std::string s = j.dump();
      if (s.length() >= (size_t)maxLength)
        return false;

      strcpy_s(outBuffer, maxLength, s.c_str());
      return true;
    }
    return false;
  } catch (...) {
    return false;
  }
}
}