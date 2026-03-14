#pragma once
#include "bass.h"
#include "bass_vst.h"
#include <atomic>
#include <mutex>
#include <string>
#include <vector>

class PeerifyBassEngine {
public:
  PeerifyBassEngine();
  ~PeerifyBassEngine();

  bool ReinitAudioBackend(int deviceIndex = -1, int latencyMs = 50);
  void GetAudioDevices(char *outBuffer, int maxLength);

  bool LoadTrack(int channel, const std::string &filepath, float bpm = 120.0f);
  void PlayTrack(int channel);
  void PauseTrack(int channel);
  void StopTrack(int channel);
  void SetTrackVolume(int channel, float volume);
  void SeekTrack(int channel, float seconds);
  void SetTrackPitch(int channel, float pitch);
  void SetTrackEq(int channel, float bassAmount, float midAmount,
                  float highAmount);
  void SetTrackReverb(int channel, float level);
  void SetTrackFilters(int channel, float hpfAmount);
  void SetTrackEcho(int channel, float wet, float feedback, float delayMs);
  void SetTrackLoop(int channel, float startSec, float endSec);
  void SetNormalization(bool enabled);

  bool LoadVstPlugin(int channel, const std::string &dllPath);
  void RemoveVstPlugin(int channel);
  void OpenVstEditor();

  bool Crossfade(int outChannel, int inChannel, int fadeMs, bool syncBpm,
                 int curveType = 0, int dropSwapMs = 0, int inSeekMs = 0);

  float GetTrackTime(int channel);
  float GetTrackDuration(int channel);
  bool IsTrackPlaying(int channel);
  float GetTrackBpm(int channel);

  void GetStats(char *outBuffer, int maxLength);
  int GetWaveform(int channel, float *outBuffer, int maxLength);
  float GetLevel(int channel);
  int GetFFT(int channel, float *outBuffer);
  int GetState();

private:
  bool isEngineInitialized = false;
  int currentDeviceIndex = -1;

  struct BassChannel {
    HSTREAM handle = 0;
    HFX eqHandles[1] = {0};     // Bass
    HFX midEqHandles[1] = {0};  // Mid
    HFX highEqHandles[1] = {0}; // High
    HFX hpfHandle = 0;          // High Pass
    HFX reverbHandle = 0;
    HFX echoHandle = 0;
    HFX compHandle = 0;
    HFX normHandle = 0;
    DWORD vstHandle = 0;

    bool isInitialized = false;
    float bpm = 120.0f;
    float targetVolume = 1.0f;
    float reverbLevel = 0.0f;
    float pitch = 1.0f;
    std::vector<float> waveformData;
    std::wstring cachedWidePath;
    std::atomic<bool> hasWaveform{false};
    std::atomic<int> loadCount{0};
  };

  BassChannel channels[4];
  std::mutex audioMutex;
  std::atomic<int> currentState;

  std::atomic<bool> normalizationEnabled{false};
  void SafeUninit(int channel);
  void GenerateWaveform(int channel, const std::wstring &filepath, int loadId);
};