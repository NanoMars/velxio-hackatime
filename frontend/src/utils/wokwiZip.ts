/**
 * Wokwi zip import/export
 *
 * Converts between Wokwi's diagram.json format and Velxio's internal
 * component/wire format, bundling everything into a .zip file.
 *
 * Wokwi zip structure:
 *   diagram.json     — parts + connections
 *   sketch.ino       — main sketch (or projectname.ino)
 *   *.h / *.cpp      — additional files
 *   libraries.txt    — optional library list
 *   wokwi-project.txt — optional metadata
 */

import JSZip from 'jszip';
import type { Wire } from '../types/wire';
import type { BoardKind } from '../types/board';

// ── Type definitions ──────────────────────────────────────────────────────────

interface WokwiPart {
  type: string;
  id: string;
  top: number;
  left: number;
  rotate?: number;
  attrs: Record<string, unknown>;
}

interface WokwiDiagram {
  version: number;
  author: string;
  editor: string;
  parts: WokwiPart[];
  connections: [string, string, string, string[]][];
}

export interface VelxioComponent {
  id: string;
  metadataId: string;
  x: number;
  y: number;
  properties: Record<string, unknown>;
}

export interface ImportResult {
  boardType: BoardKind;
  boardPosition: { x: number; y: number };
  components: VelxioComponent[];
  wires: Wire[];
  files: Array<{ name: string; content: string }>;
  /** Library names parsed from libraries.txt. Includes both standard Arduino Library Manager names and Wokwi-hosted entries in the form "LibName@wokwi:hash". */
  libraries: string[];
}

// ── Board mappings ────────────────────────────────────────────────────────────

// Wokwi board type → Velxio BoardKind.
// Wokwi uses both "wokwi-*" (bare elements) and "board-*" (full dev boards) prefixes.
// Keep both forms so exports from Wokwi, Velxio, and PlatformIO all round-trip cleanly.
const WOKWI_TYPE_TO_BOARD: Record<string, BoardKind> = {
  // AVR
  'wokwi-arduino-uno':            'arduino-uno',
  'board-arduino-uno':            'arduino-uno',
  'wokwi-arduino-nano':           'arduino-nano',
  'board-arduino-nano':           'arduino-nano',
  'wokwi-arduino-mega':           'arduino-mega',
  'board-arduino-mega':           'arduino-mega',
  'wokwi-attiny85':               'attiny85',
  'board-attiny85':               'attiny85',
  // RP2040
  'wokwi-raspberry-pi-pico':      'raspberry-pi-pico',
  'board-pi-pico':                'raspberry-pi-pico',
  'board-pi-pico-w':              'pi-pico-w',
  // Raspberry Pi 3
  'board-pi-3b':                  'raspberry-pi-3',
  'board-raspberry-pi-3':         'raspberry-pi-3',
  // ESP32 (Xtensa LX6)
  'board-esp32-devkit-v1':        'esp32',
  'wokwi-esp32-devkit-v1':        'esp32',
  'board-esp32-devkit-c-v4':      'esp32-devkit-c-v4',
  'board-esp32-cam':              'esp32-cam',
  'board-wemos-lolin32-lite':     'wemos-lolin32-lite',
  // ESP32-S3 (Xtensa LX7)
  'board-esp32-s3-devkitc-1':     'esp32-s3',
  'board-esp32-s3':               'esp32-s3',
  'board-xiao-esp32-s3':          'xiao-esp32-s3',
  'board-arduino-nano-esp32':     'arduino-nano-esp32',
  // ESP32-C3 (RISC-V)
  'board-esp32-c3-devkitm-1':     'esp32-c3',
  'board-esp32-c3':               'esp32-c3',
  'board-xiao-esp32-c3':          'xiao-esp32-c3',
  'board-aitewinrobot-esp32c3-supermini': 'aitewinrobot-esp32c3-supermini',
};

// Velxio BoardKind → Wokwi type (preferred export format)
const BOARD_TO_WOKWI_TYPE: Record<BoardKind, string> = {
  'arduino-uno':                  'wokwi-arduino-uno',
  'arduino-nano':                 'wokwi-arduino-nano',
  'arduino-mega':                 'wokwi-arduino-mega',
  'attiny85':                     'wokwi-attiny85',
  'raspberry-pi-pico':            'board-pi-pico',
  'pi-pico-w':                    'board-pi-pico-w',
  'raspberry-pi-3':               'board-pi-3b',
  'esp32':                        'board-esp32-devkit-v1',
  'esp32-devkit-c-v4':            'board-esp32-devkit-c-v4',
  'esp32-cam':                    'board-esp32-cam',
  'wemos-lolin32-lite':           'board-wemos-lolin32-lite',
  'esp32-s3':                     'board-esp32-s3-devkitc-1',
  'xiao-esp32-s3':                'board-xiao-esp32-s3',
  'arduino-nano-esp32':           'board-arduino-nano-esp32',
  'esp32-c3':                     'board-esp32-c3-devkitm-1',
  'xiao-esp32-c3':                'board-xiao-esp32-c3',
  'aitewinrobot-esp32c3-supermini': 'board-aitewinrobot-esp32c3-supermini',
};

// Velxio BoardKind → default Wokwi part id
const BOARD_TO_WOKWI_ID: Record<BoardKind, string> = {
  'arduino-uno':                  'uno',
  'arduino-nano':                 'nano',
  'arduino-mega':                 'mega',
  'attiny85':                     'attiny85',
  'raspberry-pi-pico':            'pico',
  'pi-pico-w':                    'picow',
  'raspberry-pi-3':               'pi3',
  'esp32':                        'esp',
  'esp32-devkit-c-v4':            'esp',
  'esp32-cam':                    'esp',
  'wemos-lolin32-lite':           'esp',
  'esp32-s3':                     'esp',
  'xiao-esp32-s3':                'esp',
  'arduino-nano-esp32':           'esp',
  'esp32-c3':                     'esp',
  'xiao-esp32-c3':                'esp',
  'aitewinrobot-esp32c3-supermini': 'esp',
};

// ── Fallback: detect board from wokwi-project.txt (PlatformIO format) ────────
// Many Wokwi/PlatformIO exports include a wokwi-project.txt that names the board
// in [env:xxx] / board = yyy lines. This is a defensive fallback when diagram.json
// doesn't have a recognized part.
const PLATFORMIO_BOARD_TO_VELXIO: Record<string, BoardKind> = {
  'esp32dev':        'esp32',
  'esp32devkitv1':   'esp32',
  'esp32doit-devkit-v1': 'esp32',
  'esp32cam':        'esp32-cam',
  'lolin32_lite':    'wemos-lolin32-lite',
  'esp32-s3-devkitc-1': 'esp32-s3',
  'seeed_xiao_esp32s3': 'xiao-esp32-s3',
  'arduino_nano_esp32': 'arduino-nano-esp32',
  'esp32-c3-devkitm-1': 'esp32-c3',
  'seeed_xiao_esp32c3': 'xiao-esp32-c3',
  'pico':            'raspberry-pi-pico',
  'pico_w':          'pi-pico-w',
  'uno':             'arduino-uno',
  'nano':            'arduino-nano',
  'megaatmega2560':  'arduino-mega',
  'attiny85':        'attiny85',
};

function detectBoardFromProjectTxt(content: string): BoardKind | null {
  // Look for: board = <name>
  const match = content.match(/^\s*board\s*=\s*([a-zA-Z0-9_\-]+)/m);
  if (!match) return null;
  const boardName = match[1].toLowerCase();
  return PLATFORMIO_BOARD_TO_VELXIO[boardName] ?? null;
}

// ── Pin name aliases ─────────────────────────────────────────────────────────

// Maps Wokwi connection "signal" pin names to wokwi-element physical pin names.
// Wokwi boards (e.g. board-ssd1306) use different naming than the bare elements.
const COMPONENT_PIN_ALIASES: Record<string, Record<string, string>> = {
  'ssd1306': {
    'SDA': 'DATA',
    'SCL': 'CLK',
    'VCC': 'VIN',
  },
};

function normalizePinName(metadataId: string, pinName: string): string {
  return COMPONENT_PIN_ALIASES[metadataId]?.[pinName] ?? pinName;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const COLOR_NAME_TO_HEX: Record<string, string> = {
  red: '#ff0000', black: '#000000', green: '#00c800', blue: '#0000ff',
  yellow: '#ffff00', orange: '#ff8800', white: '#ffffff', gray: '#808080',
  grey: '#808080', purple: '#800080', pink: '#ff69b4', cyan: '#00ffff',
  gold: '#ffd700', brown: '#8b4513', magenta: '#ff00ff', lime: '#00ff00',
  violet: '#ee82ee', maroon: '#800000', navy: '#000080', teal: '#008080',
};

const HEX_TO_COLOR_NAME: Record<string, string> = {
  '#ff0000': 'red', '#000000': 'black', '#00ff00': 'green', '#00c800': 'green',
  '#0000ff': 'blue', '#ffff00': 'yellow', '#ff8800': 'orange', '#ffffff': 'white',
  '#808080': 'gray', '#800080': 'purple', '#00ffff': 'cyan', '#ffd700': 'gold',
};

function colorToHex(color: string): string {
  if (!color) return '#888888';
  if (color.startsWith('#')) return color.toLowerCase();
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? '#888888';
}

function hexToColorName(hex: string): string {
  return HEX_TO_COLOR_NAME[hex.toLowerCase()] ?? hex;
}

// ── Type conversion ───────────────────────────────────────────────────────────

function wokwiTypeToMetadataId(type: string): string {
  if (type.startsWith('wokwi-')) return type.slice(6);
  if (type.startsWith('board-')) return type.slice(6);
  return type;
}

function metadataIdToWokwiType(metadataId: string): string {
  return `wokwi-${metadataId}`;
}

// ── Library list parser ───────────────────────────────────────────────────────

/**
 * Parse the contents of a Wokwi libraries.txt file.
 * - Strips blank lines and # comments
 * - Includes Wokwi-hosted entries in the form  name@wokwi:hash
 *   so the backend can download and install them from wokwi.com
 */
export function parseLibrariesTxt(content: string): string[] {
  const libs: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    libs.push(line);
  }
  return libs;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportToWokwiZip(
  files: Array<{ name: string; content: string }>,
  components: VelxioComponent[],
  wires: Wire[],
  boardType: BoardKind,
  projectName: string,
  boardPosition: { x: number; y: number } = { x: 50, y: 50 },
): Promise<void> {
  const zip = new JSZip();

  const boardWokwiType = BOARD_TO_WOKWI_TYPE[boardType] ?? 'wokwi-arduino-uno';
  const boardId = BOARD_TO_WOKWI_ID[boardType] ?? 'uno';

  // Build parts — board first, then user components
  // Subtract boardPosition so coords are relative to the board
  const parts: WokwiPart[] = [
    { type: boardWokwiType, id: boardId, top: 0, left: 0, attrs: {} },
    ...components.map((c) => ({
      type: metadataIdToWokwiType(c.metadataId),
      id: c.id,
      top: Math.round(c.y - boardPosition.y),
      left: Math.round(c.x - boardPosition.x),
      attrs: c.properties as Record<string, unknown>,
    })),
  ];

  // Internal Velxio component-ids that refer to "the board" (not user-placed parts).
  // These are the DOM ids used by the board element, which varies per board kind.
  const BOARD_INTERNAL_IDS = new Set([
    'arduino-uno', 'arduino-nano', 'arduino-mega', 'attiny85',
    'nano-rp2040', 'pi-pico', 'pi-pico-w',
    'esp32', 'esp32-s3', 'esp32-c3',
  ]);

  // Build connections — remap any wire endpoint that refers to the internal
  // board id to the exported boardId so the exported zip uses a single part id.
  const connections: [string, string, string, string[]][] = wires.map((w) => {
    const isBoardStart = BOARD_INTERNAL_IDS.has(w.start.componentId);
    const isBoardEnd = BOARD_INTERNAL_IDS.has(w.end.componentId);
    const startId = isBoardStart ? boardId : w.start.componentId;
    const endId = isBoardEnd ? boardId : w.end.componentId;
    return [
      `${startId}:${w.start.pinName}`,
      `${endId}:${w.end.pinName}`,
      hexToColorName(w.color ?? '#888888'),
      [],
    ];
  });

  const diagram: WokwiDiagram = {
    version: 1,
    author: 'Velxio',
    editor: 'wokwi',
    parts,
    connections,
  };

  zip.file('diagram.json', JSON.stringify(diagram, null, 2));
  zip.file('wokwi-project.txt', `Exported from Velxio\n\nSimulate this project on https://velxio.dev\n`);

  for (const f of files) {
    zip.file(f.name, f.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(projectName || 'velxio-project').replace(/[^a-z0-9_-]/gi, '-')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importFromWokwiZip(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);

  // diagram.json is required
  const diagramEntry = zip.file('diagram.json');
  if (!diagramEntry) throw new Error('No diagram.json found in the zip file.');

  const diagramText = await diagramEntry.async('string');
  const diagram: WokwiDiagram = JSON.parse(diagramText);

  // Detect board from diagram.json first (preferred — gives us position too)
  const boardPart = diagram.parts.find((p) => WOKWI_TYPE_TO_BOARD[p.type]);
  let boardType: BoardKind | null = boardPart ? WOKWI_TYPE_TO_BOARD[boardPart.type] : null;

  // Fallback 1: wokwi-project.txt (PlatformIO format with board = xxx)
  if (!boardType) {
    const projectTxtEntry = zip.file('wokwi-project.txt');
    if (projectTxtEntry) {
      boardType = detectBoardFromProjectTxt(await projectTxtEntry.async('string'));
    }
  }

  // Fallback 2: arduino-uno (last resort)
  if (!boardType) boardType = 'arduino-uno';

  const boardId = boardPart?.id ?? BOARD_TO_WOKWI_ID[boardType] ?? 'uno';

  // Velxio internal component ID for the board element (must match DOM element id)
  const VELXIO_BOARD_ID: Record<string, string> = {
    'arduino-uno':      'arduino-uno',
    'arduino-nano':     'arduino-nano',
    'arduino-mega':     'arduino-mega',
    'raspberry-pi-pico': 'nano-rp2040',
  };
  const velxioBoardId = VELXIO_BOARD_ID[boardType] ?? boardType;

  // Board position from diagram. Apply a minimum offset so the board is never
  // crammed against the canvas top-left corner (Wokwi diagrams often use 0,0).
  const MIN_OFFSET = 50;
  const rawBoardX = boardPart?.left ?? MIN_OFFSET;
  const rawBoardY = boardPart?.top ?? MIN_OFFSET;
  const offsetX = rawBoardX < MIN_OFFSET ? MIN_OFFSET - rawBoardX : 0;
  const offsetY = rawBoardY < MIN_OFFSET ? MIN_OFFSET - rawBoardY : 0;
  const boardPosition = {
    x: rawBoardX + offsetX,
    y: rawBoardY + offsetY,
  };

  // Convert non-board parts to Velxio components.
  // Apply the same offset so components keep their relative position to the board.
  const components: VelxioComponent[] = diagram.parts
    .filter((p) => !WOKWI_TYPE_TO_BOARD[p.type])
    .map((p) => ({
      id: p.id,
      metadataId: wokwiTypeToMetadataId(p.type),
      x: p.left + offsetX,
      y: p.top + offsetY,
      properties: { ...p.attrs },
    }));

  // Convert connections to Velxio wires
  const wires: Wire[] = diagram.connections.map((conn, i) => {
    const [startStr, endStr, color] = conn;
    const colonA = startStr.indexOf(':');
    const colonB = endStr.indexOf(':');
    const startCompRaw = colonA >= 0 ? startStr.slice(0, colonA) : startStr;
    const startPin = colonA >= 0 ? startStr.slice(colonA + 1) : '';
    const endCompRaw = colonB >= 0 ? endStr.slice(0, colonB) : endStr;
    const endPin = colonB >= 0 ? endStr.slice(colonB + 1) : '';

    // Remap board part id → Velxio internal board id
    const startId = startCompRaw === boardId ? velxioBoardId : startCompRaw;
    const endId = endCompRaw === boardId ? velxioBoardId : endCompRaw;

    // Normalize pin names: Wokwi uses signal names (SDA, SCL, VCC) while
    // wokwi-elements use physical/board pin names (DATA, CLK, VIN).
    const startMetadataId = components.find((c) => c.id === startId)?.metadataId ?? '';
    const endMetadataId = components.find((c) => c.id === endId)?.metadataId ?? '';
    const normalizedStartPin = normalizePinName(startMetadataId, startPin);
    const normalizedEndPin = normalizePinName(endMetadataId, endPin);

    return {
      id: `wire-${i}-${Date.now()}`,
      start: { componentId: startId, pinName: normalizedStartPin, x: 0, y: 0 },
      end: { componentId: endId, pinName: normalizedEndPin, x: 0, y: 0 },
      waypoints: [],
      color: colorToHex(color),
    };
  });

  // Read code files (.ino, .h, .cpp, .c)
  const CODE_EXTS = new Set(['.ino', '.h', '.cpp', '.c']);
  const files: Array<{ name: string; content: string }> = [];

  for (const [filename, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const basename = filename.split('/').pop() ?? filename;
    const ext = '.' + basename.split('.').pop()!.toLowerCase();
    if (CODE_EXTS.has(ext)) {
      const content = await entry.async('string');
      files.push({ name: basename, content });
    }
  }

  // Sort: .ino first, then alphabetically
  files.sort((a, b) => {
    const aIno = a.name.endsWith('.ino');
    const bIno = b.name.endsWith('.ino');
    if (aIno && !bIno) return -1;
    if (!aIno && bIno) return 1;
    return a.name.localeCompare(b.name);
  });

  // Parse libraries.txt
  const libraries: string[] = [];
  const libEntry = zip.file('libraries.txt');
  if (libEntry) {
    libraries.push(...parseLibrariesTxt(await libEntry.async('string')));
  }

  return { boardType, boardPosition, components, wires, files, libraries };
}
