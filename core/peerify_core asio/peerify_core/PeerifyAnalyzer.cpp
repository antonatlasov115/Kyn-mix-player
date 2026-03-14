#define _SILENCE_CXX20_U8PATH_DEPRECATION_WARNING
#include "PeerifyAnalyzer.h"
#include "json.hpp"
#include "miniaudio.h"
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <future>
#include <iostream>
#include <numeric>

namespace fs = std::filesystem;
using json = nlohmann::json;

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

static std::string WideToUtf8(const std::wstring &wstr) {
  if (wstr.empty())
    return "";
  int size =
      WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, NULL, 0, NULL, NULL);
  std::string result(size, 0);
  WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &result[0], size, NULL,
                      NULL);
  if (result.back() == '\0')
    result.pop_back();
  return result;
}
#endif

const float PI = 3.14159265358979323846f;

void PeerifyAnalyzer::ComputeFFTIterative(std::vector<std::complex<float>> &a) {
  int n = (int)a.size();
  for (int i = 1, j = 0; i < n; i++) {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1)
      j ^= bit;
    j ^= bit;
    if (i < j)
      std::swap(a[i], a[j]);
  }
  for (int len = 2; len <= n; len <<= 1) {
    float angle = -2.0f * PI / len;
    std::complex<float> wlen(std::cos(angle), std::sin(angle));
    for (int i = 0; i < n; i += len) {
      std::complex<float> w(1.0f, 0.0f);
      for (int j = 0; j < len / 2; j++) {
        std::complex<float> u = a[i + j], v = a[i + j + len / 2] * w;
        a[i + j] = u + v;
        a[i + j + len / 2] = u - v;
        w *= wlen;
      }
    }
  }
}

std::string PeerifyAnalyzer::ClassifyGenre(float bpm,
                                           const std::vector<float> &f) {
  if (f.size() < 25)
    return "DSP-READY";

  // f[0-7]: Bass, f[8-15]: Mids, f[16-23]: Highs, f[24]: RMS
  float subBass = f[0] + f[1] + f[2];
  float midBass = f[3] + f[4] + f[5];
  float lowMids = f[6] + f[7] + f[8] + f[9];
  float highMids = f[10] + f[11] + f[12] + f[13] + f[14] + f[15];
  float highs = f[16] + f[17] + f[18] + f[19] + f[20] + f[21] + f[22] + f[23];
  float rms = f[24];

  float total = subBass + midBass + lowMids + highMids + highs + 0.00001f;
  float subRatio = subBass / total;
  float mbRatio = midBass / total;
  float highRatio = highs / total;
  float midRatio = (lowMids + highMids) / total;

  // PHONK Detection (High Mids Cowbells + High RMS/Compression)
  if (bpm >= 140.0f && bpm <= 165.0f && highMids > highs && rms > 0.14f) {
    return "phonk";
  }

  // DUBSTEP / TRAP (Heavy Sub-Bass + specific BPM)
  if ((bpm >= 65.0f && bpm <= 80.0f) || (bpm >= 135.0f && bpm <= 150.0f)) {
    if (subRatio > 0.30f)
      return "dubstep";
    if (mbRatio > 0.25f && highRatio > 0.20f)
      return "trap";
  }

  // DRUM & BASS (Fast BPM + High-end activity)
  if (bpm >= 160.0f && bpm <= 185.0f) {
    if (subRatio > 0.20f || highRatio > 0.15f)
      return "drum_and_bass";
    return "drum_and_bass";
  }

  // HOUSE / TECHNO (Standard 4/4 BPM range)
  if (bpm >= 115.0f && bpm <= 135.0f) {
    if (mbRatio > 0.30f && subRatio > 0.10f)
      return "techno";
    if (midRatio > 0.40f)
      return "house";
    return "house";
  }

  // HIP-HOP / LO-FI (Slow/Mid BPM)
  if (bpm >= 70.0f && bpm < 115.0f) {
    if (rms > 0.10f && mbRatio > 0.25f)
      return "hip-hop";
    return "lo-fi";
  }

  // AMBIENT / CLASSICAL (Low Energy / Specific Ratios)
  if (rms < 0.08f) {
    if (highRatio > 0.35f)
      return "ambient";
    return "classical";
  }

  if (midRatio > 0.45f)
    return "pop";
  if (highRatio > 0.35f)
    return "synthwave";

  return "Unknown";
}

void PeerifyAnalyzer::LoadDatabase() {
  std::lock_guard<std::mutex> lock(db_mutex);
  try {
    library_data.clear();
    if (!fs::exists(database_path))
      return;
    std::ifstream f(database_path);
    json j;
    f >> j;
    for (auto &[key, val] : j.items()) {
      TrackMetadata tm;
      tm.filepath = val.value("filepath", "");
      tm.filename = val.value("filename", "");
      tm.bpm = val.value("bpm", 120.0f);
      tm.genre = val.value("genre", "Unknown");
      tm.duration_seconds = val.value("duration_seconds", 0.0f);
      tm.intro_end = val.value("intro_end", 0.0f);
      tm.outro_start = val.value("outro_start", 0.0f);
      tm.drop_pos = val.value("drop_pos", 0.0f);
      if (val.contains("fingerprint")) {
        for (auto &fp : val["fingerprint"])
          tm.fingerprint.push_back(fp.get<float>());
      }
      if (val.contains("static_waveform")) {
        for (auto &sw : val["static_waveform"])
          tm.static_waveform.push_back(sw.get<float>());
      }
      library_data[key] = tm;
    }
  } catch (...) {
  }
}

void PeerifyAnalyzer::SaveDatabase() {
  std::lock_guard<std::mutex> lock(db_mutex);
  try {
    json j;
    for (const auto &[key, meta] : library_data) {
      j[key] = {{"filepath", meta.filepath},
                {"filename", meta.filename},
                {"bpm", meta.bpm},
                {"genre", meta.genre},
                {"duration_seconds", meta.duration_seconds},
                {"intro_end", meta.intro_end},
                {"outro_start", meta.outro_start},
                {"drop_pos", meta.drop_pos},
                {"fingerprint", meta.fingerprint},
                {"static_waveform", meta.static_waveform}};
    }

    std::string json_str =
        j.dump(2, ' ', false, json::error_handler_t::replace);
    std::ofstream f(database_path);
    f << json_str;
  } catch (...) {
  }
}

int PeerifyAnalyzer::BuildLibrary(const std::vector<std::string> &inputPaths) {
  if (inputPaths.size() == 1 && inputPaths[0] == "SYNC_DB_CMD") {
    LoadDatabase();
    return 0;
  }

  std::vector<std::string> filesToProcess;

  for (const auto &pathStr : inputPaths) {
    try {
#ifdef _WIN32
      fs::path p(Utf8ToWide(pathStr));
#else
      fs::path p(pathStr);
#endif
      if (fs::is_regular_file(p)) {
        auto ext = p.extension().string();
        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        if (ext == ".mp3" || ext == ".wav" || ext == ".flac" ||
            ext == ".m4a" || ext == ".ogg" || ext == ".aac" ||
            ext == ".wma" || ext == ".aiff") {
          filesToProcess.push_back(
#ifdef _WIN32
              WideToUtf8(p.wstring())
#else
              p.string()
#endif
          );
        }
      } else if (fs::is_directory(p)) {
        for (const auto &entry : fs::recursive_directory_iterator(
                 p, fs::directory_options::skip_permission_denied)) {
          if (entry.is_regular_file()) {
            auto ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
            if (ext == ".mp3" || ext == ".wav" || ext == ".flac" ||
                ext == ".m4a" || ext == ".ogg" || ext == ".aac" ||
                ext == ".wma" || ext == ".aiff") {
              filesToProcess.push_back(
#ifdef _WIN32
                  WideToUtf8(entry.path().wstring())
#else
                  entry.path().string()
#endif
              );
            }
          }
        }
      }
    } catch (...) {
      continue;
    }
  }

  total_files.store((int)filesToProcess.size());
  current_progress.store(0);
  std::atomic<int> addedCount{0};

  int max_threads = std::thread::hardware_concurrency();
  if (max_threads <= 0)
    max_threads = 4;

  std::vector<std::future<void>> futures;

  for (const auto &file : filesToProcess) {
    if (futures.size() >= (size_t)max_threads) {
      bool space_freed = false;
      while (!space_freed) {
        for (auto it = futures.begin(); it != futures.end();) {
          if (it->wait_for(std::chrono::milliseconds(0)) ==
              std::future_status::ready) {
            it = futures.erase(it);
            space_freed = true;
            break;
          } else {
            ++it;
          }
        }
        if (!space_freed)
          std::this_thread::sleep_for(std::chrono::milliseconds(10));
      }
    }

    futures.push_back(
        std::async(std::launch::async, [this, file, &addedCount]() {
          try {
            std::string normPath = file;
            std::replace(normPath.begin(), normPath.end(), '\\', '/');

            bool skip = false;
            {
              std::lock_guard<std::mutex> lock(db_mutex);
              auto it = library_data.find(normPath);
              if (it != library_data.end()) {
                if (!it->second.static_waveform.empty()) {
                  skip = true;
                }
              }
            }

            if (!skip) {
              TrackMetadata meta;
              AnalyzeSegments(file, meta);
              if (meta.duration_seconds > 0) {
                std::lock_guard<std::mutex> lock(db_mutex);
                library_data[normPath] = meta;
                addedCount++;
              }
            }
          } catch (...) {
          }
          current_progress++;
        }));
  }

  for (auto &f : futures)
    f.wait();

  if (addedCount > 0)
    SaveDatabase();
  return addedCount.load();
}

void PeerifyAnalyzer::AnalyzeSegments(const std::string &filepath,
                                      TrackMetadata &meta) {
  ma_decoder_config config = ma_decoder_config_init(ma_format_f32, 1, 0);
  ma_decoder decoder;

  ma_result result;
#ifdef _WIN32
  result =
      ma_decoder_init_file_w(Utf8ToWide(filepath).c_str(), &config, &decoder);
#else
  result = ma_decoder_init_file(filepath.c_str(), &config, &decoder);
#endif

  if (result != MA_SUCCESS) {
    meta.duration_seconds = 0;
    return;
  }

  // RAII Гарантия закрытия файла
  struct DecoderGuard {
    ma_decoder *d;
    ~DecoderGuard() { ma_decoder_uninit(d); }
  } guard{&decoder};

  try {
    meta.filepath = filepath;
    fs::path p = fs::u8path(filepath);
#ifdef _WIN32
    meta.filename = WideToUtf8(p.filename().wstring());
#else
    meta.filename = p.filename().string();
#endif

    meta.sample_rate = decoder.outputSampleRate;
    if (meta.sample_rate <= 0)
      meta.sample_rate = 44100;

    ma_uint64 totalFrames;
    ma_decoder_get_length_in_pcm_frames(&decoder, &totalFrames);
    meta.duration_seconds = (float)totalFrames / meta.sample_rate;

    float stepSeconds = 0.5f;
    ma_uint64 framesPerStep = (ma_uint64)(stepSeconds * meta.sample_rate);
    if (framesPerStep == 0)
      framesPerStep = 1;

    std::vector<float> stepBuffer(framesPerStep);

    ma_decoder_seek_to_pcm_frame(&decoder, 0);
    std::vector<float> energyProfile;
    std::vector<float> bassProfile;
    energyProfile.reserve((size_t)(meta.duration_seconds / stepSeconds) + 1);
    bassProfile.reserve((size_t)(meta.duration_seconds / stepSeconds) + 1);

    const int N_FFT = 1024;
    std::vector<std::complex<float>> fftData(N_FFT);

    float totalEnergySum = 0.0f;
    while (true) {
      ma_uint64 read = 0;
      ma_decoder_read_pcm_frames(&decoder, stepBuffer.data(), framesPerStep,
                                 &read);
      if (read == 0)
        break;

      float maxPeak = 0.0f;

      // Peak Amplitude detection (as requested)
      for (ma_uint64 i = 0; i < read; i++) {
        float absVal = std::abs(stepBuffer[i]);
        if (absVal > maxPeak) maxPeak = absVal;
      }
      energyProfile.push_back(maxPeak);
      totalEnergySum += maxPeak;

      float bSum = 0.0f;
      // Bass energy (below ~150Hz) via FFT on the first 1024 samples of the
      // step
      if (read >= N_FFT) {
        for (int i = 0; i < N_FFT; i++) {
          float multiplier =
              0.5f * (1.0f - std::cos(2.0f * PI * i / (N_FFT - 1)));
          fftData[i] = std::complex<float>(stepBuffer[i] * multiplier, 0.0f);
        }
        ComputeFFTIterative(fftData);
        // Calculate bass energy up to 150Hz
        int maxBin = (int)(150.0f * N_FFT / meta.sample_rate);
        if (maxBin < 1)
          maxBin = 1;
        for (int i = 1; i <= maxBin && i < N_FFT / 2; i++) {
          bSum += std::abs(fftData[i]);
        }
        bassProfile.push_back(bSum / (float)maxBin);
      } else {
        bassProfile.push_back(0.0f);
      }

      ma_uint64 cursor = 0;
      ma_decoder_get_cursor_in_pcm_frames(&decoder, &cursor);
      if (cursor >= totalFrames)
        break;
      if (energyProfile.size() > 5000)
        break;
    }

    if (energyProfile.empty())
      return;

    float avgEnergy = totalEnergySum / energyProfile.size();
    float maxEnergy = 0.001f;
    for (float e : energyProfile)
      if (e > maxEnergy)
        maxEnergy = e;

    // 1. Improved Intro End: Find where the track actually starts
    meta.intro_end = 0.0f;
    for (int i = 0; i < (int)energyProfile.size(); i++) {
      if (energyProfile[i] > avgEnergy * 0.25f) {
        meta.intro_end = i * stepSeconds;
        break;
      }
    }
    if (meta.intro_end > 30.0f)
      meta.intro_end = 10.0f; // Fallback

    // 2. Advanced Drop Detection: Bass Surges and Breakdown detection
    float bestDropScore = -1.0f;
    meta.drop_pos = meta.intro_end + 15.0f;
    int searchLimit = (int)(energyProfile.size() * 0.70f);

    for (int i = (int)(meta.intro_end / stepSeconds) + 10; i < searchLimit - 20;
         i++) {
      // A. Bass Surge: Steepest increase in bass energy
      float bBefore = 0, bAfter = 0;
      for (int j = 1; j <= 4; j++) {
        bBefore += bassProfile[i - j];
        bAfter += bassProfile[i + j];
      }
      float bSurge = (bAfter / (bBefore + 0.001f));

      // B. Breakdown detection: searching for a preceding quiet part
      float eBreak = 0;
      for (int j = 1; j <= 12; j++)
        eBreak += energyProfile[i - j];
      eBreak /= 12.0f;
      float breakdownFactor = avgEnergy / (eBreak + 0.001f);

      // C. Sustained energy post-drop
      float eFuture = 0;
      for (int j = 1; j <= 20; j++)
        eFuture += energyProfile[i + j];
      eFuture /= 20.0f;

      float dropScore =
          bSurge * 2.0f + breakdownFactor * 1.5f + (eFuture / avgEnergy);

      if (dropScore > bestDropScore && eFuture > avgEnergy * 0.75f) {
        bestDropScore = dropScore;
        meta.drop_pos = i * stepSeconds;
      }
    }

    // 3. Accurate Outro Detection: Search backwards for the energy drop-off
    meta.outro_start = meta.duration_seconds - 15.0f;
    float outroThreshold = avgEnergy * 0.4f;
    int sustainedCount = 0;

    for (int i = (int)energyProfile.size() - 1;
         i > (int)(meta.drop_pos / stepSeconds) + 20; i--) {
      if (energyProfile[i] > outroThreshold) {
        sustainedCount++;
        if (sustainedCount > 6) { // Sustained energy found for 3 seconds
          meta.outro_start = (i * stepSeconds) + 2.0f;
          break;
        }
      } else {
        sustainedCount = 0;
      }
    }

    // 4. Memory-Safe BPM & Fingerprint
    // Extract a 20s sample from the middle for a stable BPM estimate
    ma_uint64 bpmFrames = (ma_uint64)(20.0f * meta.sample_rate);
    ma_uint64 midPoint = totalFrames / 2;
    if (midPoint + bpmFrames > totalFrames) midPoint = (totalFrames > bpmFrames) ? (totalFrames - bpmFrames) : 0;
    
    std::vector<float> midBuffer(bpmFrames);
    ma_decoder_seek_to_pcm_frame(&decoder, midPoint);
    ma_uint64 midRead = 0;
    ma_decoder_read_pcm_frames(&decoder, midBuffer.data(), bpmFrames, &midRead);
    midBuffer.resize(midRead);
    
    meta.bpm = ComputeBPM(midBuffer, meta.sample_rate);
    meta.fingerprint = GenerateFingerprint(midBuffer, meta.sample_rate);
    meta.genre = ClassifyGenre(meta.bpm, meta.fingerprint);

    // 5. PHRASE ALIGNMENT: Snap detected points to musical bars (Assuming 4/4)
    float beatSeconds = 60.0f / (meta.bpm > 0 ? meta.bpm : 120.0f);
    float phraseSeconds = beatSeconds * 32.0f; // 8 bars (32 beats) is a standard phrase

    auto AlignToPhrase = [&](float timeVal, float reference) {
        float delta = timeVal - reference;
        int phrases = (int)std::round(delta / phraseSeconds);
        return reference + (phrases * phraseSeconds);
    };

    // Refine drop_pos to nearest phrase relative to intro_end
    meta.drop_pos = AlignToPhrase(meta.drop_pos, meta.intro_end);
    // Ensure drop_pos is within reasonable bounds
    if (meta.drop_pos < meta.intro_end + 10.0f) meta.drop_pos = meta.intro_end + phraseSeconds;
    
    // Refine outro_start to nearest phrase relative to drop_pos
    meta.outro_start = AlignToPhrase(meta.outro_start, meta.drop_pos);
    if (meta.outro_start <= meta.drop_pos) meta.outro_start = meta.drop_pos + (phraseSeconds * 2.0f);
    if (meta.outro_start > meta.duration_seconds - 5.0f) meta.outro_start = meta.duration_seconds - 15.0f;
    
    // 5. Generate Static Waveform (200 points for UI)
    meta.static_waveform.clear();
    if (!energyProfile.empty()) {
      int targetSize = 200;
      float stepSize = (float)energyProfile.size() / targetSize;
      for (int i = 0; i < targetSize; i++) {
        int startIdx = (int)(i * stepSize);
        int endIdx = (int)((i + 1) * stepSize);
        if (endIdx > energyProfile.size()) endIdx = energyProfile.size();
        if (startIdx >= endIdx) {
            meta.static_waveform.push_back(energyProfile[(std::min)((int)energyProfile.size()-1, startIdx)]);
            continue;
        }
        
        float maxVal = 0;
        for (int j = startIdx; j < endIdx; j++) {
          if (energyProfile[j] > maxVal) maxVal = energyProfile[j];
        }
        meta.static_waveform.push_back(maxVal);
      }
      
      // Normalize to 0..1 range
      float globalMax = 0.0001f;
      for (float v : meta.static_waveform) if (v > globalMax) globalMax = v;
      for (float &v : meta.static_waveform) v /= globalMax;
    }

  } catch (...) {
  }
}

float PeerifyAnalyzer::ComputeBPM(const std::vector<float> &pcm_data,
                                  int sample_rate) {
  if (pcm_data.empty() || sample_rate <= 0)
    return 120.0f;

  int step = sample_rate / 100;
  if (step <= 0)
    step = 1;

  std::vector<float> envelope;
  envelope.reserve(pcm_data.size() / step + 1);

  for (size_t i = 0; i < pcm_data.size(); i += step) {
    float sum = 0;
    size_t end = (std::min)(i + step, pcm_data.size());
    for (size_t j = i; j < end; j++)
      sum += std::abs(pcm_data[j]);
    envelope.push_back(sum / (end - i));
  }

  int maxLag = sample_rate / 100 * 2;
  int minLag = sample_rate / 100 / 3;
  if (maxLag <= 0)
    maxLag = 2;
  if (minLag <= 0)
    minLag = 1;

  float bestCorr = 0;
  int bestLag = 1;

  for (int lag = minLag; lag < maxLag; lag++) {
    float corr = 0;
    for (size_t i = 0; i + lag < envelope.size(); i++) {
      corr += envelope[i] * envelope[i + lag];
    }

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  float rawBpm = 60.0f / ((float)bestLag / 100.0f);
  while (rawBpm < 85.0f)
    rawBpm *= 2.0f;
  while (rawBpm > 170.0f)
    rawBpm /= 2.0f;

  return std::round(rawBpm);
}

std::vector<float>
PeerifyAnalyzer::GenerateFingerprint(const std::vector<float> &pcm_data,
                                     int sampleRate) {
  std::vector<float> fingerprint(25, 0.0f);
  if (pcm_data.empty() || sampleRate <= 0)
    return fingerprint;

  int N = 2048;
  std::vector<std::complex<float>> fftData(N);

  float totalRMS = 0.0f;
  for (float sample : pcm_data)
    totalRMS += sample * sample;
  fingerprint[24] = std::sqrt(totalRMS / pcm_data.size());

  int numWindows = (int)pcm_data.size() / N;
  if (numWindows == 0)
    return fingerprint;

  for (int w = 0; w < numWindows && w < 100; w++) {
    for (int i = 0; i < N; i++) {
      float multiplier = 0.5f * (1.0f - std::cos(2.0f * PI * i / (N - 1)));
      fftData[i] = std::complex<float>(pcm_data[w * N + i] * multiplier, 0.0f);
    }

    ComputeFFTIterative(fftData);

    for (int i = 0; i < N / 2; i++) {
      float freq = (float)i * sampleRate / N;
      if (freq < 20.0f)
        continue;

      float mag = std::abs(fftData[i]);
      int bin = (int)(10.0f * std::log10(freq / 20.0f));
      if (bin >= 0 && bin < 24) {
        fingerprint[bin] += mag;
      }
    }
  }

  float maxVal = 0.0001f;
  for (int i = 0; i < 24; i++) {
    fingerprint[i] /= numWindows;
    if (fingerprint[i] > maxVal)
      maxVal = fingerprint[i];
  }
  for (int i = 0; i < 24; i++)
    fingerprint[i] = std::pow(fingerprint[i] / maxVal, 0.8f);

  return fingerprint;
}

float PeerifyAnalyzer::CosineSimilarity(const std::vector<float> &vecA,
                                        const std::vector<float> &vecB) {
  if (vecA.size() != vecB.size() || vecA.empty())
    return 0.0f;
  float dot = 0.0f, normA = 0.0f, normB = 0.0f;
  for (size_t i = 0; i < vecA.size(); i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA == 0.0f || normB == 0.0f)
    return 0.0f;
  return dot / (std::sqrt(normA) * std::sqrt(normB));
}

std::vector<SimilarityResult>
PeerifyAnalyzer::FindSimilar(const std::string &seed_filepath, int top_n) {
  std::vector<SimilarityResult> results;
  std::string cleanPath = seed_filepath;
  std::replace(cleanPath.begin(), cleanPath.end(), '\\', '/');

  std::lock_guard<std::mutex> lock(db_mutex);
  if (library_data.find(cleanPath) == library_data.end())
    return results;

  const auto &seedMeta = library_data[cleanPath];

  for (const auto &[path, meta] : library_data) {
    if (path == cleanPath)
      continue;

    float bpmDiff = std::abs(seedMeta.bpm - meta.bpm);
    float score = CosineSimilarity(seedMeta.fingerprint, meta.fingerprint);

    if (bpmDiff < 5.0f)
      score += 0.2f;
    if (seedMeta.genre == meta.genre)
      score += 0.15f;

    results.push_back({path, score});
  }

  std::sort(results.begin(), results.end(),
            [](const SimilarityResult &a, const SimilarityResult &b) {
              return a.score > b.score;
            });

  if ((int)results.size() > top_n)
    results.resize(top_n);
  return results;
}

bool PeerifyAnalyzer::GetTrackMetadata(const std::string &filepath,
                                       TrackMetadata &outMeta) {
  std::string cleanPath = filepath;
  std::replace(cleanPath.begin(), cleanPath.end(), '\\', '/');

  std::lock_guard<std::mutex> lock(db_mutex);

  auto it = library_data.find(cleanPath);
  if (it != library_data.end()) {
    outMeta = it->second;
    return true;
  }

  return false;
}