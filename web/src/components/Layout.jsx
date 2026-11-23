
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useEffect, useRef, useState } from 'react';


export function Mark({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="DataPilot logo"
    >
      {/* Dark navy background */}
      <rect
        width="32"
        height="32"
        rx="8"
        fill="#14233F"
      />

      {/* D-shaped analytics symbol */}
      <path
        d="M8 6H16A10 10 0 0 1 16 26H8V6Z"
        stroke="#60A5FA"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Rising analytics graph */}
      <path
        d="M10.5 20L15 15.5L19 18L24 11"
        stroke="#FACC15"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Graph endpoint */}
      <circle
        cx="24"
        cy="11"
        r="2"
        fill="#FACC15"
      />
    </svg>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="splash">Loading...</p>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const email = user?.email || '';
  const displayName =
    user?.name ||
    user?.full_name ||
    user?.username ||
    email.split('@')[0] ||
    'Account';

  const initial = displayName.charAt(0).toUpperCase();

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  // Close the dropdown when pressing Escape.
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Close the dropdown after navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
     <div className="dashboard-video-layer" aria-hidden="true">
    <video autoPlay muted loop playsInline>
      <source src="/videos/dashboard-bg.mp4" type="video/mp4" />
    </video>
    <div className="dashboard-video-overlay" />
  </div>

  <a className="skip" href="#main"></a>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <Link to="/" className="wordmark">
          <Mark />
          DataPilot
        </Link>

        <nav aria-label="Main">
          <NavLink to="/" end>
            Analyses
          </NavLink>

          <NavLink to="/datasets">
            Datasets
          </NavLink>
        </nav>

        <div className="account-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`account-trigger${menuOpen ? ' is-open' : ''}`}
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-expanded={menuOpen}
            aria-controls="account-dropdown"
            aria-label="Open account menu"
          >
            <span className="account-avatar">{initial}</span>

            <span className="account-trigger-text">
              <span className="account-trigger-name">{displayName}</span>
              <span className="account-trigger-email">{email}</span>
            </span>

            <svg
              className={`account-chevron${menuOpen ? ' rotated' : ''}`}
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="account-dropdown"
              id="account-dropdown"
            >
              <div className="account-dropdown-header">
                <span className="account-avatar large">
                  {initial}
                </span>

                <div className="account-user-info">
                  <strong>{displayName}</strong>
                  <span>{email}</span>
                </div>
              </div>

              <div className="account-dropdown-divider" />

              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `account-dropdown-link${isActive ? ' active' : ''}`
                }
                onClick={() => setMenuOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 21a7 7 0 0 1 14 0" />
                </svg>
                My Profile
              </NavLink>

              <div className="account-dropdown-divider" />

              <button
                type="button"
                className="account-dropdown-link signout-link"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                  <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main
  id="main"
  className="page page-transition"
  key={location.pathname}
>
        <Outlet />
      </main>
    </>
  );
}
