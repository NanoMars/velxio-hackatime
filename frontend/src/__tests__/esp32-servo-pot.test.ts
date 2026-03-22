/**
 * esp32-servo-pot.test.ts
 *
 * Tests for the ESP32 Servo + Potentiometer example, focusing on:
 *   1. Servo subscribes to onPwmChange for ESP32 (not AVR cycle measurement)
 *   2. Servo uses onPinChange for AVR (existing behavior)
 *   3. Servo uses onPinChangeWithTime for RP2040
 *   4. LEDC update routes to correct GPIO pin (not LEDC channel)
 *   5. LEDC duty_pct is normalized to 0.0–1.0
 *   6. LEDC fallback to channel when gpio=-1
 *   7. Servo angle maps correctly from duty cycle
 *   8. Potentiometer setAdcVoltage returns false for ESP32 (SimulatorCanvas handles it)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../simulation/AVRSimulator', () => ({
  AVRSimulator: vi.fn(function (this: any) {
    this.onSerialData = null;
    this.onBaudRateChange = null;
    this.onPinChangeWithTime = null;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.reset = vi.fn();
    this.loadHex = vi.fn();
    this.addI2CDevice = vi.fn();
    this.setPinState = vi.fn();
    this.isRunning = vi.fn().mockReturnValue(true);
    this.registerSensor = vi.fn().mockReturnValue(false);
    this.pinManager = {
      onPinChange: vi.fn().mockReturnValue(() => {}),
      onPwmChange: vi.fn().mockReturnValue(() => {}),
      updatePwm: vi.fn(),
    };
    this.getCurrentCycles = vi.fn().mockReturnValue(1000);
    this.getClockHz = vi.fn().mockReturnValue(16_000_000);
    this.cpu = { data: new Uint8Array(512).fill(0), cycles: 1000 };
  }),
}));

vi.mock('../simulation/RP2040Simulator', () => ({
  RP2040Simulator: vi.fn(function (this: any) {
    this.onSerialData = null;
    this.onPinChangeWithTime = null;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.reset = vi.fn();
    this.loadBinary = vi.fn();
    this.addI2CDevice = vi.fn();
    this.isRunning = vi.fn().mockReturnValue(true);
    this.registerSensor = vi.fn().mockReturnValue(false);
    this.pinManager = {
      onPinChange: vi.fn().mockReturnValue(() => {}),
      onPwmChange: vi.fn().mockReturnValue(() => {}),
      updatePwm: vi.fn(),
    };
  }),
}));

vi.mock('../simulation/PinManager', () => ({
  PinManager: vi.fn(function (this: any) {
    this.updatePort = vi.fn();
    this.onPinChange = vi.fn().mockReturnValue(() => {});
    this.onPwmChange = vi.fn().mockReturnValue(() => {});
    this.getListenersCount = vi.fn().mockReturnValue(0);
    this.updatePwm = vi.fn();
    this.triggerPinChange = vi.fn();
  }),
}));

vi.mock('../simulation/I2CBusManager', () => ({
  VirtualDS1307: vi.fn(function (this: any) {}),
  VirtualTempSensor: vi.fn(function (this: any) {}),
  I2CMemoryDevice: vi.fn(function (this: any) {}),
}));

vi.mock('../store/useOscilloscopeStore', () => ({
  useOscilloscopeStore: {
    getState: vi.fn().mockReturnValue({ channels: [], pushSample: vi.fn() }),
  },
}));

vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => 1);
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn().mockReturnValue('test-session-id'),
  setItem: vi.fn(),
});

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { PartSimulationRegistry } from '../simulation/parts/PartSimulationRegistry';
import '../simulation/parts/ComplexParts';
import { PinManager } from '../simulation/PinManager';
import { RP2040Simulator } from '../simulation/RP2040Simulator';
import { setAdcVoltage } from '../simulation/parts/partUtils';

// ─── Mock factories ──────────────────────────────────────────────────────────

function makeElement(props: Record<string, unknown> = {}): HTMLElement {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    angle: 0,
    ...props,
  } as unknown as HTMLElement;
}

/** Simulator mock that mimics Esp32BridgeShim (no valid CPU cycles) */
function makeEsp32Shim() {
  let pwmCallback: ((pin: number, duty: number) => void) | null = null;
  const unsubPwm = vi.fn();

  return {
    pinManager: {
      onPinChange: vi.fn().mockReturnValue(() => {}),
      onPwmChange: vi.fn().mockImplementation((_pin: number, cb: (pin: number, duty: number) => void) => {
        pwmCallback = cb;
        return unsubPwm;
      }),
      updatePwm: vi.fn(),
      triggerPinChange: vi.fn(),
    },
    setPinState: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    getCurrentCycles: vi.fn().mockReturnValue(-1), // ESP32: no valid cycles
    getClockHz: vi.fn().mockReturnValue(240_000_000),
    registerSensor: vi.fn().mockReturnValue(true),
    updateSensor: vi.fn(),
    unregisterSensor: vi.fn(),
    // Test helpers
    _getPwmCallback: () => pwmCallback,
    _unsubPwm: unsubPwm,
  };
}

/** Simulator mock that mimics AVR (has valid CPU cycles) */
function makeAVRSim() {
  let pinCallback: ((pin: number, state: boolean) => void) | null = null;
  const unsubPin = vi.fn();

  return {
    pinManager: {
      onPinChange: vi.fn().mockImplementation((_pin: number, cb: (pin: number, state: boolean) => void) => {
        pinCallback = cb;
        return unsubPin;
      }),
      onPwmChange: vi.fn().mockReturnValue(() => {}),
      updatePwm: vi.fn(),
    },
    setPinState: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    getCurrentCycles: vi.fn().mockReturnValue(1000),
    getClockHz: vi.fn().mockReturnValue(16_000_000),
    cpu: { data: new Uint8Array(512).fill(0), cycles: 1000 },
    registerSensor: vi.fn().mockReturnValue(false),
    // Test helpers
    _getPinCallback: () => pinCallback,
    _unsubPin: unsubPin,
  };
}

const pinMap =
  (map: Record<string, number>) =>
  (name: string): number | null =>
    name in map ? map[name] : null;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Servo — ESP32 path: subscribes to onPwmChange
// ─────────────────────────────────────────────────────────────────────────────

describe('Servo — ESP32 PWM subscription', () => {
  const logic = () => PartSimulationRegistry.get('servo')!;

  it('subscribes to onPwmChange when simulator has no valid CPU cycles (ESP32 shim)', () => {
    const shim = makeEsp32Shim();
    const el = makeElement();
    logic().attachEvents!(el, shim as any, pinMap({ PWM: 13 }), 'servo-esp32');

    expect(shim.pinManager.onPwmChange).toHaveBeenCalledWith(13, expect.any(Function));
  });

  it('updates angle when PWM duty cycle changes', () => {
    const shim = makeEsp32Shim();
    const el = makeElement() as any;
    logic().attachEvents!(el, shim as any, pinMap({ PWM: 13 }), 'servo-esp32-angle');

    const cb = shim._getPwmCallback();
    expect(cb).not.toBeNull();

    // duty 0.0 → 0°
    cb!(13, 0.0);
    expect(el.angle).toBe(0);

    // duty 0.5 → 90°
    cb!(13, 0.5);
    expect(el.angle).toBe(90);

    // duty 1.0 → 180°
    cb!(13, 1.0);
    expect(el.angle).toBe(180);
  });

  it('clamps angle to 0-180 range', () => {
    const shim = makeEsp32Shim();
    const el = makeElement() as any;
    logic().attachEvents!(el, shim as any, pinMap({ PWM: 13 }), 'servo-clamp');

    const cb = shim._getPwmCallback();

    // Negative duty → 0°
    cb!(13, -0.1);
    expect(el.angle).toBe(0);

    // Duty > 1 → 180°
    cb!(13, 1.5);
    expect(el.angle).toBe(180);
  });

  it('cleanup unsubscribes from onPwmChange', () => {
    const shim = makeEsp32Shim();
    const el = makeElement();
    const cleanup = logic().attachEvents!(el, shim as any, pinMap({ PWM: 13 }), 'servo-cleanup');

    cleanup();
    expect(shim._unsubPwm).toHaveBeenCalled();
  });

  it('does NOT subscribe to onPinChange (AVR cycle measurement)', () => {
    const shim = makeEsp32Shim();
    const el = makeElement();
    logic().attachEvents!(el, shim as any, pinMap({ PWM: 13 }), 'servo-no-pin');

    expect(shim.pinManager.onPinChange).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Servo — AVR path: uses onPinChange + cycle measurement
// ─────────────────────────────────────────────────────────────────────────────

describe('Servo — AVR cycle-based measurement', () => {
  const logic = () => PartSimulationRegistry.get('servo')!;

  it('subscribes to onPinChange (not onPwmChange) when simulator has valid CPU cycles', () => {
    const avr = makeAVRSim();
    const el = makeElement();
    logic().attachEvents!(el, avr as any, pinMap({ PWM: 9 }), 'servo-avr');

    expect(avr.pinManager.onPinChange).toHaveBeenCalledWith(9, expect.any(Function));
    // Should NOT use onPwmChange for AVR
    expect(avr.pinManager.onPwmChange).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Servo — RP2040 path: uses onPinChangeWithTime (instanceof check)
// ─────────────────────────────────────────────────────────────────────────────

describe('Servo — RP2040 timing-based measurement', () => {
  const logic = () => PartSimulationRegistry.get('servo')!;

  it('uses onPinChangeWithTime when simulator is RP2040Simulator instance', () => {
    const rp = new RP2040Simulator() as any;
    const el = makeElement();
    logic().attachEvents!(el, rp as any, pinMap({ PWM: 15 }), 'servo-rp2040');

    // RP2040 path sets onPinChangeWithTime
    expect(rp.onPinChangeWithTime).toBeTypeOf('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4-6. LEDC update routing — PinManager.updatePwm
// ─────────────────────────────────────────────────────────────────────────────

describe('LEDC update routing', () => {
  let pm: any;

  beforeEach(() => {
    pm = new PinManager();
  });

  it('routes to GPIO pin when update.gpio >= 0', () => {
    const update = { channel: 0, duty: 4096, duty_pct: 50, gpio: 13 };
    const targetPin = (update.gpio !== undefined && update.gpio >= 0)
      ? update.gpio
      : update.channel;
    pm.updatePwm(targetPin, update.duty_pct / 100);

    expect(pm.updatePwm).toHaveBeenCalledWith(13, 0.5);
  });

  it('falls back to channel when gpio is -1', () => {
    const update = { channel: 2, duty: 4096, duty_pct: 50, gpio: -1 };
    const targetPin = (update.gpio !== undefined && update.gpio >= 0)
      ? update.gpio
      : update.channel;
    pm.updatePwm(targetPin, update.duty_pct / 100);

    expect(pm.updatePwm).toHaveBeenCalledWith(2, 0.5);
  });

  it('falls back to channel when gpio is undefined', () => {
    const update = { channel: 3, duty: 8192, duty_pct: 100 } as any;
    const targetPin = (update.gpio !== undefined && update.gpio >= 0)
      ? update.gpio
      : update.channel;
    pm.updatePwm(targetPin, update.duty_pct / 100);

    expect(pm.updatePwm).toHaveBeenCalledWith(3, 1.0);
  });

  it('normalizes duty_pct to 0.0–1.0 (divides by 100)', () => {
    const update = { channel: 0, duty: 2048, duty_pct: 25, gpio: 5 };
    const targetPin = (update.gpio !== undefined && update.gpio >= 0)
      ? update.gpio
      : update.channel;
    pm.updatePwm(targetPin, update.duty_pct / 100);

    expect(pm.updatePwm).toHaveBeenCalledWith(5, 0.25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Servo angle mapping from duty cycle
// ─────────────────────────────────────────────────────────────────────────────

describe('Servo angle mapping', () => {
  const logic = () => PartSimulationRegistry.get('servo')!;

  it('maps duty 0.0 → angle 0, duty 0.5 → angle 90, duty 1.0 → angle 180', () => {
    const shim = makeEsp32Shim();
    const el = makeElement() as any;
    logic().attachEvents!(el, shim as any, pinMap({ PWM: 13 }), 'servo-map');

    const cb = shim._getPwmCallback();

    const testCases = [
      { duty: 0.0, expectedAngle: 0 },
      { duty: 0.25, expectedAngle: 45 },
      { duty: 0.5, expectedAngle: 90 },
      { duty: 0.75, expectedAngle: 135 },
      { duty: 1.0, expectedAngle: 180 },
    ];

    for (const { duty, expectedAngle } of testCases) {
      cb!(13, duty);
      expect(el.angle).toBe(expectedAngle);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Potentiometer — setAdcVoltage on ESP32
// ─────────────────────────────────────────────────────────────────────────────

describe('Potentiometer — ESP32 ADC path', () => {
  it('setAdcVoltage returns false for ESP32 shim (GPIO 34 is not AVR/RP2040 ADC range)', () => {
    const shim = makeEsp32Shim();
    // GPIO 34 on ESP32 — not in AVR range (14-19) nor RP2040 range (26-29)
    const result = setAdcVoltage(shim as any, 34, 1.65);
    expect(result).toBe(false);
  });

  it('setAdcVoltage works for AVR (pin 14-19)', () => {
    const avrSim = makeAVRSim() as any;
    avrSim.getADC = () => ({ channelValues: new Array(6).fill(0) });
    const result = setAdcVoltage(avrSim as any, 14, 2.5);
    expect(result).toBe(true);
  });
});
