import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_COOKIE_NAME = 'gp_session';
export const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const DEFAULT_SETUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePasswordStrength(password: unknown): PasswordValidationResult {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`
    };
  }
  return { valid: true };
}

export function hashPassword(password: string): string {
  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid password');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export function verifyPassword(password: unknown, storedHash: unknown): boolean {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return false;
  }
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH * 2) {
    return false;
  }
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64url');
    const expectedKey = Buffer.from(parts[5], 'base64url');

    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || salt.length < 8 || expectedKey.length < 32) {
      return false;
    }

    const actualKey = crypto.scryptSync(password, salt, expectedKey.length, { N, r, p });
    if (actualKey.length !== expectedKey.length) {
      return false;
    }
    return crypto.timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

export interface SetupTokenBundle {
  rawToken: string;
  token: string;
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
}

export function hashSetupToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim(), 'utf8').digest('hex');
}

export function generateSetupToken(ttlMs: number = DEFAULT_SETUP_TOKEN_TTL_MS): SetupTokenBundle {
  const rawToken = `gp_setup_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenHash = hashSetupToken(rawToken);
  const now = Date.now();
  return {
    rawToken,
    token: rawToken,
    tokenHash,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  };
}

export interface SetupTokenRecord {
  setupTokenHash?: string | null;
  setupTokenExpiresAt?: string | null;
  setupTokenUsedAt?: string | null;
}

export function verifySetupToken(
  rawToken: unknown,
  record: SetupTokenRecord,
  nowMs: number = Date.now()
): { valid: boolean; reason?: 'missing' | 'already_used' | 'expired' | 'mismatch' } {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    return { valid: false, reason: 'missing' };
  }
  if (record.setupTokenUsedAt) {
    return { valid: false, reason: 'already_used' };
  }
  if (!record.setupTokenHash || !record.setupTokenExpiresAt) {
    return { valid: false, reason: 'missing' };
  }
  const expiresMs = Date.parse(record.setupTokenExpiresAt);
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    return { valid: false, reason: 'expired' };
  }
  const actualHash = Buffer.from(hashSetupToken(rawToken), 'hex');
  const expectedHash = Buffer.from(record.setupTokenHash, 'hex');
  if (actualHash.length !== expectedHash.length || actualHash.length === 0) {
    return { valid: false, reason: 'mismatch' };
  }
  const matches = crypto.timingSafeEqual(actualHash, expectedHash);
  return matches ? { valid: true } : { valid: false, reason: 'mismatch' };
}

export function resolveSessionSecret(options?: {
  nodeEnv?: string;
  envSecret?: string;
  secretFilePath?: string;
}): string {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const envSecret = (options?.envSecret ?? process.env.GHOST_SESSION_SECRET ?? '').trim();

  if (nodeEnv === 'production' && !options?.secretFilePath) {
    if (!envSecret || envSecret.length < 32) {
      throw new Error(
        'FATAL: GHOST_SESSION_SECRET environment variable (minimum 32 characters) must be configured in production.'
      );
    }
    return envSecret;
  }

  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }

  const secretPath = options?.secretFilePath ?? path.join(process.cwd(), 'data', '.session_secret');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing.length >= 32) {
        return existing;
      }
    }
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const generated = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(48).toString('base64url');
  }
}

export function signSessionToken(sessionId: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(sessionId, 'utf8').digest('base64url');
  return `${sessionId}.${mac}`;
}

export function verifySignedSessionToken(token: unknown, secret: string): string | null {
  if (typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const dotIdx = token.indexOf('.');
  const sessionId = token.slice(0, dotIdx);
  const providedMac = token.slice(dotIdx + 1);
  if (!sessionId || !providedMac) {
    return null;
  }
  try {
    const expectedMac = crypto.createHmac('sha256', secret).update(sessionId, 'utf8').digest('base64url');
    const a = Buffer.from(providedMac, 'utf8');
    const b = Buffer.from(expectedMac, 'utf8');
    if (a.length !== b.length) return null;
    return crypto.timingSafeEqual(a, b) ? sessionId : null;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof cookieHeader !== 'string' || !cookieHeader) return result;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function serializeSessionCookie(
  signedToken: string,
  options?: { maxAgeSeconds?: number; isSecure?: boolean }
): string {
  const maxAge = options?.maxAgeSeconds ?? Math.floor(DEFAULT_SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedToken)}`,
    'Path=/',
    'HttpOnly',
    options?.isSecure ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (options?.isSecure) {
    parts.push('Secure');
    parts.push('Partitioned');
  }
  return parts.join('; ');
}

export function serializeClearSessionCookie(options?: { isSecure?: boolean }): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    options?.isSecure ? 'SameSite=None' : 'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (options?.isSecure) {
    parts.push('Secure');
    parts.push('Partitioned');
  }
  return parts.join('; ');
}

export function extractBearerOrHeaderSessionToken(headers?: {
  authorization?: unknown;
  'x-session-token'?: unknown;
}): string | null {
  if (!headers) return null;
  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().toLowerCase().startsWith('bearer ')) {
    const token = authHeader.trim().slice(7).trim();
    if (token) return token;
  }
  const customHeader = headers['x-session-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }
  return null;
}

export interface ServerSessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  revokedAt?: string | null;
  ip?: string;
  userAgent?: string;
}

export class SessionManager {
  private sessions = new Map<string, ServerSessionRecord>();
  private secret: string;
  private ttlMs: number;
  private persistPath?: string;

  constructor(options: { secret: string; ttlMs?: number; persistPath?: string }) {
    this.secret = options.secret;
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.persistPath = options.persistPath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
        if (Array.isArray(raw)) {
          const now = Date.now();
          for (const item of raw) {
            if (item && item.id && item.userId && !item.revokedAt && Date.parse(item.expiresAt) > now) {
              this.sessions.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // Ignore corrupt session file and start clean
    }
  }

  private saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const activeList = Array.from(this.sessions.values()).filter(
        s => !s.revokedAt && Date.parse(s.expiresAt) > Date.now()
      );
      fs.writeFileSync(this.persistPath, JSON.stringify(activeList, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });
    } catch {
      // Ignore persistence errors in restricted environments
    }
  }

  public createSession(
    userId: string,
    meta?: { ip?: string; userAgent?: string; isSecure?: boolean }
  ): { session: ServerSessionRecord; signedToken: string; setCookieHeader: string } {
    this.pruneExpired();
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const session: ServerSessionRecord = {
      id: sessionId,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      lastActiveAt: new Date(now).toISOString(),
      ip: meta?.ip,
      userAgent: meta?.userAgent
    };
    this.sessions.set(sessionId, session);
    this.saveToDisk();

    const signedToken = signSessionToken(sessionId, this.secret);
    const setCookieHeader = serializeSessionCookie(signedToken, {
      maxAgeSeconds: Math.floor(this.ttlMs / 1000),
      isSecure: meta?.isSecure
    });
    return { session, signedToken, setCookieHeader };
  }

  public verifyToken(signedToken: unknown, nowMs: number = Date.now()): ServerSessionRecord | null {
    const sessionId = verifySignedSessionToken(signedToken, this.secret);
    if (!sessionId) return null;
    const record = this.sessions.get(sessionId);
    if (!record) return null;
    if (record.revokedAt) return null;
    const expiresMs = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    record.lastActiveAt = new Date(nowMs).toISOString();
    return record;
  }

  public verifyCookieHeader(cookieHeader: unknown, nowMs: number = Date.now()): ServerSessionRecord | null {
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return null;
    return this.verifyToken(token, nowMs);
  }

  public verifyRequestHeaders(
    headers?: { cookie?: unknown; authorization?: unknown; 'x-session-token'?: unknown },
    nowMs: number = Date.now()
  ): ServerSessionRecord | null {
    if (!headers) return null;
    const fromCookie = this.verifyCookieHeader(headers.cookie, nowMs);
    if (fromCookie) return fromCookie;
    const bearerToken = extractBearerOrHeaderSessionToken(headers);
    if (bearerToken) {
      return this.verifyToken(bearerToken, nowMs);
    }
    return null;
  }

  public revokeSession(sessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    if (!record) return false;
    record.revokedAt = new Date().toISOString();
    this.sessions.delete(sessionId);
    this.saveToDisk();
    return true;
  }

  public revokeCookieHeader(cookieHeader: unknown): boolean {
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return false;
    const sessionId = verifySignedSessionToken(token, this.secret);
    if (!sessionId) return false;
    return this.revokeSession(sessionId);
  }

  public revokeRequestHeaders(headers?: {
    cookie?: unknown;
    authorization?: unknown;
    'x-session-token'?: unknown;
  }): boolean {
    if (!headers) return false;
    const revokedCookie = this.revokeCookieHeader(headers.cookie);
    const bearerToken = extractBearerOrHeaderSessionToken(headers);
    let revokedBearer = false;
    if (bearerToken) {
      const sessionId = verifySignedSessionToken(bearerToken, this.secret);
      if (sessionId) {
        revokedBearer = this.revokeSession(sessionId);
      }
    }
    return revokedCookie || revokedBearer;
  }

  public revokeAllUserSessions(userId: string): number {
    let count = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        count++;
      }
    }
    if (count > 0) {
      this.saveToDisk();
    }
    return count;
  }

  public revokeUserSessions(userId: string): number {
    return this.revokeAllUserSessions(userId);
  }

  public pruneExpired(nowMs: number = Date.now()): void {
    let removed = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.revokedAt || Date.parse(session.expiresAt) <= nowMs) {
        this.sessions.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.saveToDisk();
    }
  }
}

export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; firstAttemptMs: number; lockedUntilMs: number }>();
  private maxAttempts: number;
  private windowMs: number;
  private lockoutMs: number;

  constructor(options?: { maxAttempts?: number; windowMs?: number; lockoutMs?: number }) {
    this.maxAttempts = options?.maxAttempts ?? 5;
    this.windowMs = options?.windowMs ?? 15 * 60 * 1000;
    this.lockoutMs = options?.lockoutMs ?? 15 * 60 * 1000;
  }

  public check(key: string, nowMs: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const entry = this.attempts.get(key);
    if (!entry) return { allowed: true, retryAfterSeconds: 0 };

    if (entry.lockedUntilMs > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntilMs - nowMs) / 1000))
      };
    }

    if (nowMs - entry.firstAttemptMs > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  public recordFailure(key: string, nowMs: number = Date.now()): { locked: boolean; retryAfterSeconds: number } {
    const existing = this.attempts.get(key);
    if (!existing || nowMs - existing.firstAttemptMs > this.windowMs) {
      const lockedUntilMs = 1 >= this.maxAttempts ? nowMs + this.lockoutMs : 0;
      this.attempts.set(key, { count: 1, firstAttemptMs: nowMs, lockedUntilMs });
      return {
        locked: lockedUntilMs > nowMs,
        retryAfterSeconds: lockedUntilMs > nowMs ? Math.ceil(this.lockoutMs / 1000) : 0
      };
    }

    existing.count += 1;
    if (existing.count >= this.maxAttempts) {
      existing.lockedUntilMs = nowMs + this.lockoutMs;
      return {
        locked: true,
        retryAfterSeconds: Math.ceil(this.lockoutMs / 1000)
      };
    }
    return { locked: false, retryAfterSeconds: 0 };
  }

  public reset(key: string): void {
    this.attempts.delete(key);
  }
}

export function validateCsrfRequest(req: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}): { valid: boolean; reason?: string } {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true };
  }

  const headers = req.headers || {};
  const originHeader = typeof headers.origin === 'string' ? headers.origin.trim() : '';
  const hostHeader =
    (typeof headers['x-forwarded-host'] === 'string' && headers['x-forwarded-host'].split(',')[0].trim()) ||
    (typeof headers.host === 'string' && headers.host.trim()) ||
    '';

  const trustedEnv = (process.env.GHOST_TRUSTED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (process.env.APP_URL) {
    trustedEnv.push(process.env.APP_URL.trim());
  }

  if (originHeader && originHeader !== 'null') {
    try {
      const originUrl = new URL(originHeader);
      const matchesHost = hostHeader && originUrl.host.toLowerCase() === hostHeader.toLowerCase();
      const matchesTrusted = trustedEnv.some(trusted => {
        try {
          return new URL(trusted).host.toLowerCase() === originUrl.host.toLowerCase();
        } catch {
          return trusted.toLowerCase() === originHeader.toLowerCase();
        }
      });
      if (!matchesHost && !matchesTrusted) {
        return { valid: false, reason: 'Cross-origin state-changing request rejected.' };
      }
    } catch {
      return { valid: false, reason: 'Malformed Origin header.' };
    }
  }

  return { valid: true };
}

export function stripSensitiveCredentialFields<T extends Record<string, any>>(
  user: T
): T & { hasPassword: boolean; requiresPasswordSetup: boolean } {
  if (!user || typeof user !== 'object') return user as any;
  const clone: Record<string, any> = { ...user };
  const hasPassword = Boolean(clone.passwordHash);
  delete clone.passwordHash;
  delete clone.passwordUpdatedAt;
  delete clone.setupTokenHash;
  delete clone.setupTokenExpiresAt;
  delete clone.setupTokenUsedAt;
  delete clone.setupTokenIssuedAt;
  clone.hasPassword = hasPassword;
  clone.requiresPasswordSetup = !hasPassword;
  return clone as T & { hasPassword: boolean; requiresPasswordSetup: boolean };
}

export function sanitizeUserForPublic(user: Record<string, any>): Record<string, any> {
  if (!user || typeof user !== 'object') return {};
  const showCity = user.privacySettings?.showCity !== false;
  const showBike = user.privacySettings?.showMotorcycleDetails !== false;
  const hasPassword = Boolean(user.passwordHash);

  return {
    id: user.id,
    fullName: user.fullName,
    originalName: user.originalName,
    customPrimaryName: user.customPrimaryName ?? null,
    pilotNickname: user.pilotNickname ?? null,
    customSecondaryTag: user.customSecondaryTag ?? null,
    hideSecondaryTag: Boolean(user.hideSecondaryTag),
    secondaryTag: user.secondaryTag ?? null,
    city: showCity ? user.city : 'Redacted Sector',
    state: showCity ? user.state : '',
    motorcycleModel: showBike ? user.motorcycleModel : 'Other Ultraviolette',
    variant: showBike ? user.variant : 'Classified',
    role: user.role,
    isOwner: Boolean(user.isOwner),
    verificationStatus: user.verificationStatus,
    joinedAt: user.joinedAt,
    avatarUrl: user.avatarUrl,
    optInSquadronAssist: Boolean(user.optInSquadronAssist),
    hasPassword,
    requiresPasswordSetup: !hasPassword,
    privacySettings: user.privacySettings || {
      showStartingPoint: false,
      showCity: true,
      showMotorcycleDetails: true
    }
  };
}

export function sanitizeRideForViewer(
  ride: Record<string, any>,
  viewer: Record<string, any> | null
): Record<string, any> {
  if (!ride || typeof ride !== 'object') return ride;
  const isViewerAdminOrLeader =
    viewer &&
    (viewer.isOwner === true ||
      viewer.role === 'admin' ||
      viewer.id === 'u_admin' ||
      viewer.id === ride.rideLeaderId);

  const participants = Array.isArray(ride.participants)
    ? ride.participants.map((p: Record<string, any>) => {
        const isSelf = viewer && (p.userId === viewer.id || p.id === viewer.id);
        const canSeeStart = Boolean(isViewerAdminOrLeader || isSelf || p.shareStartingPoint === true);
        if (canSeeStart) return p;
        const redacted = { ...p };
        delete redacted.startingPoint;
        return redacted;
      })
    : [];

  return {
    ...ride,
    participants
  };
}

export function sanitizeEmergencyForViewer(
  emergency: Record<string, any>,
  viewer: Record<string, any> | null | boolean
): Record<string, any> {
  if (!emergency || typeof emergency !== 'object') return emergency;
  if (viewer) {
    return emergency;
  }
  const clone: Record<string, any> = { ...emergency };
  delete clone.callbackPhone;
  clone.accessLogs = [];
  if (typeof clone.latitude === 'number') {
    clone.latitude = Math.round(clone.latitude * 100) / 100;
  }
  if (typeof clone.longitude === 'number') {
    clone.longitude = Math.round(clone.longitude * 100) / 100;
  }
  if (clone.coordinates && typeof clone.coordinates === 'object') {
    clone.coordinates = {
      ...clone.coordinates,
      ...(typeof clone.coordinates.lat === 'number'
        ? { lat: Math.round(clone.coordinates.lat * 100) / 100 }
        : {}),
      ...(typeof clone.coordinates.lng === 'number'
        ? { lng: Math.round(clone.coordinates.lng * 100) / 100 }
        : {})
    };
  }
  if (Array.isArray(clone.responders)) {
    clone.responders = clone.responders.map((r: Record<string, any>) => {
      if (!r || typeof r !== 'object') return r;
      const cleanR = { ...r };
      delete cleanR.phone;
      delete cleanR.mobile;
      return cleanR;
    });
  }
  return clone;
}

export function sanitizeMarketplaceItemForViewer(
  item: Record<string, any>,
  viewer: Record<string, any> | null | boolean
): Record<string, any> {
  if (!item || typeof item !== 'object') return item;
  if (viewer) return item;
  const clone: Record<string, any> = { ...item };
  delete clone.contactPhone;
  delete clone.sellerPhone;
  delete clone.sellerEmail;
  if ('contactInfo' in clone) {
    clone.contactInfo = 'Sign in to view seller contact details';
  }
  return clone;
}
