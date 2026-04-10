import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectByIdPage } from './pages/ProjectByIdPage';
import { AdminPage } from './pages/AdminPage';
import { useAuthStore } from './store/useAuthStore';
import './App.css';

function App() {
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <Router>
      <Routes>
        {/* Editor is the home — no landing page, examples, docs, or about */}
        <Route path="/" element={<Navigate to="/editor" replace />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* Canonical project URL by ID */}
        <Route path="/project/:id" element={<ProjectByIdPage />} />
        {/* Legacy slug route — redirects to /project/:id */}
        <Route path="/:username/:projectName" element={<ProjectPage />} />
        <Route path="/:username" element={<UserProfilePage />} />
      </Routes>
    </Router>
  );
}

export default App;
