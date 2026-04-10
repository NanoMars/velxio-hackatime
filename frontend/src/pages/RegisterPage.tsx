import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Registration happens automatically through the Hack Club OAuth callback,
// so this page just redirects to the login page.
export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
};
