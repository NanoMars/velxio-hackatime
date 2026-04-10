cmake_minimum_required(VERSION 3.16)

# Arduino as ESP-IDF component (optional — only if ARDUINO_ESP32_PATH is set)
if(DEFINED ENV{ARDUINO_ESP32_PATH})
    set(EXTRA_COMPONENT_DIRS $ENV{ARDUINO_ESP32_PATH})
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(velxio-sketch)

# ── Global fallback defines for Kconfig macros that don't exist in ESP-IDF 4.4.7 ──
# Several parts of arduino-esp32 and popular third-party libraries reference
# CONFIG_* macros that come from optional ESP-IDF components we don't have.
# Without these defines:
#   - arduino-esp32's LittleFS.cpp / SPIFFS.cpp are entirely #ifdef'd out, so
#     the linker can't find `LittleFS` / `SPIFFS` globals.
#   - AsyncTCP's ASYNC_TCP_MAX_TASK_SLEEP macro fails to expand.
# We inject them globally after project() so every component picks them up.
idf_build_set_property(COMPILE_OPTIONS
    "-DCONFIG_LITTLEFS_PAGE_SIZE=256"
    "-DCONFIG_LITTLEFS_OBJ_NAME_LEN=64"
    "-DCONFIG_LITTLEFS_READ_SIZE=128"
    "-DCONFIG_LITTLEFS_WRITE_SIZE=128"
    "-DCONFIG_LITTLEFS_LOOKAHEAD_SIZE=128"
    "-DCONFIG_LITTLEFS_CACHE_SIZE=512"
    "-DCONFIG_LITTLEFS_BLOCK_CYCLES=512"
    "-DCONFIG_LITTLEFS_USE_MTIME=1"
    "-DCONFIG_LITTLEFS_MTIME_USE_SECONDS=1"
    "-DCONFIG_ESP_TASK_WDT_TIMEOUT_S=5"
    # ARDUINO_ESP32_LCGAMBOA=1 tells user sketches they're running under
    # lcgamboa's QEMU fork, so they can switch to STA mode and connect to
    # QEMU's built-in "Espressif" access point (QEMU can't host an AP that
    # a real browser could join). The arduino-cli path already defines
    # this in services/arduino_cli.py — match it here so ESP-IDF builds
    # behave the same way.
    "-DARDUINO_ESP32_LCGAMBOA=1"
    APPEND
)

# ── esp_littlefs: headers + prebuilt library ───────────────────────────────
# arduino-esp32's LittleFS.cpp #includes esp_littlefs.h, which doesn't exist
# as an ESP-IDF 4.4.7 component. arduino-esp32 ships the header plus a
# prebuilt static library for each target in tools/sdk/<target>/. We add
# the include directory to every component's compile flags and link the
# matching .a file into the final image.
if(DEFINED ENV{ARDUINO_ESP32_PATH})
    set(_ARDUINO_SDK "$ENV{ARDUINO_ESP32_PATH}/tools/sdk/${IDF_TARGET}")
    if(EXISTS "${_ARDUINO_SDK}/include/esp_littlefs/include/esp_littlefs.h")
        idf_build_set_property(INCLUDE_DIRECTORIES
            "${_ARDUINO_SDK}/include/esp_littlefs/include"
            APPEND
        )
        message(STATUS "velxio: esp_littlefs headers at ${_ARDUINO_SDK}/include/esp_littlefs/include")
    endif()
    if(EXISTS "${_ARDUINO_SDK}/lib/libesp_littlefs.a")
        idf_build_set_property(LINK_OPTIONS
            "-L${_ARDUINO_SDK}/lib"
            "-lesp_littlefs"
            APPEND
        )
        message(STATUS "velxio: esp_littlefs library at ${_ARDUINO_SDK}/lib/libesp_littlefs.a")
    endif()
endif()
