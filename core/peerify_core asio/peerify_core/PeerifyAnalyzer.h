#pragma once
#include <atomic>
#include <complex>
#include <string>
#include <unordered_map>
#include <vector>
#include <mutex>

struct TrackMetadata {
    std::string filepath;
    std::string filename;
    float duration_seconds;
    int sample_rate;
    float bpm;
    std::string genre;
    std::vector<float> fingerprint;
    float intro_end;
    float outro_start;
    float drop_pos;
    std::vector<float> static_waveform;
};

struct SimilarityResult {
    std::string filepath;
    float score;
};

class PeerifyAnalyzer {
public:
    PeerifyAnalyzer(const std::string& db_path) : database_path(db_path) {
        LoadDatabase();
    }
    ~PeerifyAnalyzer() {
        SaveDatabase();
    }

    int BuildLibrary(const std::vector<std::string>& inputPaths);
    std::vector<SimilarityResult> FindSimilar(const std::string& seed_filepath, int top_n = 1);
    bool GetTrackMetadata(const std::string& filepath, TrackMetadata& outMeta);

    void GetProgress(int* current, int* total) {
        if (current) *current = current_progress.load();
        if (total) *total = total_files.load();
    }

private:
    std::string database_path;
    std::unordered_map<std::string, TrackMetadata> library_data;
    std::mutex db_mutex;

    std::atomic<int> current_progress{ 0 };
    std::atomic<int> total_files{ 0 };

    void LoadDatabase();
    void SaveDatabase();

    void ComputeFFTIterative(std::vector<std::complex<float>>& a);
    float ComputeBPM(const std::vector<float>& pcm_data, int sample_rate);
    std::vector<float> GenerateFingerprint(const std::vector<float>& pcm_data, int sampleRate);
    float CosineSimilarity(const std::vector<float>& vecA, const std::vector<float>& vecB);
    std::string ClassifyGenre(float bpm, const std::vector<float>& f);
    void AnalyzeSegments(const std::string& filepath, TrackMetadata& meta);
};