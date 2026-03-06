import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import './LandingPage.css';

const GITHUB_URL = 'https://github.com/davidmonterocrespo24/velxio';
const PAYPAL_URL = 'https://paypal.me/odoonext';
const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/davidmonterocrespo24';

/* ── Inline SVG icons ─────────────────────────────────── */
const IcoChip = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
  </svg>
);

const IcoCpu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="8" y="8" width="8" height="8" />
    <path d="M10 2v2M14 2v2M10 20v2M14 20v2M2 10h2M2 14h2M20 10h2M20 14h2" />
  </svg>
);

const IcoCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const IcoZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IcoLayers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IcoMonitor = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const IcoBook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const IcoGitHub = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const IcoHeart = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

/* ── Arduino board SVGs ───────────────────────────────── */
const BoardUno = () => (
  <svg viewBox="0 0 120 80" className="board-svg">
    {/* PCB */}
    <rect x="2" y="2" width="116" height="76" rx="4" fill="#006633" stroke="#004d26" strokeWidth="1.5"/>
    {/* MCU */}
    <rect x="42" y="22" width="36" height="36" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="1"/>
    {/* USB */}
    <rect x="0" y="28" width="14" height="24" rx="2" fill="#555" stroke="#444" strokeWidth="1"/>
    {/* Power jack */}
    <circle cx="108" cy="20" r="7" fill="#333" stroke="#222" strokeWidth="1"/>
    {/* Header pins top */}
    {[0,1,2,3,4,5,6,7,8,9,11,12,13].map((i) => (
      <rect key={i} x={20 + i * 6.5} y="4" width="3" height="6" rx="0.5" fill="#d4a017" />
    ))}
    {/* Header pins bottom */}
    {[0,1,2,3,4,5].map((i) => (
      <rect key={i} x={40 + i * 8} y="70" width="3" height="6" rx="0.5" fill="#d4a017" />
    ))}
    {/* LED */}
    <circle cx="90" cy="12" r="2.5" fill="#00ff88" opacity="0.9"/>
    {/* Label */}
    <text x="60" y="77" textAnchor="middle" fill="#00aa55" fontSize="5" fontFamily="monospace">Arduino Uno</text>
  </svg>
);

const BoardNano = () => (
  <svg viewBox="0 0 120 50" className="board-svg">
    {/* PCB */}
    <rect x="2" y="2" width="116" height="46" rx="3" fill="#003399" stroke="#002277" strokeWidth="1.5"/>
    {/* MCU */}
    <rect x="44" y="12" width="24" height="24" rx="1.5" fill="#1a1a1a" stroke="#333" strokeWidth="1"/>
    {/* USB mini */}
    <rect x="50" y="0" width="20" height="8" rx="2" fill="#555" stroke="#444" strokeWidth="1"/>
    {/* Header left */}
    {[0,1,2,3,4,5,6,7].map((i) => (
      <rect key={i} x="4" y={8 + i * 4.5} width="6" height="3" rx="0.5" fill="#d4a017" />
    ))}
    {/* Header right */}
    {[0,1,2,3,4,5,6,7].map((i) => (
      <rect key={i} x="110" y={8 + i * 4.5} width="6" height="3" rx="0.5" fill="#d4a017" />
    ))}
    {/* LED */}
    <circle cx="28" cy="10" r="2" fill="#00ff88" opacity="0.9"/>
    <text x="60" y="44" textAnchor="middle" fill="#6699ff" fontSize="5" fontFamily="monospace">Arduino Nano</text>
  </svg>
);

const BoardPico = () => (
  <svg viewBox="0 0 120 60" className="board-svg">
    {/* PCB */}
    <rect x="2" y="2" width="116" height="56" rx="3" fill="#f0f0f0" stroke="#ccc" strokeWidth="1.5"/>
    {/* RP2040 chip */}
    <rect x="40" y="14" width="32" height="32" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="1"/>
    <rect x="44" y="18" width="24" height="24" rx="1" fill="#222" stroke="#444" strokeWidth="0.5"/>
    {/* USB micro */}
    <rect x="50" y="0" width="20" height="8" rx="2" fill="#888" stroke="#666" strokeWidth="1"/>
    {/* Header left */}
    {[0,1,2,3,4,5,6].map((i) => (
      <rect key={i} x="4" y={10 + i * 6} width="6" height="4" rx="0.5" fill="#888" />
    ))}
    {/* Header right */}
    {[0,1,2,3,4,5,6].map((i) => (
      <rect key={i} x="110" y={10 + i * 6} width="6" height="4" rx="0.5" fill="#888" />
    ))}
    {/* LED */}
    <circle cx="88" cy="10" r="2.5" fill="#00ccff" opacity="0.9"/>
    <text x="60" y="57" textAnchor="middle" fill="#555" fontSize="5" fontFamily="monospace">Raspberry Pi Pico</text>
  </svg>
);

const BoardMega = () => (
  <svg viewBox="0 0 160 80" className="board-svg">
    {/* PCB */}
    <rect x="2" y="2" width="156" height="76" rx="4" fill="#006633" stroke="#004d26" strokeWidth="1.5"/>
    {/* MCU - ATmega2560 */}
    <rect x="55" y="20" width="50" height="40" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="1"/>
    {/* USB */}
    <rect x="0" y="28" width="14" height="24" rx="2" fill="#555" stroke="#444" strokeWidth="1"/>
    {/* Power jack */}
    <circle cx="148" cy="20" r="7" fill="#333" stroke="#222" strokeWidth="1"/>
    {/* Top headers */}
    {Array.from({length: 18}).map((_, i) => (
      <rect key={i} x={18 + i * 7} y="4" width="3" height="6" rx="0.5" fill="#d4a017" />
    ))}
    {/* Bottom headers */}
    {Array.from({length: 18}).map((_, i) => (
      <rect key={i} x={18 + i * 7} y="70" width="3" height="6" rx="0.5" fill="#d4a017" />
    ))}
    {/* LEDs */}
    <circle cx="130" cy="12" r="2.5" fill="#00ff88" opacity="0.9"/>
    <circle cx="138" cy="12" r="2.5" fill="#ff6600" opacity="0.9"/>
    <text x="80" y="77" textAnchor="middle" fill="#00aa55" fontSize="5" fontFamily="monospace">Arduino Mega 2560</text>
  </svg>
);

/* ── Features data ────────────────────────────────────── */
const features = [
  { icon: <IcoCpu />, title: 'Real AVR8 Emulation', desc: 'Full ATmega328p at 16 MHz — timers, USART, ADC, SPI, I2C, PWM all wired.' },
  { icon: <IcoLayers />, title: '48+ Components', desc: 'LEDs, LCDs, TFT displays, servos, buzzers, sensors and more from wokwi-elements.' },
  { icon: <IcoCode />, title: 'Monaco Editor', desc: 'VS Code-grade C++ editor with syntax highlighting, autocomplete, and minimap.' },
  { icon: <IcoZap />, title: 'arduino-cli Backend', desc: 'Compile sketches locally in seconds. No cloud. No latency. No limits.' },
  { icon: <IcoMonitor />, title: 'Serial Monitor', desc: 'Live TX/RX with auto baud-rate detection, send data, and autoscroll.' },
  { icon: <IcoBook />, title: 'Library Manager', desc: 'Browse and install the full Arduino library index directly from the UI.' },
];

/* ── Component ────────────────────────────────────────── */
export const LandingPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <IcoChip />
          <span>Velxio</span>
        </div>
        <div className="landing-nav-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="nav-link">
            <IcoGitHub /> GitHub
          </a>
          <Link to="/examples" className="nav-link">Examples</Link>
          {user ? (
            <Link to="/editor" className="nav-btn-primary">Open Editor</Link>
          ) : (
            <>
              <Link to="/login" className="nav-link">Sign in</Link>
              <Link to="/editor" className="nav-btn-primary">Launch Editor</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="hero-badge">Open Source · Free · Local</div>
          <h1 className="hero-title">
            Arduino Emulator<br />
            <span className="hero-accent">in your browser</span>
          </h1>
          <p className="hero-subtitle">
            Write, compile, and simulate Arduino projects — no hardware required.<br />
            Real AVR8 emulation. 48+ electronic components. Runs entirely on your machine.
          </p>
          <div className="hero-ctas">
            <Link to="/editor" className="cta-primary">
              <IcoZap />
              Launch Editor
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="cta-secondary">
              <IcoGitHub />
              View on GitHub
            </a>
          </div>
        </div>
        {/* Floating chip grid decoration */}
        <div className="hero-decoration" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="deco-chip" style={{ animationDelay: `${i * 0.4}s` }}>
              <IcoChip />
            </div>
          ))}
        </div>
      </section>

      {/* Boards */}
      <section className="landing-section">
        <h2 className="section-title">Supported Boards</h2>
        <p className="section-sub">Pick your hardware. The emulator adapts.</p>
        <div className="boards-grid">
          <div className="board-card">
            <BoardUno />
            <div className="board-info">
              <span className="board-name">Arduino Uno</span>
              <span className="board-chip">ATmega328p · AVR8</span>
            </div>
          </div>
          <div className="board-card">
            <BoardNano />
            <div className="board-info">
              <span className="board-name">Arduino Nano</span>
              <span className="board-chip">ATmega328p · AVR8</span>
            </div>
          </div>
          <div className="board-card">
            <BoardMega />
            <div className="board-info">
              <span className="board-name">Arduino Mega</span>
              <span className="board-chip">ATmega2560 · AVR8</span>
            </div>
          </div>
          <div className="board-card">
            <BoardPico />
            <div className="board-info">
              <span className="board-name">Raspberry Pi Pico</span>
              <span className="board-chip">RP2040 · Dual-core ARM</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section landing-section-alt">
        <h2 className="section-title">Everything you need</h2>
        <p className="section-sub">A complete IDE and simulator, running locally.</p>
        <div className="features-grid">
          {features.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Support */}
      <section className="landing-section landing-support">
        <div className="support-content">
          <div className="support-icon"><IcoHeart /></div>
          <h2 className="section-title">Support the project</h2>
          <p className="section-sub">
            Velxio is free and open source. If it saves you time, consider supporting its development.
          </p>
          <div className="support-btns">
            <a href={GITHUB_SPONSORS_URL} target="_blank" rel="noopener noreferrer" className="support-btn support-btn-gh">
              <IcoGitHub /> GitHub Sponsors
            </a>
            <a href={PAYPAL_URL} target="_blank" rel="noopener noreferrer" className="support-btn support-btn-pp">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
              </svg>
              Donate via PayPal
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-brand">
          <IcoChip />
          <span>Velxio</span>
        </div>
        <div className="footer-links">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <Link to="/examples">Examples</Link>
          <Link to="/editor">Editor</Link>
        </div>
        <p className="footer-copy">
          MIT License · Powered by <a href="https://github.com/wokwi/avr8js" target="_blank" rel="noopener noreferrer">avr8js</a> &amp; <a href="https://github.com/wokwi/wokwi-elements" target="_blank" rel="noopener noreferrer">wokwi-elements</a>
        </p>
      </footer>
    </div>
  );
};
