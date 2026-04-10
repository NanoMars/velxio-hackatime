import { initiateHackClubLogin } from '../services/authService';
import { useSEO } from '../utils/useSEO';

export const LoginPage: React.FC = () => {
  useSEO({
    title: 'Sign in — Velxio',
    description: 'Sign in with Hack Club to save and share your projects on Velxio.',
    noindex: true,
  });

  return (
    <div className="ap-page">
      <div className="ap-card">
        <h1 className="ap-card-title">Sign in</h1>
        <p className="ap-card-sub">to continue to Velxio</p>

        <button onClick={initiateHackClubLogin} className="ap-btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Continue with Hack Club
        </button>

        <p className="ap-footer" style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
          We only use Hack Club OAuth. Your Hack Club account is the only way to sign in.
        </p>
      </div>
    </div>
  );
};
