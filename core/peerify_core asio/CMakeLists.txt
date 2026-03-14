cmake_minimum_required(VERSION 3.10)
project(peerify_core)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(SOURCE_FILES
    peerify_core/dll_main.cpp
    peerify_core/PeerifyAudio.cpp
    peerify_core/PeerifyAnalyzer.cpp
    peerify_core/PeerifyBassEngine.cpp
    peerify_core/miniaudio_impl.cpp
)

if(ANDROID)
    list(APPEND SOURCE_FILES peerify_core/jni_bridge.cpp)
endif()

# Header search paths
include_directories(peerify_core)

# Shared library
add_library(peerify_core SHARED ${SOURCE_FILES})

# Platform specific settings
if(WIN32)
    # Windows: .dll
    set_target_properties(peerify_core PROPERTIES PREFIX "")
    target_link_libraries(peerify_core PRIVATE 
        ${CMAKE_CURRENT_SOURCE_DIR}/peerify_core/bass.lib 
        ${CMAKE_CURRENT_SOURCE_DIR}/peerify_core/bass_vst.lib
    )
elseif(ANDROID)
    # Android: .so
    target_link_libraries(peerify_core log android)
elseif(UNIX AND NOT APPLE)
    # Linux: .so
    target_link_libraries(peerify_core pthread m dl)
endif()

# Export definitions (Handle __declspec for non-Windows)
if(NOT WIN32)
    target_compile_definitions(peerify_core PRIVATE "__declspec(dllexport)=")
endif()
