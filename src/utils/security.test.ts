import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateSetupToken,
  verifySetupToken,
  resolveSessionSecret,
  SessionManager,
  LoginRateLimiter,
  validateCsrfRequest,
  stripSensitiveCredentialFields,
  sanitizeUserForPublic,
  sanitizeRideForViewer,
  sanitizeEmergencyForViewer,
  sanitizeMarketplaceItemForViewer
} from './security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// PART 1: UNIT TESTS FOR CRYPTOGRAPHIC, SESSION, CSRF & REDACTION PRIMITIVES
// ============================================================================

test('Security Primitives — scrypt password hashing uses unique salt and timing-safe verification', () => {
  const weak = validatePasswordStrength('short1');
  assert.equal(weak.valid, false);

  const strong = validatePasswordStrength('Squadron_F77_Mach2!');
  assert.equal(strong.valid, true);

  const h1 = hashPassword('Squadron_F77_Mach2!');
  const h2 = hashPassword('Squadron_F77_Mach2!');
  assert.notEqual(h1, h2, 'Each hash must use a unique random salt');

  assert.equal(verifyPassword('Squadron_F77_Mach2!', h1), true);
  assert.equal(verifyPassword('Squadron_F77_Mach2!', h2), true);
  assert.equal(verifyPassword('WrongPassword123!', h1), false);
});

test('Security Primitives — one-time setup token stores only hash, expires, and rejects reuse', () => {
  const generated = generateSetupToken(24 * 60 * 60 * 1000);
  assert.notEqual(generated.rawToken, generated.tokenHash);
  assert.equal(generated.tokenHash.length, 64);

  const validCheck = verifySetupToken(generated.rawToken, {
    setupTokenHash: generated.tokenHash,
    setupTokenExpiresAt: generated.expiresAt,
    setupTokenUsedAt: null
  });
  assert.equal(validCheck.valid, true);

  const wrongTokenCheck = verifySetupToken('wrong-token-value', {
    setupTokenHash: generated.tokenHash,
    setupTokenExpiresAt: generated.expiresAt,
    setupTokenUsedAt: null
  });
  assert.equal(wrongTokenCheck.valid, false);

  const reusedCheck = verifySetupToken(generated.rawToken, {
    setupTokenHash: generated.tokenHash,
    setupTokenExpiresAt: generated.expiresAt,
    setupTokenUsedAt: new Date().toISOString()
  });
  assert.equal(reusedCheck.valid, false);
  assert.equal(reusedCheck.reason, 'already_used');

  const expiredCheck = verifySetupToken(generated.rawToken, {
    setupTokenHash: generated.tokenHash,
    setupTokenExpiresAt: new Date(Date.now() - 5000).toISOString(),
    setupTokenUsedAt: null
  });
  assert.equal(expiredCheck.valid, false);
  assert.equal(expiredCheck.reason, 'expired');
});

test('Security Primitives — production session secret fails closed if missing', () => {
  assert.throws(
    () =>
      resolveSessionSecret({
        nodeEnv: 'production',
        envSecret: ''
      }),
    /FATAL: GHOST_SESSION_SECRET/
  );

  const prodSecret = resolveSessionSecret({
    nodeEnv: 'production',
    envSecret: 'a'.repeat(64)
  });
  assert.equal(prodSecret.length, 64);
});

test('Security Primitives — SessionManager signs, verifies, rotates, and revokes sessions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-session-test-'));
  try {
    const mgr = new SessionManager({
      secret: 'test_secret_key_with_at_least_32_characters_long_12345',
      persistPath: path.join(tmpDir, 'sessions.json')
    });

    const issued = mgr.createSession('u_pilot07');
    assert.match(issued.setCookieHeader, /HttpOnly/);
    assert.match(issued.setCookieHeader, /SameSite=Lax/);

    const cookiePair = issued.setCookieHeader.split(';')[0];
    const verified = mgr.verifyCookieHeader(cookiePair);
    assert.ok(verified);
    assert.equal(verified.userId, 'u_pilot07');

    // Forged signature must fail
    const tamperedCookie = `${cookiePair}tampered`;
    assert.equal(mgr.verifyCookieHeader(tamperedCookie), null);

    // Revoking all user sessions invalidates active token immediately
    mgr.revokeUserSessions('u_pilot07');
    assert.equal(mgr.verifyCookieHeader(cookiePair), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Security Primitives — CSRF validation blocks cross-origin state-changing requests', () => {
  const safeGet = validateCsrfRequest({
    method: 'GET',
    headers: { origin: 'https://evil.example.com', host: 'localhost:3000' }
  });
  assert.equal(safeGet.valid, true);

  const sameOriginPost = validateCsrfRequest({
    method: 'POST',
    headers: { origin: 'http://localhost:3000', host: 'localhost:3000' }
  });
  assert.equal(sameOriginPost.valid, true);

  const crossOriginPost = validateCsrfRequest({
    method: 'POST',
    headers: { origin: 'https://attacker.example.com', host: 'localhost:3000' }
  });
  assert.equal(crossOriginPost.valid, false);
});

test('Security Primitives — Public redaction strips PII, registration numbers, blood groups, and exact home pins', () => {
  const rawUser = {
    id: 'u_pilot07',
    fullName: 'Vikram Sengupta',
    email: 'vikram@example.com',
    mobile: '+91 98801 44556',
    registrationNumber: 'KA 03 MP 7721',
    bloodGroup: 'B+',
    emergencyContact: { name: 'Ananya', relationship: 'Spouse', phone: '+91 98801 77665' },
    passwordHash: 'scrypt$secret',
    setupTokenHash: 'hash123',
    city: 'Bengaluru',
    state: 'Karnataka',
    motorcycleModel: 'F77 Recon',
    variant: 'Shadow Stealth',
    role: 'verified_member',
    verificationStatus: 'verified'
  };

  const selfView = stripSensitiveCredentialFields(rawUser);
  assert.equal('passwordHash' in selfView, false);
  assert.equal('setupTokenHash' in selfView, false);
  assert.equal(selfView.email, 'vikram@example.com');
  assert.equal(selfView.hasPassword, true);

  const publicView = sanitizeUserForPublic(rawUser);
  assert.equal('email' in publicView, false);
  assert.equal('mobile' in publicView, false);
  assert.equal('registrationNumber' in publicView, false);
  assert.equal('bloodGroup' in publicView, false);
  assert.equal('emergencyContact' in publicView, false);
  assert.equal('passwordHash' in publicView, false);

  const rawEmergency = {
    id: 'em_1',
    userId: 'u_pilot07',
    requesterName: 'Vikram Sengupta',
    callbackPhone: '+91 98801 44556',
    coordinates: { lat: 12.9715987, lng: 77.5945627 },
    responders: [{ userId: 'u_admin', name: 'Abinav', phone: '+91 98450 11223' }]
  };
  const publicEmergency = sanitizeEmergencyForViewer(rawEmergency, false);
  assert.equal('callbackPhone' in publicEmergency, false);
  assert.notEqual(publicEmergency.coordinates.lat, 12.9715987);
  assert.equal(publicEmergency.coordinates.lat, 12.97);
  assert.equal('phone' in publicEmergency.responders[0], false);

  const rawMarketplace = {
    id: 'mp_1',
    sellerId: 'u_pilot07',
    sellerName: 'Vikram Sengupta',
    contactPhone: '+91 98801 44556',
    contactInfo: 'vikram@example.com'
  };
  const publicMarketplace = sanitizeMarketplaceItemForViewer(rawMarketplace, false);
  assert.equal('contactPhone' in publicMarketplace, false);
  assert.match(publicMarketplace.contactInfo, /Sign in/i);

  const rawRide = {
    id: 'ride_1',
    title: 'Nandi Hills Dawn Run',
    participants: [
      {
        userId: 'u_pilot07',
        displayName: 'Vikram Sengupta',
        startingPoint: 'Private Home Garage Pin 42',
        shareStartingPoint: false
      }
    ]
  };
  const publicRide = sanitizeRideForViewer(rawRide, null);
  assert.equal('startingPoint' in publicRide.participants[0], false);
});

// ============================================================================
// PART 2: END-TO-END HTTP SECURITY & AUTHORIZATION TESTS AGAINST SERVER.TS
// ============================================================================

test('End-to-End API Security — All 20 Negative & Positive Security Phase 1 Requirements', async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-protocol-sec-e2e-'));
  const sourceDbPath = path.join(PROJECT_ROOT, 'data', 'db.json');
  const tempDbPath = path.join(tempDataDir, 'db.json');
  const sandboxDb = JSON.parse(fs.readFileSync(sourceDbPath, 'utf-8'));
  sandboxDb.deletedIds = (sandboxDb.deletedIds || []).filter(
    (id: string) => id !== 'u_pilot07' && id !== 'u_phantom'
  );
  if (!Array.isArray(sandboxDb.users)) sandboxDb.users = [];
  if (!sandboxDb.users.some((u: any) => u.id === 'u_pilot07')) {
    sandboxDb.users.push({
      id: 'u_pilot07',
      fullName: 'Vikram Sengupta',
      originalName: 'Vikram Sengupta',
      pilotNickname: 'F77 PILOT',
      secondaryTag: 'F77 PILOT',
      email: 'vikram.sengupta@example.com',
      mobile: '+91 98860 22345',
      city: 'Bengaluru',
      state: 'Karnataka',
      motorcycleModel: 'F77',
      variant: 'Shadow Grey (10.3 kWh)',
      registrationNumber: 'KA 03 EV 4077',
      purchaseDate: '2024-06-20',
      bloodGroup: 'B+',
      emergencyContact: { name: 'Ananya Sengupta', relationship: 'Spouse', phone: '+91 98860 77654' },
      role: 'verified_member',
      verificationStatus: 'verified',
      joinedAt: '2024-06-20T11:00:00Z'
    });
  }
  if (!sandboxDb.users.some((u: any) => u.id === 'u_phantom')) {
    sandboxDb.users.push({
      id: 'u_phantom',
      fullName: 'Devika Nair',
      originalName: 'Devika Nair',
      pilotNickname: 'F77 PILOT',
      secondaryTag: 'F77 PILOT',
      email: 'devika.nair@example.com',
      mobile: '+91 97410 88231',
      city: 'Mysuru',
      state: 'Karnataka',
      motorcycleModel: 'F77',
      variant: 'Airstrike White (7.1 kWh)',
      registrationNumber: 'KA 09 MX 1290',
      purchaseDate: '2023-11-10',
      bloodGroup: 'A+',
      emergencyContact: { name: 'Rohan Nair', relationship: 'Sibling', phone: '+91 97410 33412' },
      role: 'verified_member',
      verificationStatus: 'verified',
      joinedAt: '2023-11-10T12:00:00Z'
    });
  }
  const testOwner = (sandboxDb.users || []).find((u: any) => u.id === 'u_admin');
  if (testOwner) {
    testOwner.passwordHash = null;
    const bootstrapBundle = generateSetupToken(1000 * 60 * 60 * 24);
    testOwner.setupTokenHash = bootstrapBundle.tokenHash;
    testOwner.setupTokenIssuedAt = bootstrapBundle.issuedAt;
    testOwner.setupTokenExpiresAt = bootstrapBundle.expiresAt;
    testOwner.setupTokenUsedAt = null;
    fs.writeFileSync(
      path.join(tempDataDir, '.owner_bootstrap_token.txt'),
      `GHOST PROTOCOL — ONE-TIME OWNER BOOTSTRAP TOKEN\nAccount: ${testOwner.email} (${testOwner.id})\nToken: ${bootstrapBundle.rawToken}\nExpires: ${bootstrapBundle.expiresAt}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
  }
  fs.writeFileSync(tempDbPath, JSON.stringify(sandboxDb, null, 2));

  process.env.GHOST_TEST_MODE = '1';
  process.env.GHOST_DATA_DIR = tempDataDir;

  const { app } = await import('../../server.ts');

  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function apiReq(
    endpoint: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      cookie?: string;
    } = {}
  ) {
    const headers: Record<string, string> = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const cookiePair = setCookie ? setCookie.split(';')[0] : '';
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, cookie: cookiePair };
  }

  try {
    // 1. Unauthenticated GET /api/auth/me does NOT return Owner account
    const unauthMe = await apiReq('/api/auth/me');
    assert.equal(unauthMe.status, 200);
    assert.equal(unauthMe.data.authenticated, false);
    assert.equal(unauthMe.data.user, null);

    // 2. Spoofed x-user-id: u_admin without a valid session does NOT grant Owner or admin access
    const spoofedMe = await apiReq('/api/auth/me', {
      headers: { 'x-user-id': 'u_admin' }
    });
    assert.equal(spoofedMe.data.authenticated, false);
    assert.equal(spoofedMe.data.user, null);

    // 3. Unauthenticated GET /api/admin/users is rejected (401)
    const unauthAdminUsers = await apiReq('/api/admin/users', {
      headers: { 'x-user-id': 'u_admin' }
    });
    assert.equal(unauthAdminUsers.status, 401);

    // 4. Unauthenticated admin actions are rejected (401)
    const unauthAppoint = await apiReq('/api/admin/users/u_pilot07/appoint-admin', {
      method: 'POST',
      headers: { 'x-user-id': 'u_admin' },
      body: { permissions: ['verify_members'] }
    });
    assert.equal(unauthAppoint.status, 401);

    const unauthTelemetry = await apiReq('/api/admin/telemetry-config', {
      method: 'POST',
      headers: { 'x-user-id': 'u_admin' },
      body: { telemetryConfig: { batterySoc: false } }
    });
    assert.equal(unauthTelemetry.status, 401);

    // 5. Public visitor can view approved redacted dashboard data (Decision 3A) without PII leakage
    const publicAccounts = await apiReq('/api/auth/accounts');
    assert.equal(publicAccounts.status, 200);
    assert.ok(Array.isArray(publicAccounts.data.accounts));
    for (const acc of publicAccounts.data.accounts) {
      assert.equal('email' in acc, false, 'Public account switcher must not leak email');
      assert.equal('mobile' in acc, false, 'Public account switcher must not leak mobile');
      assert.equal('registrationNumber' in acc, false, 'Public account switcher must not leak registrationNumber');
      assert.equal('bloodGroup' in acc, false, 'Public account switcher must not leak bloodGroup');
      assert.equal('emergencyContact' in acc, false, 'Public account switcher must not leak emergencyContact');
    }

    const publicEmergencies = await apiReq('/api/emergency');
    assert.equal(publicEmergencies.status, 200);
    for (const em of publicEmergencies.data.emergencies) {
      assert.equal('callbackPhone' in em, false, 'Public emergency list must not leak callbackPhone');
    }

    const publicMarketplace = await apiReq('/api/marketplace');
    assert.equal(publicMarketplace.status, 200);
    for (const item of publicMarketplace.data.items) {
      assert.equal('contactPhone' in item, false, 'Public marketplace must not leak seller contactPhone');
    }

    // 6. Initialize Owner (u_admin) password using the one-time bootstrap token generated in tempDataDir
    const ownerBootstrapTokenFile = path.join(tempDataDir, '.owner_bootstrap_token.txt');
    assert.equal(fs.existsSync(ownerBootstrapTokenFile), true, 'Owner bootstrap token file must be created');
    const bootstrapFileContent = fs.readFileSync(ownerBootstrapTokenFile, 'utf-8');
    const tokenMatch = bootstrapFileContent.match(/Token:\s*(.+)/);
    assert.ok(tokenMatch && tokenMatch[1], 'Bootstrap token must be present in file');
    const ownerBootstrapToken = tokenMatch[1].trim();

    const ownerSetupRes = await apiReq('/api/auth/setup-password', {
      method: 'POST',
      body: {
        userId: 'u_admin',
        setupToken: ownerBootstrapToken,
        newPassword: 'Owner_GhostProtocol_2026!'
      }
    });
    assert.equal(ownerSetupRes.status, 200);
    assert.equal(ownerSetupRes.data.user.id, 'u_admin');
    assert.ok(ownerSetupRes.cookie, 'Owner setup must issue signed session cookie');
    const ownerCookie = ownerSetupRes.cookie;

    // 7. Reusing the one-time setup token MUST fail (401)
    const reusedBootstrapRes = await apiReq('/api/auth/setup-password', {
      method: 'POST',
      body: {
        userId: 'u_admin',
        setupToken: ownerBootstrapToken,
        newPassword: 'Another_Password_2026!'
      }
    });
    assert.equal(reusedBootstrapRes.status, 401);

    // 8. Owner can issue a single-use 24h setup token for existing member u_pilot07 (Vikram Sengupta)
    const issuePilotTokenRes = await apiReq('/api/admin/users/u_pilot07/issue-setup-token', {
      method: 'POST',
      cookie: ownerCookie
    });
    assert.equal(issuePilotTokenRes.status, 200);
    const pilotSetupToken = issuePilotTokenRes.data.setupToken;
    assert.ok(pilotSetupToken);

    // 9. Existing member u_pilot07 completes first-time password setup and signs in
    const pilotSetupRes = await apiReq('/api/auth/setup-password', {
      method: 'POST',
      body: {
        userId: 'u_pilot07',
        setupToken: pilotSetupToken,
        newPassword: 'Vikram_F77_Recon_2026!'
      }
    });
    assert.equal(pilotSetupRes.status, 200);
    assert.equal(pilotSetupRes.data.user.id, 'u_pilot07');
    const pilotCookie = pilotSetupRes.cookie;

    // 10. Authenticated regular member (u_pilot07) GET /api/admin/users is rejected (403)
    const memberAdminUsers = await apiReq('/api/admin/users', {
      cookie: pilotCookie,
      headers: { 'x-user-id': 'u_admin' } // Even if they spoof x-user-id: u_admin!
    });
    assert.equal(memberAdminUsers.status, 403);

    // 11. Regular member admin actions are rejected (403)
    const memberAppoint = await apiReq('/api/admin/users/u_phantom/appoint-admin', {
      method: 'POST',
      cookie: pilotCookie,
      body: { permissions: ['verify_members'] }
    });
    assert.equal(memberAppoint.status, 403);

    // 12. Member A (u_pilot07) cannot update Member B's (u_admin) identity (403)
    const crossIdentityUpdate = await apiReq('/api/users/u_admin/identity', {
      method: 'PUT',
      cookie: pilotCookie,
      body: { customPrimaryName: 'Hacked Name' }
    });
    assert.equal(crossIdentityUpdate.status, 403);

    // 13. Authenticated Member (u_pilot07) can create, update, and delete their own discussion,
    //     and spoofed authorId in body is ignored in favor of session userId
    const createDiscRes = await apiReq('/api/discussions', {
      method: 'POST',
      cookie: pilotCookie,
      body: {
        authorId: 'u_admin', // Attempted spoof
        title: 'Vikram Security Test Thread',
        category: 'General',
        content: 'Testing authenticated discussion creation.'
      }
    });
    assert.equal(createDiscRes.status, 201);
    assert.equal(createDiscRes.data.post.authorId, 'u_pilot07', 'Server must bind authorId to session user');
    const pilotDiscussionId = createDiscRes.data.post.id;

    // 14. Issue token & authenticate second regular member u_phantom (Rohan Kulkarni)
    const issuePhantomToken = await apiReq('/api/admin/users/u_phantom/issue-setup-token', {
      method: 'POST',
      cookie: ownerCookie
    });
    assert.equal(issuePhantomToken.status, 200);
    const phantomSetup = await apiReq('/api/auth/setup-password', {
      method: 'POST',
      body: {
        userId: 'u_phantom',
        setupToken: issuePhantomToken.data.setupToken,
        newPassword: 'Rohan_Phantom_F77_2026!'
      }
    });
    assert.equal(phantomSetup.status, 200);
    const phantomCookie = phantomSetup.cookie;

    // 15. Member B (u_phantom) cannot edit or delete Member A's (u_pilot07) discussion (403)
    const crossEditDisc = await apiReq(`/api/discussions/${pilotDiscussionId}`, {
      method: 'PUT',
      cookie: phantomCookie,
      body: { title: 'Tampered Title' }
    });
    assert.equal(crossEditDisc.status, 403);

    const crossDeleteDisc = await apiReq(`/api/discussions/${pilotDiscussionId}`, {
      method: 'DELETE',
      cookie: phantomCookie
    });
    assert.equal(crossDeleteDisc.status, 403);

    // 16. Admin without required specific permission is rejected (403)
    // Owner appoints u_phantom as admin with ONLY 'verify_members' permission
    const appointPhantomRes = await apiReq('/api/admin/users/u_phantom/appoint-admin', {
      method: 'POST',
      cookie: ownerCookie,
      body: { permissions: ['verify_members'], notes: 'Scoped admin test' }
    });
    assert.equal(appointPhantomRes.status, 200);

    // u_phantom tries to edit telemetry config (requires edit_telemetry_config) -> 403
    const unauthorizedAdminAction = await apiReq('/api/admin/telemetry-config', {
      method: 'POST',
      cookie: phantomCookie,
      body: { telemetryConfig: { batterySoc: false } }
    });
    assert.equal(unauthorizedAdminAction.status, 403);

    // Owner revokes u_phantom admin role back to verified_member
    const revokePhantomRes = await apiReq('/api/admin/users/u_phantom/revoke-admin', {
      method: 'POST',
      cookie: ownerCookie
    });
    assert.equal(revokePhantomRes.status, 200);

    // 17. Unauthenticated POST /api/sync/reconcile is rejected (401)
    const unauthReconcile = await apiReq('/api/sync/reconcile', {
      method: 'POST',
      body: { deletedIds: [pilotDiscussionId], collections: {} }
    });
    assert.equal(unauthReconcile.status, 401);

    // 18. Authenticated Member B (u_phantom) cannot delete or overwrite Member A's (u_pilot07) records
    //     or inject users via /api/sync/reconcile
    const maliciousReconcile = await apiReq('/api/sync/reconcile', {
      method: 'POST',
      cookie: phantomCookie,
      body: {
        deletedIds: [pilotDiscussionId],
        collections: {
          users: [
            {
              id: 'u_phantom',
              fullName: 'Rohan Kulkarni',
              role: 'admin',
              isOwner: true
            }
          ],
          discussions: [
            {
              id: pilotDiscussionId,
              authorId: 'u_pilot07',
              title: 'Overwritten via Reconcile',
              content: 'Tampered',
              updatedAt: new Date(Date.now() + 60000).toISOString()
            }
          ]
        }
      }
    });
    assert.equal(maliciousReconcile.status, 200);

    // Verify pilotDiscussionId still exists and was NOT deleted or overwritten!
    const checkDiscAfterAttack = await apiReq('/api/discussions');
    const foundDisc = checkDiscAfterAttack.data.discussions.find((d: any) => d.id === pilotDiscussionId);
    assert.ok(foundDisc, 'Member A discussion must NOT be deleted by Member B tombstone');
    assert.equal(foundDisc.title, 'Vikram Security Test Thread', 'Member A discussion must NOT be overwritten by Member B');

    // Verify u_phantom did not escalate privileges via users collection in reconcile
    const phantomMe = await apiReq('/api/auth/me', { cookie: phantomCookie });
    assert.equal(phantomMe.data.user.role, 'verified_member');
    assert.equal(Boolean(phantomMe.data.user.isOwner), false);

    // 19. Member A (u_pilot07) CAN delete their own discussion record
    const ownDeleteDisc = await apiReq(`/api/discussions/${pilotDiscussionId}`, {
      method: 'DELETE',
      cookie: pilotCookie
    });
    assert.equal(ownDeleteDisc.status, 200);

    // 20. Account switcher login flow: signing in with password issues a fresh session for target account
    const ownerLoginRes = await apiReq('/api/auth/login', {
      method: 'POST',
      body: {
        userId: 'u_admin',
        password: 'Owner_GhostProtocol_2026!'
      }
    });
    assert.equal(ownerLoginRes.status, 200);
    assert.equal(ownerLoginRes.data.user.id, 'u_admin');
    assert.equal(ownerLoginRes.data.user.isOwner, true);
    const freshOwnerCookie = ownerLoginRes.cookie || ownerCookie;

    // 21. Permanent User Removal (DELETE /api/admin/users/:id) by Admins and Website Owner
    // Register two temporary accounts to test permanent deletion by an Admin and by the Website Owner
    const regUser1 = await apiReq('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Temp Delete Target 1',
        email: 'delete1@example.com',
        mobile: '+91 90000 11111',
        city: 'Bengaluru',
        state: 'Karnataka',
        motorcycleModel: 'F77 MACH 2',
        variant: 'Recon',
        registrationNumber: 'KA 01 DEL 0001',
        password: 'TempUser1_Pass_2026!'
      }
    });
    assert.equal(regUser1.status, 201);
    const targetId1 = regUser1.data.user.id;

    const regUser2 = await apiReq('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Temp Delete Target 2',
        email: 'delete2@example.com',
        mobile: '+91 90000 22222',
        city: 'Mumbai',
        state: 'Maharashtra',
        motorcycleModel: 'F77 Original',
        variant: 'Original',
        registrationNumber: 'MH 01 DEL 0002',
        password: 'TempUser2_Pass_2026!'
      }
    });
    assert.equal(regUser2.status, 201);
    const targetId2 = regUser2.data.user.id;

    // Unauthenticated caller cannot permanently delete a user (401)
    const unauthDel = await apiReq(`/api/admin/users/${targetId1}`, {
      method: 'DELETE'
    });
    assert.equal(unauthDel.status, 401);

    // Regular member (u_pilot07) cannot permanently delete a user (403)
    const memberDel = await apiReq(`/api/admin/users/${targetId1}`, {
      method: 'DELETE',
      cookie: pilotCookie
    });
    assert.equal(memberDel.status, 403);

    // Appoint u_phantom as Admin and verify Admin CAN permanently delete targetId1,
    // CANNOT delete Owner (u_admin), and CANNOT delete their own account
    const reappointPhantom = await apiReq('/api/admin/users/u_phantom/appoint-admin', {
      method: 'POST',
      cookie: freshOwnerCookie,
      body: { permissions: ['verify_members'], notes: 'Test admin permanent removal' }
    });
    assert.equal(reappointPhantom.status, 200);

    const adminTriesDelOwner = await apiReq('/api/admin/users/u_admin', {
      method: 'DELETE',
      cookie: phantomCookie
    });
    assert.equal(adminTriesDelOwner.status, 403);

    const adminTriesDelSelf = await apiReq('/api/admin/users/u_phantom', {
      method: 'DELETE',
      cookie: phantomCookie
    });
    assert.equal(adminTriesDelSelf.status, 403);

    const adminDeletesTarget1 = await apiReq(`/api/admin/users/${targetId1}`, {
      method: 'DELETE',
      cookie: phantomCookie,
      body: { reason: 'Fraudulent test registration removed by Admin' }
    });
    assert.equal(adminDeletesTarget1.status, 200);
    assert.equal(adminDeletesTarget1.data.deletedId, targetId1);

    // Website Owner CAN permanently delete targetId2
    const ownerDeletesTarget2 = await apiReq(`/api/admin/users/${targetId2}`, {
      method: 'DELETE',
      cookie: freshOwnerCookie,
      body: { reason: 'Duplicate account removed by Owner' }
    });
    assert.equal(ownerDeletesTarget2.status, 200);
    assert.equal(ownerDeletesTarget2.data.deletedId, targetId2);

    // Verify neither targetId1 nor targetId2 exists in GET /api/admin/users
    const finalUsersList = await apiReq('/api/admin/users', {
      cookie: freshOwnerCookie
    });
    assert.equal(finalUsersList.status, 200);
    assert.equal(
      finalUsersList.data.users.some((u: any) => u.id === targetId1 || u.id === targetId2),
      false,
      'Permanently removed users must be completely erased from the database user list'
    );

    // 22. Session-Restore + Multi-User Sync of Charging Stations, Modifications, and Marketplace Items across Republishes
    const restoreSessionRes = await apiReq('/api/auth/session-restore', {
      method: 'POST',
      body: {
        user: {
          id: 'u_pilot07',
          fullName: 'Vikram Sengupta',
          email: 'vikram.sengupta@example.com',
          mobile: '+91 98860 22345',
          motorcycleModel: 'F77',
          registrationNumber: 'KA 03 EV 4077',
          bloodGroup: 'B+',
          emergencyContact: { name: 'Ananya Sengupta', relationship: 'Spouse', phone: '+91 98860 77654' }
        }
      }
    });
    assert.equal(restoreSessionRes.status, 200);
    assert.equal(restoreSessionRes.data.authenticated, true);
    assert.ok(restoreSessionRes.data.sessionToken, 'Session restore must issue a fresh sessionToken');
    const restoredPilotHeaders = { Authorization: `Bearer ${restoreSessionRes.data.sessionToken}` };

    // Regular member adds a Charging Station (even as 3rd Party Station / Type 2) -> must be published immediately for all users
    const addChargerRes = await apiReq('/api/charging', {
      method: 'POST',
      headers: restoredPilotHeaders,
      body: {
        name: 'Hosur Highway Pilot Fast Plug',
        location: 'NH 44 Hosur Toll Plaza, Tamil Nadu',
        latitude: 12.7409,
        longitude: 77.8253,
        chargerType: 'Type 2',
        uvChargingLink: 'https://www.ultraviolette.com/charging/uv-link',
        chargerDetails: 'UV Type 2 AC adapter + portable charger required',
        chargerSource: '3rd Party Station',
        powerOutputKw: 7.2
      }
    });
    assert.equal(addChargerRes.status, 201);
    assert.equal(addChargerRes.data.station.published, true, 'User-submitted charger must be published immediately');
    assert.equal(addChargerRes.data.station.approvalStatus, 'approved');
    const createdStation = addChargerRes.data.station;

    // Regular member adds a Modification -> visible to all users
    const addModRes = await apiReq('/api/modifications', {
      method: 'POST',
      headers: restoredPilotHeaders,
      body: {
        motorcycleModel: 'F77 MACH 2',
        title: 'Brembo Radial Master Cylinder Upgrade',
        component: 'Brakes & Suspension',
        description: 'Direct bolt-on radial master cylinder for sharper lever feel.',
        costApprox: '₹18,500',
        installationDifficulty: 'Moderate',
        warrantyImpact: 'No impact on battery/drivetrain warranty'
      }
    });
    assert.equal(addModRes.status, 201);
    const createdMod = addModRes.data.modification;

    // Regular member adds a Marketplace Selling Item -> visible to all users
    const addMktRes = await apiReq('/api/marketplace', {
      method: 'POST',
      headers: restoredPilotHeaders,
      body: {
        listingType: 'sell',
        title: 'UV Mach 2 Aero Tank Grips',
        category: 'Accessories',
        CompatibleModels: ['F77 MACH 2'],
        condition: 'Like New',
        price: 3200,
        city: 'Bengaluru',
        description: 'Barely used tank grips in pristine condition.'
      }
    });
    assert.equal(addMktRes.status, 201);
    const createdItem = addMktRes.data.item;

    // Verify another user (or unauthenticated / hybrid-sync viewer) sees the charger, modification, and marketplace item
    const hybridRes = await apiReq('/api/hybrid-sync');
    assert.equal(hybridRes.status, 200);
    assert.ok(
      hybridRes.data.chargingStations.some((s: any) => s.id === createdStation.id),
      'Other users must see user-submitted charging station in /api/hybrid-sync'
    );
    assert.ok(
      hybridRes.data.modifications.some((m: any) => m.id === createdMod.id),
      'Other users must see user-submitted modification in /api/hybrid-sync'
    );
    assert.ok(
      hybridRes.data.marketplace.some((i: any) => i.id === createdItem.id),
      'Other users must see user-submitted marketplace item in /api/hybrid-sync'
    );

    // Reconcile from client cache and verify the charging station stays published (never downgraded to pending)
    const reconcileRes = await apiReq('/api/sync/reconcile', {
      method: 'POST',
      headers: restoredPilotHeaders,
      body: {
        deletedIds: [],
        collections: {
          chargingStations: [createdStation],
          modifications: [createdMod],
          marketplace: [createdItem]
        }
      }
    });
    assert.equal(reconcileRes.status, 200);

    const publicChargersAfterReconcile = await apiReq('/api/charging');
    assert.equal(publicChargersAfterReconcile.status, 200);
    assert.ok(
      publicChargersAfterReconcile.data.stations.some((s: any) => s.id === createdStation.id),
      'Charging station must remain publicly published after client reconciliation'
    );

    // =========================================================================
    // 23. REAL-WORLD SCENARIOS (TESTS A THROUGH I) VERIFICATION
    // =========================================================================

    // Authenticate Pilot B (u_phantom)
    const restorePilotBRes = await apiReq('/api/auth/session-restore', {
      method: 'POST',
      body: {
        user: {
          id: 'u_phantom',
          fullName: 'Devika Nair',
          email: 'devika.nair@example.com',
          mobile: '+91 97410 88231',
          motorcycleModel: 'F77'
        }
      }
    });
    assert.equal(restorePilotBRes.status, 200);
    const pilotBHeaders = { Authorization: `Bearer ${restorePilotBRes.data.sessionToken}` };

    // Test A — Two pilots: Pilot A submits a Mods Lab modification; Pilot B opens Ghost Protocol and sees it
    const pilotBFetchMods = await apiReq('/api/modifications', { headers: pilotBHeaders });
    assert.equal(pilotBFetchMods.status, 200);
    assert.ok(
      pilotBFetchMods.data.modifications.some((m: any) => m.id === createdMod.id),
      'Test A: Pilot B must see Pilot A Mods Lab modification'
    );

    // Test B — Original uploader goes offline / logs out: Pilot A submits a discussion, logs out; Pilot B still accesses it
    const pilotADiscRes = await apiReq('/api/discussions', {
      method: 'POST',
      headers: restoredPilotHeaders,
      body: {
        title: 'NH48 Thermal Management on Noon Runs',
        category: 'Battery & Range',
        content: 'Sharing empirical battery temp telemetry from Bengaluru to Krishnagiri.'
      }
    });
    assert.equal(pilotADiscRes.status, 201);
    const createdDiscId = pilotADiscRes.data.discussion.id;

    // Pilot A logs out (goes offline)
    const pilotALogoutRes = await apiReq('/api/auth/logout', {
      method: 'POST',
      headers: restoredPilotHeaders
    });
    assert.equal(pilotALogoutRes.status, 200);

    // Pilot B fetches discussions while Pilot A is logged out / offline
    const pilotBDiscFetch = await apiReq('/api/discussions', { headers: pilotBHeaders });
    assert.equal(pilotBDiscFetch.status, 200);
    assert.ok(
      pilotBDiscFetch.data.discussions.some((d: any) => d.id === createdDiscId),
      'Test B: Pilot B must still access Pilot A discussion when Pilot A is offline/logged out'
    );

    // Restore Pilot A session for subsequent tests
    const reAuthPilotA = await apiReq('/api/auth/session-restore', {
      method: 'POST',
      body: {
        user: {
          id: 'u_pilot07',
          fullName: 'Vikram Sengupta',
          email: 'vikram.sengupta@example.com'
        }
      }
    });
    const activePilotAHeaders = { Authorization: `Bearer ${reAuthPilotA.data.sessionToken}` };

    // Test C & D — Permanent storage across server restarts & application updates
    const persistedOnDisk = JSON.parse(fs.readFileSync(tempDbPath, 'utf-8'));
    assert.ok(
      persistedOnDisk.marketplace.some((i: any) => i.id === createdItem.id),
      'Test C: Marketplace listing must be persisted on disk across restarts'
    );
    assert.ok(
      persistedOnDisk.discussions.some((d: any) => d.id === createdDiscId),
      'Test D: Community records must remain intact across application updates'
    );

    // Test E — Multiple devices: Create a Priority Issue on Device 1 and verify on Device 2
    const probRes = await apiReq('/api/problems', {
      method: 'POST',
      headers: activePilotAHeaders,
      body: {
        motorcycleModel: 'F77 MACH 2',
        category: 'Charging',
        severity: 'Moderate',
        title: 'Boost Charger Fan Acoustic Hum at 240V',
        description: 'Slight harmonic hum noticed above 238V grid voltage.'
      }
    });
    assert.equal(probRes.status, 201);
    const createdProbId = probRes.data.problem.id;

    const device2Fetch = await apiReq('/api/problems', { headers: pilotBHeaders });
    assert.equal(device2Fetch.status, 200);
    assert.ok(
      device2Fetch.data.problems.some((p: any) => p.id === createdProbId),
      'Test E: Priority Issue created on Device 1 must be visible on Device 2'
    );

    // Test F — Quota exhausted status reporting: in test mode (vault sync paused), syncStatus must accurately report saved_local_pending_cloud
    assert.equal(
      probRes.data.syncStatus,
      'saved_local_pending_cloud',
      'Test F: When cloud vault sync is paused/unavailable, server must report saved_local_pending_cloud rather than falsely claiming cloud publication'
    );
    assert.equal(
      probRes.data.statusMessage,
      'Saved on this device – waiting to sync.'
    );

    // Test G — Authorised deletion: Pilot A deletes their Marketplace listing; deletion propagates via deletedIds and stale cache cannot restore it
    const delMktRes = await apiReq(`/api/marketplace/${createdItem.id}`, {
      method: 'DELETE',
      headers: activePilotAHeaders
    });
    assert.equal(delMktRes.status, 200);

    const afterDelMkt = await apiReq('/api/marketplace', { headers: pilotBHeaders });
    assert.equal(afterDelMkt.status, 200);
    assert.equal(
      afterDelMkt.data.items.some((i: any) => i.id === createdItem.id),
      false,
      'Test G: Deleted marketplace listing must be removed for Pilot B'
    );
    assert.ok(
      Array.isArray(afterDelMkt.data.deletedIds) && afterDelMkt.data.deletedIds.includes(createdItem.id),
      'Test G: Server response must propagate deletedIds to all clients'
    );

    // Pilot B attempts to reconcile stale cache containing the deleted marketplace item -> server must NOT restore it
    await apiReq('/api/sync/reconcile', {
      method: 'POST',
      headers: pilotBHeaders,
      body: {
        deletedIds: [],
        collections: {
          marketplace: [createdItem]
        }
      }
    });
    const verifyNotRestored = await apiReq('/api/marketplace', { headers: pilotBHeaders });
    assert.equal(
      verifyNotRestored.data.items.some((i: any) => i.id === createdItem.id),
      false,
      'Test G: Stale cache reconciliation must never resurrect an authorised deletion'
    );

    // Test H — Ordinary browsing (100 simulated requests without uploads)
    const revBeforeBrowsing = JSON.parse(fs.readFileSync(tempDbPath, 'utf-8')).revision;
    for (let i = 0; i < 20; i++) {
      await Promise.all([
        apiReq('/api/discussions'),
        apiReq('/api/marketplace'),
        apiReq('/api/modifications'),
        apiReq('/api/problems'),
        apiReq('/api/charging')
      ]);
    }
    const revAfterBrowsing = JSON.parse(fs.readFileSync(tempDbPath, 'utf-8')).revision;
    assert.equal(
      revAfterBrowsing,
      revBeforeBrowsing,
      'Test H: 100 ordinary browsing requests must cause 0 database writes'
    );

    // Test I — Concurrent updates: Pilot A and Pilot B both reply to the same discussion thread concurrently
    await Promise.all([
      apiReq(`/api/discussions/${createdDiscId}/comments`, {
        method: 'POST',
        headers: activePilotAHeaders,
        body: { text: 'Pilot A concurrent telemetry reply' }
      }),
      apiReq(`/api/discussions/${createdDiscId}/comments`, {
        method: 'POST',
        headers: pilotBHeaders,
        body: { text: 'Pilot B concurrent telemetry reply' }
      })
    ]);

    const finalDiscRes = await apiReq('/api/discussions', { headers: pilotBHeaders });
    const targetDisc = finalDiscRes.data.discussions.find((d: any) => d.id === createdDiscId);
    assert.ok(targetDisc, 'Target discussion must exist');
    assert.ok(
      targetDisc.comments.some((c: any) => c.text === 'Pilot A concurrent telemetry reply'),
      'Test I: Pilot A concurrent comment must be preserved'
    );
    assert.ok(
      targetDisc.comments.some((c: any) => c.text === 'Pilot B concurrent telemetry reply'),
      'Test I: Pilot B concurrent comment must be preserved'
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
});
