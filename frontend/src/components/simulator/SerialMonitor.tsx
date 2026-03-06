/**
 * Serial Monitor — shows Arduino Serial output and allows sending data back.
 * Connects to the AVRSimulator USART via the Zustand store.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSimulatorStore } from '../../store/useSimulatorStore';

export const SerialMonitor: React.FC = () => {
  const serialOutput = useSimulatorStore((s) => s.serialOutput);
  const serialBaudRate = useSimulatorStore((s) => s.serialBaudRate);
  const running = useSimulatorStore((s) => s.running);
  const serialWrite = useSimulatorStore((s) => s.serialWrite);
  const clearSerialOutput = useSimulatorStore((s) => s.clearSerialOutput);

  const [inputValue, setInputValue] = useState('');
  const [lineEnding, setLineEnding] = useState<'none' | 'nl' | 'cr' | 'both'>('nl');
  const [autoscroll, setAutoscroll] = useState(true);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (autoscroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [serialOutput, autoscroll]);

  const handleSend = useCallback(() => {
    if (!inputValue && lineEnding === 'none') return;
    let text = inputValue;
    switch (lineEnding) {
      case 'nl':   text += '\n';   break;
      case 'cr':   text += '\r';   break;
      case 'both': text += '\r\n'; break;
    }
    serialWrite(text);
    setInputValue('');
  }, [inputValue, lineEnding, serialWrite]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Serial Monitor</span>
        <div style={styles.headerControls}>
          {serialBaudRate > 0 && (
            <span style={styles.baudRate}>{serialBaudRate.toLocaleString()} baud</span>
          )}
          <label style={styles.autoscrollLabel}>
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
              style={styles.checkbox}
            />
            Autoscroll
          </label>
          <button onClick={clearSerialOutput} style={styles.clearBtn} title="Clear output">
            Clear
          </button>
        </div>
      </div>

      {/* Output area */}
      <pre ref={outputRef} style={styles.output}>
        {serialOutput || (running ? 'Waiting for serial data...\n' : 'Start simulation to see serial output.\n')}
      </pre>

      {/* Input row */}
      <div style={styles.inputRow}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type message to send..."
          style={styles.input}
          disabled={!running}
        />
        <select
          value={lineEnding}
          onChange={(e) => setLineEnding(e.target.value as typeof lineEnding)}
          style={styles.select}
        >
          <option value="none">No line ending</option>
          <option value="nl">Newline</option>
          <option value="cr">Carriage return</option>
          <option value="both">Both NL &amp; CR</option>
        </select>
        <button onClick={handleSend} disabled={!running} style={styles.sendBtn}>
          Send
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1e1e1e',
    borderTop: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    background: '#252526',
    borderBottom: '1px solid #333',
    minHeight: 28,
  },
  title: {
    color: '#cccccc',
    fontWeight: 600,
    fontSize: 12,
  },
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  baudRate: {
    color: '#569cd6',
    fontSize: 11,
    fontFamily: 'monospace',
    background: '#1e1e1e',
    border: '1px solid #3a3a3a',
    borderRadius: 3,
    padding: '1px 6px',
  },
  autoscrollLabel: {
    color: '#999',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
  },
  checkbox: {
    margin: 0,
    cursor: 'pointer',
  },
  clearBtn: {
    background: 'transparent',
    border: '1px solid #555',
    color: '#ccc',
    padding: '2px 8px',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
  },
  output: {
    flex: 1,
    margin: 0,
    padding: 8,
    color: '#00ff41',
    background: '#0a0a0a',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    minHeight: 0,
    fontSize: 13,
    lineHeight: '1.4',
  },
  inputRow: {
    display: 'flex',
    gap: 4,
    padding: 4,
    background: '#252526',
    borderTop: '1px solid #333',
  },
  input: {
    flex: 1,
    background: '#1e1e1e',
    border: '1px solid #444',
    color: '#ccc',
    padding: '4px 8px',
    borderRadius: 3,
    fontFamily: 'monospace',
    fontSize: 12,
    outline: 'none',
  },
  select: {
    background: '#1e1e1e',
    border: '1px solid #444',
    color: '#ccc',
    padding: '4px',
    borderRadius: 3,
    fontSize: 11,
    outline: 'none',
  },
  sendBtn: {
    background: '#0e639c',
    border: 'none',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
};
