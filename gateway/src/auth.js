
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');

// Hash refresh tokens before storing them in the database.
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Remove sensitive information before returning user data.
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

// Generate access and refresh tokens.
async function issueTokens(cfg, store, user) {
  const accessToken = jwt.sign(
    { sub: user.id },
    cfg.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: cfg.accessTtlSeconds,
    }
  );

  const refreshToken = crypto.randomBytes(48).toString('base64url');

  const expiresAt = new Date(
    Date.now() + cfg.refreshTtlDays * 24 * 60 * 60 * 1000
  );

  await store.saveRefreshToken({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt,
  });

  return {
    user: publicUser(user),
    accessToken,
    refreshToken,
  };
}

// Middleware to protect routes using JWT authentication.

function requireAuth(cfg, { allowQueryToken = false } = {}) {
  return (req, res, next) => {
    const header = req.headers.authorization;

    let token;

    if (header) {
      const [scheme, value] = header.split(' ');

      if (scheme !== 'Bearer' || !value) {
        return next(
          new HttpError(401, 'Authentication required.', 'missing_token')
        );
      }

      token = value;
    } else if (allowQueryToken && typeof req.query.access_token === 'string') {
      token = req.query.access_token;
    }

    if (!token) {
      return next(
        new HttpError(401, 'Authentication required.', 'missing_token')
      );
    }

    try {
      const payload = jwt.verify(token, cfg.jwtSecret, {
        algorithms: ['HS256'],
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new Error('Invalid token payload');
      }

      req.userId = payload.sub;
      next();
    } catch {
      next(
        new HttpError(401, 'Invalid or expired token.', 'invalid_token')
      );
    }
  };
}


module.exports = {
  sha256,
  publicUser,
  issueTokens,
  requireAuth,
};
