
import { useAuth } from '../auth/AuthContext.jsx';

export default function ProfilePage() {
  const { user } = useAuth();

  const name = user?.name || 'DataPilot User';
  const email = user?.email || 'No email available';

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const createdDate = user?.createdAt
    ? new Date(user.createdAt)
    : null;

  const validDate =
    createdDate && !Number.isNaN(createdDate.getTime());

  return (
    <section className="profile-page">
      <div className="page-head">
        <div>
          <h1>My Profile</h1>
          <p className="muted">
            Manage and view your account information.
          </p>
        </div>
      </div>

      <div className="profile-card">
        <div className="profile-banner" />

        <div className="profile-content">
          <div className="profile-avatar">
            {initials || 'U'}
          </div>

          <h2>{name}</h2>
          <p className="muted">{email}</p>

          <div className="profile-divider" />

          <h3>Account Information</h3>

          <div className="profile-details">
            <div className="profile-detail">
              <span>Full name</span>
              <strong>{name}</strong>
            </div>

            <div className="profile-detail">
              <span>Email address</span>
              <strong>{email}</strong>
            </div>

            <div className="profile-detail">
              <span>Account ID</span>
              <strong className="profile-id">
                {user?.id || 'Unavailable'}
              </strong>
            </div>

            <div className="profile-detail">
              <span>Member since</span>
              <strong>
                {validDate
                  ? createdDate.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'Unavailable'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
