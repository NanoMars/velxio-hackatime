#!/bin/bash
set -e

# Ensure arduino-cli config and board manager URLs are set up
if [ ! -f /root/.arduino15/arduino-cli.yaml ]; then
    echo "📦 Initializing arduino-cli config..."
    arduino-cli config init 2>/dev/null || true
    arduino-cli config add board_manager.additional_urls \
        https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json 2>/dev/null || true
    arduino-cli config add board_manager.additional_urls \
        https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json 2>/dev/null || true
fi

# Install missing cores. arduino-cli core install is a no-op if already present.
# ESP32 core MUST be 2.0.17 (IDF 4.4.x) — newer 3.x is incompatible with QEMU ROM bins.
arduino-cli core update-index 2>/dev/null || true
arduino-cli core install arduino:avr 2>/dev/null || true
arduino-cli core install rp2040:rp2040 2>/dev/null || true
arduino-cli core install esp32:esp32@2.0.17 2>/dev/null || true

# Start FastAPI backend in the background on port 8001
echo "🚀 Starting Velxio Backend..."
uvicorn app.main:app --host 127.0.0.1 --port 8001 &

# Wait for backend to be healthy (optional but good practice)
sleep 2

# Start Nginx in the foreground to keep the container running
echo "🌐 Starting Nginx Web Server on port 80..."
exec nginx -g "daemon off;"
