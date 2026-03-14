#pragma once
#include "miniaudio.h"
#include <atomic>
#include <complex>
#include <mutex>
#include <queue>
#include <string>
#include <vector>

class PeerifyAudioEngine;

typedef struct {
  ma_node_base base;
  PeerifyAudioEngine *pEngine;
  int channel;
} analyzer_node;

const int MAX_CHANNELS = 4;

enum PlayerState {
  PLAYER_UNINITIALIZED = 0,
  PLAYER_STOPPED = 1,
  PLAYER_PLAYING = 2,
  PLAYER_PAUSED = 3,
  PLAYER_AUTOMIXING = 4
};

struct PlayerEvent {
  int type;
  int state;
};
const int EVENT_STATE_CHANGED = 1;

class PeerifyAudioEngine {
public:
  PeerifyAudioEngine();
  ~PeerifyAudioEngine();

  bool ReinitAudioBackend(bool exclusiveMode, int latencyMs,
                          int deviceIndex = -1);
  void GetAudioDevices(char *outBuffer, int maxLength);
  void SetTrackReverb(int channel, float level);

  bool LoadTrack(int channel, const std::string &filepath, float bpm = 120.0f);
  void PlayTrack(int channel);
  void PauseTrack(int channel);
  void StopTrack(int channel);
  void SetTrackVolume(int channel, float volume);
  void SeekTrack(int channel, float seconds);
  void SetTrackPitch(int channel, float pitch);
  void SetTrackEq(int channel, float bassAmount, float midAmount,
                  float highAmount);
  void SetTrackFilters(int channel, float hpfAmount);

  bool Crossfade(int outChannel, int inChannel, int fadeMs, bool syncBpm,
                 int curveType = 0, int dropSwapMs = 0, int inSeekMs = 0);

  float GetTrackTime(int channel);
  float GetTrackDuration(int channel);
  bool IsTrackPlaying(int channel);
  float GetTrackBpm(int channel);
  int GetTrackFFT(int channel, float *outBuffer);

  void GetStats(char *outBuffer, int maxLength);
  void SetLatency(int ms);
  int GetWaveform(int channel, float *outBuffer, int maxLength);

  int GetState();
  bool PollEvent(PlayerEvent *outEvent);
  void ChangeState(PlayerState newState);
  void CaptureFFTSamples(int channel, const float *pSamples,
                         ma_uint32 frameCount, ma_uint32 channelCount);

private:
  ma_engine engine;
  bool isEngineInitialized;
  int currentLatencyMs;

  struct AudioChannel {
    ma_sound sound;
    ma_biquad_node eq;
    ma_biquad_node eq2;
    ma_biquad_node midEq;
    ma_biquad_node midEq2;
    ma_biquad_node highEq;
    ma_biquad_node highEq2;
    ma_biquad_node hpf;
    analyzer_node analyzer;
    bool isInitialized = false;
    bool hasEq = false;
    bool hasHighEq = false;
    bool hasAnalyzer = false;
    float bpm = 120.0f;
    float targetVolume = 1.0f;
    std::vector<float> waveformData;
    float cachedFFT[256] = {0};
    std::atomic<bool> hasFFTData{false};
    std::vector<float> fftCaptureBuffer;
    std::mutex fftMutex;
    std::atomic<int> loadCount{0};
  };

  AudioChannel channels[MAX_CHANNELS];
  std::mutex audioMutex;

  std::atomic<int> currentState;
  std::mutex eventMutex;
  std::queue<PlayerEvent> eventQueue;
  
  static std::complex<float> fftTwiddles[512];
  static int fftBitRev[512];
  static bool fftTablesInitialized;
  void EnsureFFTTables();

  void SafeUninit(int channel);
  void SetEqFilters(int channel, float bassAmount, float midAmount,
                    float highAmount);
};