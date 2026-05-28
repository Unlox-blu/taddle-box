'use strict';

const { hashPassword, comparePassword } = require('../utils/password.util');
const {
  generateAccessToken, generateRefreshToken,
  generateRandomToken, hashToken, verifyRefreshToken,
} = require('../utils/token.util');
const { createError } = require('../utils/error.util');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

class AuthService {
  constructor({ userRepository, walletRepository, emailIntegration, googleIntegration }) {
    this.userRepo = userRepository;
    this.walletRepo = walletRepository;
    this.emailSvc = emailIntegration;
    this.googleSvc = googleIntegration;
  }

  // Registers a new user, auto-creates wallet, queues verification email.
  async signup({ name, username, email, password }) {
    const [existingEmail, existingUsername] = await Promise.all([
      this.userRepo.findByEmail(email),
      this.userRepo.findByUsername(username),
    ]);
    if (existingEmail) throw createError('Email is already registered', 409);
    if (existingUsername) throw createError('Username is already taken', 409);

    const passwordHash = await hashPassword(password);
    const user = await this.userRepo.create({ name, username, email, passwordHash });

    // Auto-create wallet for new user
    await this.walletRepo.create(user.id);

    // Generate + store email verify token
    const rawToken = generateRandomToken();
    const tokenHash = hashToken(rawToken);
    const tokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await this.userRepo.updateEmailVerifyToken(user.id, tokenHash, tokenExp);

    // Non-blocking: fire verification email via integration
    this.emailSvc.sendVerificationEmail(email, name, rawToken).catch(console.error);

    return { user };
  }

  // Authenticates user with email + password.
  async login({ email, password }) {
    const user = await this.userRepo.findByEmail(email);
    if (!user) throw createError('Invalid email or password', 401);
    if (user.is_banned) throw createError('Your account has been suspended', 403);
    if (!user.is_active) throw createError('Your account is deactivated', 403);
    if (!user.password_hash) throw createError('Please sign in with Google', 400);

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) throw createError('Invalid email or password', 401);

    return this._issueTokens(user);
  }

  // Authenticates or registers via Google ID token.
  async googleAuth(idToken) {
    const { googleId, email, name, picture } = await this.googleSvc.verifyGoogleToken(idToken);

    let user = await this.userRepo.findByGoogleId(googleId);

    if (!user) {
      const existing = await this.userRepo.findByEmail(email);
      if (existing) {
        user = await this.userRepo.linkGoogleAccount(existing.id, googleId, picture);
      } else {
        const username = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;
        user = await this.userRepo.createWithGoogle({ name, username, email, googleId, googleAvatar: picture });
        await this.walletRepo.create(user.id);
        this.emailSvc.sendWelcomeEmail(email, name).catch(console.error);
      }
    }

    if (user.is_banned) throw createError('Your account has been suspended', 403);
    return this._issueTokens(user);
  }

  // Rotates refresh token. Validates hash against DB.
  async refreshToken(rawRefreshToken) {
    if (!rawRefreshToken) throw createError('Refresh token missing', 401);

    const payload = verifyRefreshToken(rawRefreshToken);
    const user = await this.userRepo.findByIdPrivate(payload.userId);
    if (!user || user.refresh_token_hash !== hashToken(rawRefreshToken)) {
      throw createError('Invalid refresh token', 401);
    }

    return this._issueTokens(user);
  }

  // Clears refresh token in DB (invalidates all sessions for this token family).
  async logout(userId) {
    await this.userRepo.updateRefreshToken(userId, null);
  }

  // Sends password reset email if email belongs to a password-based account.
  async forgotPassword(email) {
    const user = await this.userRepo.findByEmail(email);
    if (user && user.password_hash) {
      const rawToken = generateRandomToken();
      const tokenHash = hashToken(rawToken);
      const tokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await this.userRepo.updatePasswordResetToken(user.id, tokenHash, tokenExp);
      this.emailSvc.sendPasswordResetEmail(email, user.name, rawToken).catch(console.error);
    }
    // Always resolve — no user enumeration
  }

  // Resets password using a valid reset token.
  async resetPassword(rawToken, newPassword) {
    // TODO: add findByPasswordResetToken() to userRepository
    throw createError('Not implemented — add findByPasswordResetToken() to user.repository.js', 501);
  }

  // Verifies email using token from email link.
  async verifyEmail(rawToken) {
    // TODO: add findByEmailVerifyToken() to userRepository
    throw createError('Not implemented — add findByEmailVerifyToken() to user.repository.js', 501);
  }

  // Private
  async _issueTokens(user) {
    const payload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await this.userRepo.updateRefreshToken(user.id, hashToken(refreshToken));
    await this.userRepo.updateLastLogin(user.id);

    return { userId: user.id, role: user.role, accessToken, refreshToken, cookieOpts: COOKIE_OPTS };
  }
}

module.exports = AuthService;
