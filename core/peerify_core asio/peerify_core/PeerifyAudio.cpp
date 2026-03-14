#include "PeerifyAudio.h"
#include <algorithm>
#include <cmath>
#include <complex>
#include <iostream>
#include <stdio.h>
#include <thread>

static void analyzer_node_process_pcm_frames(ma_node *pNode,
                                             const float **ppFramesIn,
                                             ma_uint32 *pFrameCountIn,
                                             float **ppFramesOut,
                                             ma_uint32 *pFrameCountOut) {
  analyzer_node *pAnalyzer = (analyzer_node *)pNode;
  if (pAnalyzer->pEngine && pAnalyzer->channel >= 0 && ppFramesIn[0]) {
    ma_uint32 channelCount = ma_node_get_input_channels(pNode, 0);
    pAnalyzer->pEngine->CaptureFFTSamples(pAnalyzer->channel, ppFramesIn[0],
                                          *pFrameCountIn, channelCount);
  }
  ma_uint32 chCount = ma_node_get_output_channels(pNode, 0);
  ma_copy_pcm_frames(ppFramesOut[0], ppFramesIn[0], *pFrameCountOut,
                     ma_format_f32, chCount);
}

static ma_node_vtable analyzer_node_vtable = {
    analyzer_node_process_pcm_frames, NULL, 1, 1, MA_NODE_FLAG_PASSTHROUGH};

#ifdef _WIN32
#include <windows.h>
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
#endif

std::complex<float> PeerifyAudioEngine::fftTwiddles[512];
int PeerifyAudioEngine::fftBitRev[512];
bool PeerifyAudioEngine::fftTablesInitialized = false;

void PeerifyAudioEngine::EnsureFFTTables() {
  if (fftTablesInitialized) return;
  const int N = 512;
  // Pre-calculate bit-reversal
  for (int i = 0, j = 0; i < N; i++) {
    fftBitRev[i] = j;
    int bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
  }
  // Pre-calculate twiddles
  for (int len = 2; len <= N; len <<= 1) {
    float ang = 2.0f * 3.1415926535f / (float)len * -1.0f;
    fftTwiddles[len / 2] = std::complex<float>(std::cos(ang), std::sin(ang));
  }
  fftTablesInitialized = true;
}

PeerifyAudioEngine::PeerifyAudioEngine() {
  EnsureFFTTables();
  currentLatencyMs = 50;
  currentState.store(PLAYER_STOPPED);

  ma_engine_config engineConfig = ma_engine_config_init();
  engineConfig.periodSizeInMilliseconds = currentLatencyMs;
  isEngineInitialized = (ma_engine_init(&engineConfig, &engine) == MA_SUCCESS);

  for (int i = 0; i < MAX_CHANNELS; ++i) {
    channels[i].isInitialized = false;
    channels[i].hasEq = false;
  }
  if (isEngineInitialized)
    ma_engine_set_volume(&engine, 1.0f);
}

PeerifyAudioEngine::~PeerifyAudioEngine() {
  std::lock_guard<std::mutex> lock(audioMutex);
  if (!isEngineInitialized)
    return;
  for (int i = 0; i < MAX_CHANNELS; ++i)
    SafeUninit(i);
  ma_engine_uninit(&engine);
}

bool PeerifyAudioEngine::ReinitAudioBackend(bool exclusiveMode, int latencyMs,
                                            int deviceIndex) {
  return true;
}
void PeerifyAudioEngine::GetAudioDevices(char *outBuffer, int maxLength) {
  snprintf(outBuffer, maxLength, "[]");
}
void PeerifyAudioEngine::SetTrackReverb(int channel,
                                        float level) { /* BASS only */
}

void PeerifyAudioEngine::ChangeState(PlayerState newState) {
  currentState.store(newState);
  std::lock_guard<std::mutex> lock(eventMutex);
  PlayerEvent ev;
  ev.type = EVENT_STATE_CHANGED;
  ev.state = (int)newState;
  eventQueue.push(ev);
}

int PeerifyAudioEngine::GetState() { return currentState.load(); }

bool PeerifyAudioEngine::PollEvent(PlayerEvent *outEvent) {
  std::lock_guard<std::mutex> lock(eventMutex);
  if (eventQueue.empty())
    return false;
  *outEvent = eventQueue.front();
  eventQueue.pop();
  return true;
}

void PeerifyAudioEngine::SetEqFilters(int channel, float bassAmount,
                                      float midAmount, float highAmount) {
  if (channel < 0 || channel >= MAX_CHANNELS)
    return;
  ma_uint32 sr = ma_engine_get_sample_rate(&engine);
  if (sr == 0)
    sr = 44100;
  ma_uint32 chCount = ma_engine_get_channels(&engine);

  // BASS (Low Shelf @ 100Hz)
  float bassDb = bassAmount; // Treated as direct dB from JS
  if (channels[channel].hasEq) {
    double q = 0.707;
    double w0 = 2.0 * 3.14159265 * 100.0 / sr;
    double A = std::pow(10.0, bassDb / 40.0);
    double alpha = std::sin(w0) / (2.0 * q);
    double b0 =
        A * ((A + 1.0) - (A - 1.0) * std::cos(w0) + 2.0 * std::sqrt(A) * alpha);
    double b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * std::cos(w0));
    double b2 =
        A * ((A + 1.0) - (A - 1.0) * std::cos(w0) - 2.0 * std::sqrt(A) * alpha);
    double a0 =
        (A + 1.0) + (A - 1.0) * std::cos(w0) + 2.0 * std::sqrt(A) * alpha;
    double a1 = -2.0 * ((A - 1.0) + (A + 1.0) * std::cos(w0));
    double a2 =
        (A + 1.0) + (A - 1.0) * std::cos(w0) - 2.0 * std::sqrt(A) * alpha;
    ma_biquad_config cfg = ma_biquad_config_init(
        ma_format_f32, chCount, (float)(b0 / a0), (float)(b1 / a0),
        (float)(b2 / a0), 1.0f, (float)(a1 / a0), (float)(a2 / a0));
    ma_biquad_reinit(&cfg, &channels[channel].eq.biquad);
    ma_biquad_reinit(&cfg, &channels[channel].eq2.biquad);
  }

  // MID (Peaking @ 1kHz)
  float midDb = midAmount;
  if (channels[channel].isInitialized) {
    double q = 0.5; // Wider for mid
    double w0 = 2.0 * 3.14159265 * 1000.0 / sr;
    double A = std::pow(10.0, midDb / 40.0);
    double alpha = std::sin(w0) / (2.0 * q);
    double b0 = 1.0 + alpha * A;
    double b1 = -2.0 * std::cos(w0);
    double b2 = 1.0 - alpha * A;
    double a0 = 1.0 + alpha / A;
    double a1 = -2.0 * std::cos(w0);
    double a2 = 1.0 - alpha / A;
    ma_biquad_config cfg = ma_biquad_config_init(
        ma_format_f32, chCount, (float)(b0 / a0), (float)(b1 / a0),
        (float)(b2 / a0), 1.0f, (float)(a1 / a0), (float)(a2 / a0));
    ma_biquad_reinit(&cfg, &channels[channel].midEq.biquad);
    ma_biquad_reinit(&cfg, &channels[channel].midEq2.biquad);
  }

  // HIGH (High Shelf @ 8kHz)
  float highDb = highAmount;
  if (channels[channel].hasHighEq) {
    double q = 0.707;
    double w0 = 2.0 * 3.14159265 * 8000.0 / sr;
    double A = std::pow(10.0, highDb / 40.0);
    double alpha = std::sin(w0) / (2.0 * q);
    double b0 =
        A * ((A + 1.0) + (A - 1.0) * std::cos(w0) + 2.0 * std::sqrt(A) * alpha);
    double b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * std::cos(w0));
    double b2 =
        A * ((A + 1.0) + (A - 1.0) * std::cos(w0) - 2.0 * std::sqrt(A) * alpha);
    double a0 =
        (A + 1.0) - (A - 1.0) * std::cos(w0) + 2.0 * std::sqrt(A) * alpha;
    double a1 = 2.0 * ((A - 1.0) - (A + 1.0) * std::cos(w0));
    double a2 =
        (A + 1.0) - (A - 1.0) * std::cos(w0) - 2.0 * std::sqrt(A) * alpha;
    ma_biquad_config cfg = ma_biquad_config_init(
        ma_format_f32, chCount, (float)(b0 / a0), (float)(b1 / a0),
        (float)(b2 / a0), 1.0f, (float)(a1 / a0), (float)(a2 / a0));
    ma_biquad_reinit(&cfg, &channels[channel].highEq.biquad);
    ma_biquad_reinit(&cfg, &channels[channel].highEq2.biquad);
  }
}

void PeerifyAudioEngine::SafeUninit(int channel) {
  if (channel < 0 || channel >= MAX_CHANNELS)
    return;
  if (channels[channel].isInitialized) {
    if (ma_sound_is_playing(&channels[channel].sound))
      ma_sound_stop(&channels[channel].sound);
    ma_sound_uninit(&channels[channel].sound);
    if (channels[channel].hasEq) {
      ma_biquad_node_uninit(&channels[channel].eq, NULL);
      ma_biquad_node_uninit(&channels[channel].eq2, NULL);
      ma_biquad_node_uninit(&channels[channel].midEq, NULL);
      ma_biquad_node_uninit(&channels[channel].midEq2, NULL);
      channels[channel].hasEq = false;
    }
    if (channels[channel].hasHighEq) {
      ma_biquad_node_uninit(&channels[channel].highEq, NULL);
      ma_biquad_node_uninit(&channels[channel].highEq2, NULL);
      ma_biquad_node_uninit(&channels[channel].hpf, NULL);
      channels[channel].hasHighEq = false;
    }
    if (channels[channel].hasAnalyzer) {
      ma_node_uninit(&channels[channel].analyzer, NULL);
      channels[channel].hasAnalyzer = false;
    }
    channels[channel].isInitialized = false;
  }
}

bool PeerifyAudioEngine::LoadTrack(int channel, const std::string &filepath,
                                   float bpm) {
  std::lock_guard<std::mutex> lock(audioMutex);
  if (!isEngineInitialized || channel < 0 || channel >= MAX_CHANNELS)
    return false;

  SafeUninit(channel);
  ma_uint32 flags =
      MA_SOUND_FLAG_NO_SPATIALIZATION | MA_SOUND_FLAG_NO_DEFAULT_ATTACHMENT;

  ma_result initRes = MA_ERROR;
#ifdef _WIN32
  initRes =
      ma_sound_init_from_file_w(&engine, Utf8ToWide(filepath).c_str(), flags,
                                NULL, NULL, &channels[channel].sound);
#else
  initRes = ma_sound_init_from_file(&engine, filepath.c_str(), flags, NULL,
                                    NULL, &channels[channel].sound);
#endif

  if (initRes != MA_SUCCESS)
    return false;

  channels[channel].bpm = (bpm > 0.0f) ? bpm : 120.0f;
  channels[channel].isInitialized = true;
  channels[channel].hasEq = false;

  float headroom = 0.5f;
  ma_sound_set_volume(&channels[channel].sound,
                      channels[channel].targetVolume * headroom);
  ma_sound_set_pitch(&channels[channel].sound, 1.0f);

  ma_uint32 chCount = ma_engine_get_channels(&engine);
  ma_biquad_node_config eqConfig =
      ma_biquad_node_config_init(chCount, 1, 0, 0, 1, 0, 0);

  if (ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].eq) == MA_SUCCESS &&
      ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].eq2) == MA_SUCCESS &&
      ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].midEq) == MA_SUCCESS &&
      ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].midEq2) == MA_SUCCESS) {
    channels[channel].hasEq = true;
  }
  if (ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].highEq) == MA_SUCCESS &&
      ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].highEq2) == MA_SUCCESS &&
      ma_biquad_node_init(ma_engine_get_node_graph(&engine), &eqConfig, NULL,
                          &channels[channel].hpf) == MA_SUCCESS) {
    channels[channel].hasHighEq = true;
  }

  ma_uint32 engineChannels = ma_engine_get_channels(&engine);
  ma_node_config nodeConfig = ma_node_config_init();
  nodeConfig.vtable = &analyzer_node_vtable;
  nodeConfig.pInputChannels = &engineChannels;
  nodeConfig.pOutputChannels = &engineChannels;

  if (ma_node_init(ma_engine_get_node_graph(&engine), &nodeConfig, NULL,
                   &channels[channel].analyzer) == MA_SUCCESS) {
    analyzer_node *pAn = &channels[channel].analyzer;
    pAn->pEngine = this;
    pAn->channel = channel;
    channels[channel].hasAnalyzer = true;
  }

  ma_node *lastNode = (ma_node *)&channels[channel].sound;
  if (channels[channel].hasEq) {
    ma_node_attach_output_bus(lastNode, 0, &channels[channel].eq, 0);
    ma_node_attach_output_bus(&channels[channel].eq, 0, &channels[channel].eq2,
                              0);
    ma_node_attach_output_bus(&channels[channel].eq2, 0,
                              &channels[channel].midEq, 0);
    ma_node_attach_output_bus(&channels[channel].midEq, 0,
                              &channels[channel].midEq2, 0);
    lastNode = (ma_node *)&channels[channel].midEq2;
  }
  if (channels[channel].hasHighEq) {
    ma_node_attach_output_bus(lastNode, 0, &channels[channel].highEq, 0);
    ma_node_attach_output_bus(&channels[channel].highEq, 0,
                              &channels[channel].highEq2, 0);
    ma_node_attach_output_bus(&channels[channel].highEq2, 0,
                              &channels[channel].hpf, 0);
    lastNode = (ma_node *)&channels[channel].hpf;
  }
  if (channels[channel].hasAnalyzer) {
    ma_node_attach_output_bus(lastNode, 0, &channels[channel].analyzer, 0);
    lastNode = (ma_node *)&channels[channel].analyzer;
  }
  ma_node_attach_output_bus(lastNode, 0, ma_engine_get_endpoint(&engine), 0);

  ma_uint32 sampleRate;
  if (ma_sound_get_data_format(&channels[channel].sound, NULL, NULL,
                               &sampleRate, NULL, 0) == MA_SUCCESS) {
    ma_sound_seek_to_pcm_frame(&channels[channel].sound, 0);
  }

  channels[channel].waveformData.clear();
  int myLoadId = ++channels[channel].loadCount;
  std::string safePath = filepath;
  std::thread([this, channel, safePath, myLoadId]() {
    ma_decoder_config decConfig = ma_decoder_config_init(ma_format_f32, 1, 0);
    ma_decoder dec;
    ma_result res = MA_ERROR;
#ifdef _WIN32
    res =
        ma_decoder_init_file_w(Utf8ToWide(safePath).c_str(), &decConfig, &dec);
#else
    res = ma_decoder_init_file(safePath.c_str(), &decConfig, &dec);
#endif
    if (res == MA_SUCCESS) {
      ma_uint64 lengthFrames;
      ma_decoder_get_length_in_pcm_frames(&dec, &lengthFrames);
      if (lengthFrames > 0) {
        const int NUM_BINS = 500;
        ma_uint64 framesPerBin = lengthFrames / NUM_BINS;
        if (framesPerBin == 0)
          framesPerBin = 1;

        const ma_uint64 CHUNK_SIZE = 4096;
        std::vector<float> chunkBuf(CHUNK_SIZE);
        float maxPeak = 0.0f;
        std::vector<float> tempWave(NUM_BINS, 0.0f);

        for (int i = 0; i < NUM_BINS; i++) {
          if (channels[channel].loadCount != myLoadId) {
            ma_decoder_uninit(&dec);
            return;
          }

          ma_uint64 framesReadForBin = 0;
          float peakVal = 0.0f;
          while (framesReadForBin < framesPerBin) {
            ma_uint64 toRead =
                (std::min)(CHUNK_SIZE, framesPerBin - framesReadForBin);
            ma_uint64 readFrames = 0;
            ma_decoder_read_pcm_frames(&dec, chunkBuf.data(), toRead,
                                       &readFrames);
            if (readFrames == 0)
              break;
            for (ma_uint64 j = 0; j < readFrames; j++) {
              float absVal = std::abs(chunkBuf[j]);
              if (absVal > peakVal)
                peakVal = absVal;
            }
            framesReadForBin += readFrames;
          }
          tempWave[i] = peakVal;
          if (peakVal > maxPeak)
            maxPeak = peakVal;
        }
        if (maxPeak > 0.0001f) {
          for (int i = 0; i < NUM_BINS; i++)
            tempWave[i] = std::pow(tempWave[i] / maxPeak, 0.8f);
        }
        {
          std::lock_guard<std::mutex> lock(audioMutex);
          if (channels[channel].isInitialized &&
              channels[channel].loadCount == myLoadId)
            channels[channel].waveformData = tempWave;
        }
      }
      ma_decoder_uninit(&dec);
    }
  }).detach();

  return true;
}

bool PeerifyAudioEngine::Crossfade(int outChannel, int inChannel, int fadeMs,
                                   bool syncBpm, int curveType, int dropSwapMs,
                                   int inSeekMs) {
  if (!isEngineInitialized)
    return false;

  float phaseOffsetSec = 0.0f;

  if (outChannel >= 0 && outChannel < MAX_CHANNELS &&
      channels[outChannel].isInitialized) {
    float outBpm = channels[outChannel].bpm;
    if (outBpm > 10.0f)
      phaseOffsetSec = (float)std::fmod((double)GetTrackTime(outChannel),
                                        60.0 / (double)outBpm);
  }

  if (inChannel >= 0 && inChannel < MAX_CHANNELS &&
      channels[inChannel].isInitialized) {
    if (syncBpm && outChannel >= 0 && channels[outChannel].isInitialized) {
      ma_uint32 sr;
      if (ma_sound_get_data_format(&channels[inChannel].sound, NULL, NULL, &sr,
                                   NULL, 0) == MA_SUCCESS) {
        float finalSeekSec =
            (inSeekMs > 0) ? ((float)inSeekMs / 1000.0f) : phaseOffsetSec;
        ma_uint64 seekFrames = (ma_uint64)(finalSeekSec * sr);
        ma_sound_seek_to_pcm_frame(&channels[inChannel].sound, seekFrames);
      }
      // USER REGULATION: Do NOT auto-pitch in crossfade (maintain natural
      // pitch) float pitchRatio = channels[outChannel].bpm /
      // channels[inChannel].bpm; if (pitchRatio > 0.85f && pitchRatio < 1.15f)
      // ma_sound_set_pitch(&channels[inChannel].sound, pitchRatio);
    }

    ma_sound_set_volume(&channels[inChannel].sound, 0.0f);
    ma_sound_start(&channels[inChannel].sound);
  }

  return true;
}

void PeerifyAudioEngine::PlayTrack(int channel) {
  std::lock_guard<std::mutex> lock(audioMutex);
  if (channels[channel].isInitialized) {
    float headroom = 0.5f;
    ma_sound_set_volume(&channels[channel].sound,
                        channels[channel].targetVolume * headroom);
    ma_sound_start(&channels[channel].sound);
    ChangeState(PLAYER_PLAYING);
  }
}

void PeerifyAudioEngine::PauseTrack(int channel) {
  if (channels[channel].isInitialized)
    ma_sound_stop(&channels[channel].sound);
}

void PeerifyAudioEngine::StopTrack(int channel) {
  if (channels[channel].isInitialized) {
    ma_sound_stop(&channels[channel].sound);
    ma_sound_seek_to_pcm_frame(&channels[channel].sound, 0);
  }
}

void PeerifyAudioEngine::SetTrackVolume(int channel, float volume) {
  if (channels[channel].isInitialized) {
    channels[channel].targetVolume = volume;
    float headroom = 0.5f;
    ma_sound_set_volume(&channels[channel].sound, volume * headroom);
  }
}

void PeerifyAudioEngine::SeekTrack(int channel, float seconds) {
  if (channels[channel].isInitialized) {
    ma_uint32 sr;
    if (ma_sound_get_data_format(&channels[channel].sound, NULL, NULL, &sr,
                                 NULL, 0) == MA_SUCCESS)
      ma_sound_seek_to_pcm_frame(&channels[channel].sound,
                                 (ma_uint64)(seconds * sr));
  }
}

void PeerifyAudioEngine::SetTrackPitch(int channel, float pitch) {
  if (channels[channel].isInitialized)
    ma_sound_set_pitch(&channels[channel].sound, pitch);
}

void PeerifyAudioEngine::SetTrackEq(int channel, float bassAmount,
                                    float midAmount, float highAmount) {
  SetEqFilters(channel, bassAmount, midAmount, highAmount);
}

void PeerifyAudioEngine::SetTrackFilters(int channel, float hpfAmount) {
  if (channel < 0 || channel >= MAX_CHANNELS ||
      !channels[channel].isInitialized)
    return;
  ma_uint32 sr = ma_engine_get_sample_rate(&engine);
  if (sr == 0)
    sr = 44100;
  ma_uint32 chCount = ma_engine_get_channels(&engine);

  // Pro Engine HPF Simulation logic ported to Miniaudio
  if (hpfAmount <= 0.01f) {
    ma_biquad_config cfg = ma_biquad_config_init(ma_format_f32, chCount, 1.0f,
                                                 0.0f, 0.0f, 1.0f, 0.0f, 0.0f);
    ma_biquad_reinit(&cfg, &channels[channel].hpf.biquad);
  } else {
    // Peaking filter as HPF simulation (cut lows)
    float fCenter = 80.0f + (hpfAmount * 800.0f);
    float fGain = -30.0f * hpfAmount;
    double q = 0.5;
    double w0 = 2.0 * 3.14159265 * fCenter / sr;
    double A = std::pow(10.0, fGain / 40.0);
    double alpha = std::sin(w0) / (2.0 * q);
    double b0 = 1.0 + alpha * A;
    double b1 = -2.0 * std::cos(w0);
    double b2 = 1.0 - alpha * A;
    double a0 = 1.0 + alpha / A;
    double a1 = -2.0 * std::cos(w0);
    double a2 = 1.0 - alpha / A;

    ma_biquad_config cfg = ma_biquad_config_init(
        ma_format_f32, chCount, (float)(b0 / a0), (float)(b1 / a0),
        (float)(b2 / a0), 1.0f, (float)(a1 / a0), (float)(a2 / a0));
    ma_biquad_reinit(&cfg, &channels[channel].hpf.biquad);
  }
}

float PeerifyAudioEngine::GetTrackDuration(int channel) {
  if (!channels[channel].isInitialized)
    return 0.0f;
  ma_uint64 len;
  ma_sound_get_length_in_pcm_frames(&channels[channel].sound, &len);
  ma_uint32 sr;
  ma_sound_get_data_format(&channels[channel].sound, NULL, NULL, &sr, NULL, 0);
  return sr > 0 ? (float)len / sr : 0.0f;
}

float PeerifyAudioEngine::GetTrackTime(int channel) {
  if (!channels[channel].isInitialized)
    return 0.0f;
  ma_uint64 cur;
  ma_sound_get_cursor_in_pcm_frames(&channels[channel].sound, &cur);
  ma_uint32 sr;
  ma_sound_get_data_format(&channels[channel].sound, NULL, NULL, &sr, NULL, 0);
  return sr > 0 ? (float)cur / sr : 0.0f;
}

bool PeerifyAudioEngine::IsTrackPlaying(int channel) {
  return channels[channel].isInitialized &&
         ma_sound_is_playing(&channels[channel].sound);
}

float PeerifyAudioEngine::GetTrackBpm(int channel) {
  return channels[channel].bpm;
}

void PeerifyAudioEngine::GetStats(char *outBuffer, int maxLength) {
  if (!isEngineInitialized || !outBuffer)
    return;
  int sr = ma_engine_get_sample_rate(&engine);
  snprintf(outBuffer, maxLength,
           "{\"sampleRate\":%d,\"latencyMs\":%d,\"backend\":\"Native "
           "API\",\"exclusive\":false}",
           sr, currentLatencyMs);
}

void PeerifyAudioEngine::SetLatency(int ms) {
  std::lock_guard<std::mutex> lock(audioMutex);
  currentLatencyMs = ms >= 10 ? (ms <= 200 ? ms : 200) : 10;

  if (isEngineInitialized) {
    for (int i = 0; i < MAX_CHANNELS; ++i)
      SafeUninit(i);
    ma_engine_uninit(&engine);

    ma_engine_config engineConfig = ma_engine_config_init();
    engineConfig.periodSizeInMilliseconds = currentLatencyMs;
    isEngineInitialized =
        (ma_engine_init(&engineConfig, &engine) == MA_SUCCESS);
    if (isEngineInitialized) {
      ma_engine_set_volume(&engine, 1.0f);
    }
  }
}

int PeerifyAudioEngine::GetWaveform(int channel, float *outBuffer,
                                    int maxLength) {
  if (channel < 0 || channel >= MAX_CHANNELS || !outBuffer || maxLength <= 0)
    return 0;
  std::lock_guard<std::mutex> lock(audioMutex);
  if (channels[channel].waveformData.empty())
    return 0;
  int toCopy =
      (std::min)((int)channels[channel].waveformData.size(), maxLength);
  for (int i = 0; i < toCopy; i++)
    outBuffer[i] = channels[channel].waveformData[i];
  return toCopy;
}

void PeerifyAudioEngine::CaptureFFTSamples(int channel, const float *pSamples,
                                           ma_uint32 frameCount,
                                           ma_uint32 channelCount) {
  if (channel < 0 || channel >= MAX_CHANNELS || !pSamples || channelCount == 0)
    return;

  // 1. Accumulate mono samples efficiently
  for (ma_uint32 i = 0; i < frameCount; i++) {
    float monoSample = 0.0f;
    for (ma_uint32 c = 0; c < channelCount; c++)
      monoSample += pSamples[i * channelCount + c];
    monoSample /= (float)channelCount;
    channels[channel].fftCaptureBuffer.push_back(monoSample);
  }

  // 2. Limit buffer size
  const size_t N = 512;
  const size_t maxBufferSize = 2048;
  if (channels[channel].fftCaptureBuffer.size() > maxBufferSize) {
    size_t overflow = channels[channel].fftCaptureBuffer.size() - maxBufferSize;
    std::memmove(channels[channel].fftCaptureBuffer.data(),
                 channels[channel].fftCaptureBuffer.data() + overflow,
                 maxBufferSize * sizeof(float));
    channels[channel].fftCaptureBuffer.resize(maxBufferSize);
  }

  // 3. DO WE HAVE ENOUGH FOR A NEW FFT?
  // We do this check every few frames or when buffer is ready
  if (channels[channel].fftCaptureBuffer.size() >= N) {
    // Perform complex math HERE in the audio callback thread
    std::vector<std::complex<float>> a(N);
    size_t startIdx = channels[channel].fftCaptureBuffer.size() - N;
    
    for (int i = 0; i < N; i++) {
      float hanning = 0.5f * (1.0f - std::cos(2.0f * 3.14159265f * (float)i / (float)(N - 1)));
      a[i] = std::complex<float>(channels[channel].fftCaptureBuffer[startIdx + i] * hanning, 0.0f);
    }

    // Optimized Iterative FFT using pre-calculated tables
    for (int i = 0; i < N; i++) {
      int rev = fftBitRev[i];
      if (i < rev) std::swap(a[i], a[rev]);
    }

    for (int len = 2; len <= N; len <<= 1) {
      std::complex<float> wlen = fftTwiddles[len / 2];
      for (int i = 0; i < N; i += len) {
        std::complex<float> w(1, 0);
        for (int j = 0; j < len / 2; j++) {
          std::complex<float> u = a[i + j], v = a[i + j + len / 2] * w;
          a[i + j] = u + v;
          a[i + j + len / 2] = u - v;
          w *= wlen;
        }
      }
    }

    // Cache the magnitudes for fast UI retrieval
    {
      std::lock_guard<std::mutex> lock(channels[channel].fftMutex);
      for (int i = 0; i < 256; i++) {
        float mag = 4.0f * std::abs(a[i]) / (float)N;
        if (i < 8) mag *= (1.5f - (float)i * 0.05f); // Bass boost for visualizer
        channels[channel].cachedFFT[i] = mag;
      }
      channels[channel].hasFFTData.store(true);
    }
  }
}

int PeerifyAudioEngine::GetTrackFFT(int channel, float *outBuffer) {
  if (channel < 0 || channel >= MAX_CHANNELS || !outBuffer)
    return 0;
  
  if (!channels[channel].hasFFTData.load())
    return 0;

  std::lock_guard<std::mutex> lock(channels[channel].fftMutex);
  std::memcpy(outBuffer, channels[channel].cachedFFT, 256 * sizeof(float));
  return 256;
}
