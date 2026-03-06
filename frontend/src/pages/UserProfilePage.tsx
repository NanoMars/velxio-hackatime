import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getUserProjects, type ProjectResponse } from '../services/projectService';
import { useAuthStore } from '../store/useAuthStore';

export const UserProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    getUserProjects(username)
      .then(setProjects)
      .catch(() => setError('User not found.'))
      .finally(() => setLoading(false));
  }, [username]);

  const isOwn = user?.username === username;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>{username}</h1>
          {isOwn && (
            <Link to="/editor" style={styles.newBtn}>+ New project</Link>
          )}
        </div>

        {loading && <p style={styles.muted}>Loading…</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        {!loading && !error && projects.length === 0 && (
          <p style={styles.muted}>No public projects yet.</p>
        )}

        <div style={styles.grid}>
          {projects.map((p) => (
            <Link key={p.id} to={`/${username}/${p.slug}`} style={styles.card}>
              <div style={styles.cardTitle}>{p.name}</div>
              {p.description && <div style={styles.cardDesc}>{p.description}</div>}
              <div style={styles.cardMeta}>
                <span style={styles.badge}>{p.board_type}</span>
                {!p.is_public && <span style={{ ...styles.badge, background: '#555' }}>Private</span>}
                <span style={styles.date}>{new Date(p.updated_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#1e1e1e', padding: '2rem 1rem' },
  container: { maxWidth: 900, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  title: { color: '#ccc', margin: 0, fontSize: 26 },
  newBtn: { background: '#0e639c', color: '#fff', padding: '7px 14px', borderRadius: 4, textDecoration: 'none', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  card: { background: '#252526', border: '1px solid #3c3c3c', borderRadius: 8, padding: '1rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color .15s' },
  cardTitle: { color: '#4fc3f7', fontWeight: 600, fontSize: 15 },
  cardDesc: { color: '#9d9d9d', fontSize: 13, flex: 1 },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { background: '#0e639c', color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 4 },
  date: { color: '#666', fontSize: 11, marginLeft: 'auto' },
  muted: { color: '#666' },
  errorText: { color: '#f44747' },
};
