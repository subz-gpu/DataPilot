
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Mark } from '../components/Layout.jsx';
import { Eye, EyeOff } from 'lucide-react';


function AuthVideoPanel() {
  return (
    <div className="auth-video-panel">
      <video
        className="auth-video"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      >
        <source
          src="/videos/datapilot-background.mp4"
          type="video/mp4"
        />
      </video>

      <div className="auth-video-overlay" />

      <div className="auth-video-content">
        <span className="auth-video-eyebrow">
          <span className="status-dot" />
          INTELLIGENCE IN MOTION
        </span>

        <div className="auth-video-heading">
          <h2>Your data.</h2>
          <h2>A new perspective.</h2>
          <p>
            From raw information to meaningful insights.
            Let intelligent agents do the thinking.
          </p>
        </div>

        <div className="auth-video-footer">
          DATAPILOT · AI-POWERED DATA ANALYTICS
        </div>
      </div>
    </div>
  );
}


function validateRegistration({ name, email, password }) {
  const cleanName = name.trim();
  const cleanEmail = email.trim();

  if (!cleanName) return 'Name is required.';

  if (!/^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(cleanName)) {
    return 'Enter a valid name using letters, spaces, hyphens or apostrophes.';
  }

  if (cleanName.length < 2 || cleanName.length > 80) {
    return 'Name must be between 2 and 80 characters.';
  }

  // Require a dotted domain and a valid-looking alphabetic top-level domain.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

  if (cleanEmail.length > 254 || !emailPattern.test(cleanEmail)) {
    return 'Enter a valid email address, such as name@example.com.';
  }

  if (password.length < 8) {
    return 'Password must contain at least 8 characters.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return 'Password must contain at least one special character.';
  }

  if (new TextEncoder().encode(password).length > 72) {
    return 'Password is too long. Maximum length is 72 UTF-8 bytes.';
  }

  return '';
}

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const creating = mode === 'register';

  const set = (field) => (e) => {
    setForm((previous) => ({
      ...previous,
      [field]: e.target.value,
    }));
  };

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (creating) {
      const validationError = validateRegistration(form);

      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setBusy(true);

    try {
      if (creating) {
        await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        });
      } else {
        await login({
          email: form.email.trim(),
          password: form.password,
        });
      }

      navigate(location.state?.from?.pathname || '/', {
        replace: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-main">
        <p className="wordmark">
          <Mark size={26} />
          DataPilot
        </p>

        <h1>Ask a question about your data.</h1>

        <p className="lead">
          Upload a spreadsheet and say what you want to know. An AI plans the
          analysis, writes and runs the code, checks its own work, and hands
          you a written report.
        </p>

        <form onSubmit={submit} className="form" aria-labelledby="auth-title">
          <h2 id="auth-title">
            {creating ? 'Create your account' : 'Sign in'}
          </h2>

          {creating && (
            <label>
              Name
              <input
                value={form.name}
                onChange={set('name')}
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              required
              maxLength={254}
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
            />
          </label>

          
<label>
  Password

  <div className="password-wrapper">
    <input
      type={showPassword ? 'text' : 'password'}
      required
      minLength={creating ? 8 : undefined}
      maxLength={200}
      value={form.password}
      onChange={set('password')}
      autoComplete={creating ? 'new-password' : 'current-password'}
    />

    <button
      type="button"
      className="password-toggle"
      onClick={() => setShowPassword((previous) => !previous)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      aria-pressed={showPassword}
    >
      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  </div>

  {creating && (
    <span className="hint">
      At least 8 characters, including uppercase, lowercase,
      a number and a special character.
    </span>
  )}
</label>


          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button className="btn" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : creating
                ? 'Create account'
                : 'Sign in'}
          </button>

          <p className="switch">
            {creating
              ? 'Already have an account?'
              : 'New to DataPilot?'}{' '}

            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(creating ? 'signin' : 'register');
                setError('');
              }}
            >
              {creating ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
      </section>

      <aside className="auth-side">
  <AuthVideoPanel />
</aside>
    </div>
  );
}
