
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { HttpError, DuplicateError } = require('../errors');
const { sha256, publicUser, issueTokens, requireAuth } = require('../auth');

// Email must have a valid format and a domain containing a dot.
// This rejects addresses such as 123@123 and user@gmail.
const email = z
  .string()
  .trim()
  .max(254, 'Email address is too long.')
  .pipe(z.email('Enter a valid email address.'))
  .refine((value) => {
    const domain = value.split('@')[1];
    if (!domain || !domain.includes('.')) return false;

    const labels = domain.split('.');
    return labels.every((label) =>
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
    ) && /^[a-zA-Z]{2,}$/.test(labels[labels.length - 1]);
  }, 'Enter a valid email address with a valid domain.');

// Password must contain uppercase, lowercase, number and special character.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).+$/,
    'Password must contain uppercase, lowercase, number and special character.'
  )
  .refine(
    (value) => Buffer.byteLength(value) <= 72,
    'Password is too long (max 72 bytes).'
  );

// Name must contain letters, with optional spaces, apostrophes, dots or hyphens.
const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(80, 'Name cannot exceed 80 characters.')
  .regex(
    /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u,
    'Enter a valid name containing letters only.'
  );

const registerSchema = z.object({
  name,
  email,
  password,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

module.exports = function authRoutes({ cfg, store }) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const body = registerSchema.parse(req.body);

    const normalizedEmail = body.email.toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, 10);

    let user;

    try {
      user = await store.createUser({
        email: normalizedEmail,
        name: body.name,
        passwordHash,
      });
    } catch (e) {
      if (e instanceof DuplicateError) {
        throw new HttpError(
          409,
          'An account with this email already exists.',
          'email_taken'
        );
      }
      throw e;
    }

    res.status(201).json(await issueTokens(cfg, store, user));
  });

  router.post('/login', async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await store.findUserByEmail(
      body.email.toLowerCase()
    );

    const ok = await bcrypt.compare(
      body.password,
      user ? user.passwordHash : DUMMY_HASH
    );

    if (!user || !ok) {
      throw new HttpError(
        401,
        'Incorrect email or password.',
        'bad_credentials'
      );
    }

    res.json(await issueTokens(cfg, store, user));
  });

  // Refresh tokens are single-use.
  router.post('/refresh', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const hash = sha256(refreshToken);

    const record = await store.findRefreshToken(hash);

    if (!record) {
      throw new HttpError(
        401,
        'Invalid or expired refresh token.',
        'invalid_refresh'
      );
    }

    if (!(await store.deleteRefreshToken(hash))) {
      throw new HttpError(
        401,
        'Invalid or expired refresh token.',
        'invalid_refresh'
      );
    }

    const user = await store.findUserById(record.userId);

    if (!user) {
      throw new HttpError(
        401,
        'Invalid or expired refresh token.',
        'invalid_refresh'
      );
    }

    res.json(await issueTokens(cfg, store, user));
  });

  router.post('/logout', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await store.deleteRefreshToken(sha256(refreshToken));
    res.status(204).end();
  });

  router.get('/me', requireAuth(cfg), async (req, res) => {
    const user = await store.findUserById(req.userId);

    if (!user) {
      throw new HttpError(
        401,
        'Account no longer exists.',
        'invalid_token'
      );
    }

    res.json(publicUser(user));
  });

  return router;
};
