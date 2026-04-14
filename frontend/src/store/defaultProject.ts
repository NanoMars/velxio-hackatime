/**
 * Default project loaded on first visit — ESP32 Captive Portal Template.
 *
 * Previously Velxio shipped with an Arduino Uno blink sketch. For this fork
 * we default to a WiFi + AsyncWebServer + LittleFS captive portal so new
 * users land on something meaningful out of the box (and because the rest
 * of the fork is scoped around ESP32 work).
 *
 * Keep these strings in sync with esp32template/sketch.ino and
 * esp32template/html.h in the user's repo — any edits to either should be
 * reflected here so the in-editor default matches the canonical template.
 */
import type { BoardKind } from '../types/board';

/** The board new users see when the editor first opens. */
export const DEFAULT_BOARD_KIND: BoardKind = 'esp32-devkit-c-v4';

/** Libraries the default sketch expects to be installed. */
export const DEFAULT_REQUIRED_LIBRARIES = [
  'ArduinoJson',
  'AsyncTCP',
  'ESPAsyncWebServer',
] as const;

/** Python default used only when the first board is a Raspberry Pi 3B. */
export const DEFAULT_PY_CONTENT = `import RPi.GPIO as GPIO
import time

LED_PIN = 17

GPIO.setmode(GPIO.BCM)
GPIO.setup(LED_PIN, GPIO.OUT)

try:
    while True:
        GPIO.output(LED_PIN, GPIO.HIGH)
        time.sleep(1)
        GPIO.output(LED_PIN, GPIO.LOW)
        time.sleep(1)
except KeyboardInterrupt:
    GPIO.cleanup()
`;

/** Main sketch for the ESP32 Captive Portal default project. */
export const DEFAULT_INO_CONTENT = `/*
 * ESP32 Captive Portal Template
 *
 * Creates an open WiFi network with a captive portal serving an interactive
 * web app backed by LittleFS. Demo feature: a simple guestbook.
 *
 * Compatible with both real hardware (AP mode) and Velxio emulator (STA mode).
 * Velxio injects ARDUINO_ESP32_LCGAMBOA at compile time to switch modes.
 */

#include <WiFi.h>
#include <DNSServer.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "html.h"

// ── Configuration ───────────────────────────────────────────────────────────
const char* WIFI_SSID       = "ESP32-Portal";   // Change this to your network name
const int   MAX_ENTRIES     = 50;                // Max guestbook entries before oldest is dropped
const int   JSON_DOC_SIZE   = 16384;             // ArduinoJson doc size (16KB)
const char* DATA_FILE       = "/guestbook.json";

// ── Globals ─────────────────────────────────────────────────────────────────
AsyncWebServer server(80);
DNSServer dnsServer;
IPAddress apIP(192, 168, 4, 1);

// ── Storage ─────────────────────────────────────────────────────────────────

void initStorage() {
    if (!LittleFS.begin(true)) {
        Serial.println("LittleFS mount failed");
        return;
    }
    // Create data file if it doesn't exist
    if (!LittleFS.exists(DATA_FILE)) {
        File f = LittleFS.open(DATA_FILE, "w");
        f.print("[]");
        f.close();
    }
    Serial.println("LittleFS ready");
}

String loadEntries() {
    File f = LittleFS.open(DATA_FILE, "r");
    if (!f) return "[]";
    String data = f.readString();
    f.close();
    return data;
}

bool addEntry(const String& name, const String& message) {
    DynamicJsonDocument doc(JSON_DOC_SIZE);
    String raw = loadEntries();
    DeserializationError err = deserializeJson(doc, raw);
    if (err) {
        doc.to<JsonArray>(); // Reset to empty array on parse error
    }

    JsonArray entries = doc.as<JsonArray>();

    // Drop oldest entries if at capacity
    while (entries.size() >= MAX_ENTRIES) {
        entries.remove(0);
    }

    JsonObject entry = entries.createNestedObject();
    entry["name"]    = name.length() > 0 ? name : "Anonymous";
    entry["message"] = message;
    entry["time"]    = millis() / 1000; // Uptime in seconds (ESP32 has no RTC)

    File f = LittleFS.open(DATA_FILE, "w");
    if (!f) return false;
    serializeJson(doc, f);
    f.close();
    return true;
}

void clearEntries() {
    File f = LittleFS.open(DATA_FILE, "w");
    f.print("[]");
    f.close();
}

// ── Network ─────────────────────────────────────────────────────────────────

void setupNetwork() {
#ifdef ARDUINO_ESP32_LCGAMBOA
    // Velxio emulator: connect as station to the simulated network
    Serial.println("Velxio mode: connecting as station...");
    WiFi.mode(WIFI_STA);
    WiFi.begin("Espressif");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    Serial.print("Connected! IP: ");
    Serial.println(WiFi.localIP());
#else
    // Real hardware: create an open access point with captive portal
    Serial.println("Starting access point...");
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
    WiFi.softAP(WIFI_SSID);

    // DNS wildcard: all domains resolve to our IP (triggers captive portal)
    dnsServer.start(53, "*", apIP);

    Serial.print("AP ready! SSID: ");
    Serial.println(WIFI_SSID);
    Serial.print("IP: ");
    Serial.println(apIP);
#endif
}

void loopNetwork() {
#ifndef ARDUINO_ESP32_LCGAMBOA
    dnsServer.processNextRequest();
#endif
}

// ── Web Server ──────────────────────────────────────────────────────────────

void setupServer() {
    // Serve the main page from PROGMEM
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
        request->send_P(200, "text/html", PAGE_HTML);
    });

    // Serve optional static assets from LittleFS (images, etc.)
    server.serveStatic("/images", LittleFS, "/images");

    // API: Get all guestbook entries
    server.on("/api/entries", HTTP_GET, [](AsyncWebServerRequest* request) {
        request->send(200, "application/json", loadEntries());
    });

    // API: Add a guestbook entry
    server.on("/api/entries", HTTP_POST, [](AsyncWebServerRequest* request) {
        String name = request->hasParam("name", true)
            ? request->getParam("name", true)->value() : "";
        String message = request->hasParam("message", true)
            ? request->getParam("message", true)->value() : "";

        if (message.length() == 0) {
            request->send(400, "application/json", "{\\"error\\":\\"Message is required\\"}");
            return;
        }

        if (addEntry(name, message)) {
            request->send(200, "application/json", "{\\"ok\\":true}");
        } else {
            request->send(500, "application/json", "{\\"error\\":\\"Failed to save\\"}");
        }
    });

    // API: Clear all entries
    server.on("/api/clear", HTTP_POST, [](AsyncWebServerRequest* request) {
        clearEntries();
        request->send(200, "application/json", "{\\"ok\\":true}");
    });

    // Captive portal catch-all
    server.onNotFound([](AsyncWebServerRequest* request) {
#ifndef ARDUINO_ESP32_LCGAMBOA
        // Real hardware: redirect foreign hosts to our IP (captive portal)
        String host = request->host();
        if (host.length() > 0 && host != "192.168.4.1") {
            request->redirect("http://192.168.4.1/");
            return;
        }
#endif
        // Unknown path: serve main page (SPA-style)
        if (!request->url().startsWith("/api")) {
            request->send_P(200, "text/html", PAGE_HTML);
        } else {
            request->send(404, "text/plain", "Not Found");
        }
    });

    server.begin();
    Serial.println("Web server started on port 80");
}

// ── Main ────────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    Serial.println("\\n--- ESP32 Captive Portal Template ---");

    initStorage();
    setupNetwork();
    setupServer();
}

void loop() {
    loopNetwork();
}
`;

/** HTML served from PROGMEM by the default sketch. */
export const DEFAULT_HTML_H_CONTENT = `/*
 * Guestbook frontend — served from PROGMEM, no filesystem upload needed.
 *
 * Edit the HTML/CSS/JS below as you would a normal web page.
 * The raw string literal R"rawliteral(...)rawliteral" lets you write
 * regular HTML without escaping quotes or angle brackets.
 *
 * To add images: place them in data/images/ and reference as /images/filename.png
 * Then run \`make uploadfs\` (or \`pio run -t uploadfs\`) to upload them to the ESP32.
 */

const char PAGE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guestbook</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 16px;
        }

        header {
            text-align: center;
            padding: 24px 0 16px;
        }

        header h1 {
            font-size: 1.5rem;
            font-weight: 600;
        }

        header p {
            color: #888;
            font-size: 0.85rem;
            margin-top: 4px;
        }

        /* ── Form ── */
        .form-card {
            background: #fff;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .form-card input,
        .form-card textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 0.95rem;
            font-family: inherit;
            margin-bottom: 10px;
            background: #fafafa;
        }

        .form-card textarea {
            height: 80px;
            resize: vertical;
        }

        .form-card input:focus,
        .form-card textarea:focus {
            outline: none;
            border-color: #4a9eff;
            background: #fff;
        }

        .btn {
            display: inline-block;
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-size: 0.95rem;
            cursor: pointer;
            font-family: inherit;
        }

        .btn-primary {
            background: #4a9eff;
            color: #fff;
            width: 100%;
        }

        .btn-primary:hover { background: #3a8eef; }
        .btn-primary:disabled { background: #b0d4ff; cursor: not-allowed; }

        .btn-danger {
            background: none;
            color: #c44;
            font-size: 0.8rem;
            padding: 6px 12px;
        }

        .btn-danger:hover { background: #fdd; }

        /* ── Entries ── */
        .entries-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .entries-header h2 {
            font-size: 1rem;
            font-weight: 600;
        }

        .entry {
            background: #fff;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        .entry-meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }

        .entry-name {
            font-weight: 600;
            font-size: 0.9rem;
        }

        .entry-time {
            color: #aaa;
            font-size: 0.75rem;
        }

        .entry-message {
            font-size: 0.95rem;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .empty {
            text-align: center;
            color: #aaa;
            padding: 32px;
            font-size: 0.95rem;
        }

        .status {
            text-align: center;
            color: #aaa;
            font-size: 0.75rem;
            padding: 8px;
        }
    </style>
</head>
<body>
    <header>
        <!-- To add a logo: <img src="/images/logo.png" alt="Logo" width="64"> -->
        <h1>Guestbook</h1>
        <p>Leave a message — it stays on this device.</p>
    </header>

    <div class="form-card">
        <input type="text" id="name" placeholder="Name (optional)" maxlength="32">
        <textarea id="message" placeholder="Write something..." maxlength="500"></textarea>
        <button class="btn btn-primary" id="submit" onclick="submitEntry()">Post</button>
    </div>

    <div>
        <div class="entries-header">
            <h2 id="count">Messages</h2>
            <button class="btn btn-danger" onclick="clearAll()">Clear All</button>
        </div>
        <div id="entries"><div class="empty">Loading...</div></div>
    </div>

    <div class="status" id="status"></div>

    <script>
        async function loadEntries() {
            try {
                const res = await fetch('/api/entries');
                const entries = await res.json();
                const container = document.getElementById('entries');
                const count = document.getElementById('count');

                count.textContent = 'Messages (' + entries.length + ')';

                if (entries.length === 0) {
                    container.innerHTML = '<div class="empty">No messages yet. Be the first!</div>';
                    return;
                }

                // Show newest first
                container.innerHTML = entries.slice().reverse().map(function(e) {
                    return '<div class="entry">'
                        + '<div class="entry-meta">'
                        + '<span class="entry-name">' + escapeHtml(e.name || 'Anonymous') + '</span>'
                        + '<span class="entry-time">' + formatTime(e.time) + '</span>'
                        + '</div>'
                        + '<div class="entry-message">' + escapeHtml(e.message) + '</div>'
                        + '</div>';
                }).join('');
            } catch (err) {
                document.getElementById('entries').innerHTML =
                    '<div class="empty">Could not load messages.</div>';
            }
        }

        async function submitEntry() {
            var name = document.getElementById('name').value.trim();
            var message = document.getElementById('message').value.trim();
            if (!message) return;

            var btn = document.getElementById('submit');
            btn.disabled = true;
            btn.textContent = 'Posting...';

            try {
                var body = new URLSearchParams();
                body.append('name', name);
                body.append('message', message);

                var res = await fetch('/api/entries', { method: 'POST', body: body });
                if (res.ok) {
                    document.getElementById('message').value = '';
                    await loadEntries();
                }
            } catch (err) {
                // silently fail
            }

            btn.disabled = false;
            btn.textContent = 'Post';
        }

        async function clearAll() {
            if (!confirm('Clear all messages?')) return;
            try {
                await fetch('/api/clear', { method: 'POST' });
                await loadEntries();
            } catch (err) {}
        }

        function escapeHtml(text) {
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatTime(uptimeSeconds) {
            if (!uptimeSeconds && uptimeSeconds !== 0) return '';
            var h = Math.floor(uptimeSeconds / 3600);
            var m = Math.floor((uptimeSeconds % 3600) / 60);
            if (h > 0) return h + 'h ' + m + 'm ago';
            if (m > 0) return m + 'm ago';
            return 'just now';
        }

        // Allow Ctrl+Enter / Cmd+Enter to submit
        document.getElementById('message').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                submitEntry();
            }
        });

        // Load on page open
        loadEntries();
    </script>
</body>
</html>
)rawliteral";
`;
