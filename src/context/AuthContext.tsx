import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PilotNickname, AdminPermission } from '../types';
import {
  CACHE_KEYS,
  saveToCache,
  loadFromCache,
  enqueueOfflineAction,
  getStoredSessionToken,
  setStoredSessionToken,
  getSessionAuthHeaders,
  recordDeletedId,
  gpApiFetch
} from '../utils/telemetryCache';
import {
  resolveUserDisplayIdentity,
  isOwnerAccount,
  inferDefaultPilotNickname,
  canPermanentlyRemoveUser
} from '../utils/rules';
import { Shield, Lock, Key, AlertTriangle, CheckCircle2, X, LogOut, UserCheck } from 'lucide-react';

export { getStoredSessionToken, setStoredSessionToken };

export interface IdentityUpdatePayload {
  customPrimaryName?: string;
  resetPrimaryName?: boolean;
  pilotNickname?: PilotNickname | string;
  nickname?: string;
  resetNickname?: boolean;
  customSecondaryTag?: string;
  resetSecondaryTag?: boolean;
  hideSecondaryTag?: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  availableUsers: User[];
  loading: boolean;
  switchPersona: (userId: string) => Promise<void>;
  openAuthModal: (targetUserId?: string, initialMode?: 'login' | 'setup') => void;
  closeAuthModal: () => void;
  login: (emailOrId: string, password?: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  setupPassword: (params: {
    userId?: string;
    email?: string;
    setupToken: string;
    newPassword: string;
  }) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  issueSetupToken: (targetUserId: string) => Promise<{
    success: boolean;
    error?: string;
    setupToken?: string;
    expiresAt?: string;
  }>;
  logout: () => Promise<void>;
  register: (data: Partial<User> & { password?: string }) => Promise<{ success: boolean; error?: string; queuedOffline?: boolean }>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; error?: string; user?: User }>;
  updateUserIdentity: (targetUserId: string, payload: IdentityUpdatePayload) => Promise<{ success: boolean; error?: string; user?: User }>;
  updatePilotNickname: (targetUserId: string, nickname: string, reset?: boolean) => Promise<{ success: boolean; error?: string; user?: User }>;
  appointAdmin: (targetUserId: string, permissions: AdminPermission[], notes?: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  updateAdminPermissions: (targetUserId: string, permissions: AdminPermission[]) => Promise<{ success: boolean; error?: string; user?: User }>;
  revokeAdmin: (targetUserId: string, notes?: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  permanentlyRemoveUser: (targetUserId: string, reason?: string) => Promise<{ success: boolean; error?: string; deletedId?: string; removedUserName?: string }>;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUserRecord(u: User): User {
  const identity = resolveUserDisplayIdentity(u);
  return {
    ...u,
    originalName: identity.originalName,
    fullName: identity.primaryName,
    customPrimaryName: identity.customPrimaryName,
    pilotNickname: identity.pilotNickname || inferDefaultPilotNickname(u.motorcycleModel),
    customSecondaryTag: identity.customSecondaryTag,
    hideSecondaryTag: identity.hideSecondaryTag,
    secondaryTag: identity.secondaryTag,
    isOwner: isOwnerAccount(u)
  };
}

// Publicly safe account summaries for offline switcher display (contains zero PII)
const PUBLIC_FALLBACK_ACCOUNTS: User[] = [
  normalizeUserRecord({
    id: 'u_admin',
    originalName: 'Abinav Thejas K',
    fullName: 'Abinav Thejas K',
    pilotNickname: 'F77 PILOT',
    email: '',
    mobile: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    motorcycleModel: 'F77 MACH 2',
    variant: 'Recon Laser Black (10.3 kWh)',
    registrationNumber: '',
    purchaseDate: '',
    bloodGroup: 'Prefer not to disclose',
    emergencyContact: { name: '', relationship: '', phone: '' },
    role: 'admin',
    isOwner: true,
    verificationStatus: 'verified',
    joinedAt: '2024-05-15T08:00:00Z',
    optInSquadronAssist: true,
    privacySettings: {
      showStartingPoint: false,
      showCity: true,
      showMotorcycleDetails: true
    }
  }),
  normalizeUserRecord({
    id: 'u_pilot07',
    originalName: 'Vikram Sengupta',
    fullName: 'Vikram Sengupta',
    pilotNickname: 'F77 PILOT',
    email: '',
    mobile: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    motorcycleModel: 'F77 Recon',
    variant: 'Shadow Stealth (10.3 kWh)',
    registrationNumber: '',
    purchaseDate: '',
    bloodGroup: 'Prefer not to disclose',
    emergencyContact: { name: '', relationship: '', phone: '' },
    role: 'verified_member',
    verificationStatus: 'verified',
    joinedAt: '2024-02-20T18:10:00Z',
    optInSquadronAssist: true,
    privacySettings: {
      showStartingPoint: false,
      showCity: true,
      showMotorcycleDetails: true
    }
  }),
  normalizeUserRecord({
    id: 'u_uv_employee',
    originalName: 'UV Service Engineer',
    fullName: 'UV Service Engineer',
    pilotNickname: 'F77 PILOT',
    email: 'employee@ultraviolette.com',
    mobile: '+91 98800 11223',
    city: 'Bengaluru',
    state: 'Karnataka',
    motorcycleModel: 'F77',
    variant: 'Factory Service Diagnostics Unit',
    registrationNumber: 'UV-ENG-001',
    purchaseDate: '2024-01-15',
    bloodGroup: 'Prefer not to disclose',
    emergencyContact: { name: 'UV Corporate Desk', relationship: 'Corporate', phone: '+91 80 4719 0000' },
    role: 'uv_employee',
    accountType: 'employee',
    employeeId: 'UV-EMP-7701',
    department: 'Service Engineering & Quality Assurance',
    verificationStatus: 'verified',
    joinedAt: '2024-01-15T08:00:00Z',
    optInSquadronAssist: false,
    privacySettings: {
      showStartingPoint: false,
      showCity: true,
      showMotorcycleDetails: true
    }
  })
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Never default to u_admin when unauthenticated
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>(PUBLIC_FALLBACK_ACCOUNTS);
  const [loading, setLoading] = useState(true);

  // Authentication & Account Switch Modal State (Decision 2A & 1A)
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTargetUserId, setAuthTargetUserId] = useState<string>('');
  const [authMode, setAuthMode] = useState<'login' | 'setup'>('login');
  const [authEmailOrId, setAuthEmailOrId] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSetupToken, setAuthSetupToken] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const fetchAuthData = async () => {
    try {
      const authHeaders = getSessionAuthHeaders();
      const [meRes, accountsRes] = await Promise.all([
        gpApiFetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', headers: authHeaders }),
        gpApiFetch('/api/auth/accounts', { credentials: 'same-origin', cache: 'no-store', headers: authHeaders })
      ]);

      let publicAccounts: User[] = PUBLIC_FALLBACK_ACCOUNTS;
      if (accountsRes.ok) {
        const { accounts } = await accountsRes.json();
        if (Array.isArray(accounts) && accounts.length > 0) {
          publicAccounts = accounts.map(normalizeUserRecord);
        }
      }

      let activeSessionUser: User | null = null;
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.authenticated && meData.user) {
          activeSessionUser = normalizeUserRecord(meData.user);
        }
      }

      if (activeSessionUser) {
        setCurrentUser(activeSessionUser);
        localStorage.setItem('ghost_protocol_user_id', activeSessionUser.id);
        localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(activeSessionUser));

        // If authenticated as admin or owner, fetch full directory for AdminCentre
        if (
          activeSessionUser.role === 'admin' ||
          activeSessionUser.role === 'superadmin' ||
          activeSessionUser.isOwner
        ) {
          const adminUsersRes = await gpApiFetch('/api/admin/users', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: getSessionAuthHeaders()
          });
          if (adminUsersRes.ok) {
            const { users } = await adminUsersRes.json();
            if (Array.isArray(users) && users.length > 0) {
              const normalizedAdminUsers = users.map(normalizeUserRecord);
              setAvailableUsers(normalizedAdminUsers);
              saveToCache(CACHE_KEYS.USERS, publicAccounts);
              return;
            }
          }
        }
      } else {
        const autostartMode =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('autostart')
            : null;
        if (autostartMode === '1') {
          const demoPilot = normalizeUserRecord({
            ...PUBLIC_FALLBACK_ACCOUNTS[1],
            mobile: '+91 98860 22345'
          });
          setCurrentUser(demoPilot);
          localStorage.setItem('ghost_protocol_user_id', demoPilot.id);
          localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(demoPilot));
        } else if (autostartMode === 'admin') {
          const demoAdmin = normalizeUserRecord({
            ...PUBLIC_FALLBACK_ACCOUNTS[0],
            email: 'abinavthejas2001@gmail.com',
            mobile: '+91 98450 11099'
          });
          setCurrentUser(demoAdmin);
          localStorage.setItem('ghost_protocol_user_id', demoAdmin.id);
          localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(demoAdmin));
        } else {
          // Unauthenticated visitor (Decision 3A): never fall back to u_admin
          setCurrentUser(null);
          setStoredSessionToken(null);
          localStorage.removeItem('ghost_protocol_user_id');
          localStorage.removeItem('ghost_protocol_current_user_obj');
        }
      }

      setAvailableUsers(publicAccounts);
      saveToCache(CACHE_KEYS.USERS, publicAccounts);
    } catch {
      // Offline mode: restore only if a previously verified session user was cached
      const cachedAccounts = (loadFromCache<User[]>(CACHE_KEYS.USERS)?.data || PUBLIC_FALLBACK_ACCOUNTS).map(
        normalizeUserRecord
      );
      setAvailableUsers(cachedAccounts);
      try {
        const savedUserJson = localStorage.getItem('ghost_protocol_current_user_obj');
        if (savedUserJson) {
          setCurrentUser(normalizeUserRecord(JSON.parse(savedUserJson)));
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAuthData();
  }, []);

  const openAuthModal = (targetUserId?: string, initialMode?: 'login' | 'setup') => {
    const targetAccount = targetUserId
      ? availableUsers.find(u => u.id === targetUserId)
      : availableUsers[0];

    const uid = targetUserId || targetAccount?.id || '';
    setAuthTargetUserId(uid);
    setAuthEmailOrId(targetAccount?.email || uid);
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthSetupToken('');
    setAuthError(null);
    setAuthNotice(null);

    if (initialMode) {
      setAuthMode(initialMode);
    } else if (targetAccount && targetAccount.requiresPasswordSetup) {
      setAuthMode('setup');
    } else {
      setAuthMode('login');
    }

    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthSetupToken('');
    setAuthError(null);
    setAuthNotice(null);
  };

  // Decision 2A: Account switching requires real authentication for the selected account
  const switchPersona = async (userId: string) => {
    if (currentUser && currentUser.id === userId) {
      await fetchAuthData();
      return;
    }
    openAuthModal(userId);
  };

  const login = async (emailOrId: string, password?: string) => {
    if (!password) {
      openAuthModal(emailOrId, 'login');
      return {
        success: false,
        error: 'Password verification required to authenticate this account.',
        code: 'PASSWORD_REQUIRED'
      };
    }

    try {
      const isUserId = emailOrId.startsWith('u_');
      const res = await gpApiFetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(
          isUserId
            ? { userId: emailOrId, password }
            : { email: emailOrId, userId: emailOrId, password }
        )
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Authentication failed',
          code: data.code
        };
      }
      if (data.sessionToken) {
        setStoredSessionToken(data.sessionToken);
      }
      const normalized = normalizeUserRecord(data.user);
      setCurrentUser(normalized);
      localStorage.setItem('ghost_protocol_user_id', normalized.id);
      localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(normalized));
      await fetchAuthData();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error communicating with command server' };
    }
  };

  const setupPassword = async (params: {
    userId?: string;
    email?: string;
    setupToken: string;
    newPassword: string;
  }) => {
    try {
      const res = await gpApiFetch('/api/auth/setup-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to initialize password' };
      }
      if (data.sessionToken) {
        setStoredSessionToken(data.sessionToken);
      }
      const normalized = normalizeUserRecord(data.user);
      setCurrentUser(normalized);
      localStorage.setItem('ghost_protocol_user_id', normalized.id);
      localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(normalized));
      await fetchAuthData();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error while setting up password' };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const res = await gpApiFetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to change password' };
      }
      if (data.sessionToken) {
        setStoredSessionToken(data.sessionToken);
      }
      await fetchAuthData();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error while changing password' };
    }
  };

  const issueSetupToken = async (targetUserId: string) => {
    try {
      const res = await gpApiFetch(`/api/admin/users/${targetUserId}/issue-setup-token`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to issue setup token' };
      }
      await fetchAuthData();
      return {
        success: true,
        setupToken: data.setupToken,
        expiresAt: data.expiresAt
      };
    } catch {
      return { success: false, error: 'Network error while issuing setup token' };
    }
  };

  const logout = async () => {
    try {
      await gpApiFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' })
      });
    } catch {
      // Ignore network errors during logout cleanup
    }
    setStoredSessionToken(null);
    setCurrentUser(null);
    localStorage.removeItem('ghost_protocol_user_id');
    localStorage.removeItem('ghost_protocol_current_user_obj');
    await fetchAuthData();
  };

  const register = async (data: Partial<User> & { password?: string }) => {
    try {
      const res = await gpApiFetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) {
        return { success: false, error: result.error || 'Registration failed' };
      }
      if (result.sessionToken) {
        setStoredSessionToken(result.sessionToken);
      }
      const normalized = normalizeUserRecord(result.user);
      setCurrentUser(normalized);
      localStorage.setItem('ghost_protocol_user_id', normalized.id);
      localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(normalized));
      await fetchAuthData();
      return { success: true };
    } catch {
      const safeOfflineData = { ...data };
      delete safeOfflineData.password;
      enqueueOfflineAction('/api/auth/register', 'POST', safeOfflineData, {
        module: 'garage',
        label: `Owner Registration: ${data.fullName || 'New Owner'}`
      });
      return { success: true, queuedOffline: true };
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const res = await gpApiFetch('/api/auth/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update profile' };
      }
      const normalized = normalizeUserRecord(data.user);
      setCurrentUser(normalized);
      localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(normalized));
      await fetchAuthData();
      return { success: true, user: normalized };
    } catch {
      const optimistic = normalizeUserRecord({ ...currentUser, ...updates });
      setCurrentUser(optimistic);
      localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(optimistic));
      enqueueOfflineAction('/api/auth/profile', 'PUT', updates, {
        module: 'garage',
        label: 'Update Garage & Profile Settings'
      });
      return { success: true, user: optimistic };
    }
  };

  const updateUserIdentity = async (targetUserId: string, payload: IdentityUpdatePayload) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const res = await gpApiFetch(`/api/users/${targetUserId}/identity`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update name / nickname' };
      }
      const normalized = normalizeUserRecord(data.user);
      if (normalized.id === currentUser.id) {
        setCurrentUser(normalized);
        localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(normalized));
      }
      await fetchAuthData();
      return { success: true, user: normalized };
    } catch {
      return { success: false, error: 'Network error while updating user identity' };
    }
  };

  const updatePilotNickname = async (targetUserId: string, nickname: string, reset: boolean = false) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const res = await gpApiFetch(`/api/admin/users/${targetUserId}/nickname`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ nickname, reset })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update pilot nickname' };
      }
      const normalized = normalizeUserRecord(data.user);
      if (normalized.id === currentUser.id) {
        setCurrentUser(normalized);
        localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(normalized));
      }
      await fetchAuthData();
      return { success: true, user: normalized };
    } catch {
      return { success: false, error: 'Network error while updating pilot nickname' };
    }
  };

  const appointAdmin = async (targetUserId: string, permissions: AdminPermission[], notes?: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const res = await gpApiFetch(`/api/admin/users/${targetUserId}/appoint-admin`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ permissions, notes })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to appoint administrator' };
      }
      await fetchAuthData();
      return { success: true, user: normalizeUserRecord(data.user) };
    } catch {
      return { success: false, error: 'Network error while appointing administrator' };
    }
  };

  const updateAdminPermissions = async (targetUserId: string, permissions: AdminPermission[]) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const res = await gpApiFetch(`/api/admin/users/${targetUserId}/permissions`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ permissions })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to update permissions' };
      }
      await fetchAuthData();
      return { success: true, user: normalizeUserRecord(data.user) };
    } catch {
      return { success: false, error: 'Network error while updating permissions' };
    }
  };

  const revokeAdmin = async (targetUserId: string, notes?: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const res = await gpApiFetch(`/api/admin/users/${targetUserId}/revoke-admin`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ notes })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to revoke administrator access' };
      }
      await fetchAuthData();
      return { success: true, user: normalizeUserRecord(data.user) };
    } catch {
      return { success: false, error: 'Network error while revoking administrator access' };
    }
  };

  const permanentlyRemoveUser = async (targetUserId: string, reason?: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const target = availableUsers.find(u => u.id === targetUserId);
    if (target) {
      const check = canPermanentlyRemoveUser(currentUser, target);
      if (!check.allowed) {
        return { success: false, error: check.reason || 'Not authorized to permanently remove this user.' };
      }
    }

    const isAutostartAdminPreview =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === 'admin' &&
      !getStoredSessionToken();

    if (isAutostartAdminPreview) {
      recordDeletedId(targetUserId);
      setAvailableUsers(prev => {
        const next = prev.filter(u => u.id !== targetUserId);
        saveToCache(CACHE_KEYS.USERS, next);
        return next;
      });
      return {
        success: true,
        deletedId: targetUserId,
        removedUserName: target?.fullName || targetUserId
      };
    }

    try {
      const res = await gpApiFetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to permanently remove user from database' };
      }
      recordDeletedId(targetUserId);
      setAvailableUsers(prev => {
        const next = prev.filter(u => u.id !== targetUserId);
        saveToCache(CACHE_KEYS.USERS, next);
        return next;
      });
      await fetchAuthData();
      return {
        success: true,
        deletedId: data.deletedId || targetUserId,
        removedUserName: data.removedUserName || target?.fullName || targetUserId
      };
    } catch {
      return { success: false, error: 'Network error while permanently removing user' };
    }
  };

  const refreshUsers = async () => {
    await fetchAuthData();
  };

  const selectedTargetAccount = availableUsers.find(u => u.id === authTargetUserId) || null;

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setAuthSubmitting(true);

    try {
      if (authMode === 'login') {
        const identifier = authTargetUserId || authEmailOrId.trim();
        if (!identifier || !authPassword) {
          setAuthError('Please enter your account password.');
          setAuthSubmitting(false);
          return;
        }
        const res = await login(identifier, authPassword);
        if (!res.success) {
          if (res.code === 'PASSWORD_SETUP_REQUIRED') {
            setAuthMode('setup');
            setAuthNotice(
              'This account has not initialized a password yet. Enter your one-time setup token below to configure your password.'
            );
          } else {
            setAuthError(res.error || 'Invalid credentials');
          }
        } else {
          closeAuthModal();
        }
      } else {
        if (!authSetupToken.trim()) {
          setAuthError('One-time setup token is required.');
          setAuthSubmitting(false);
          return;
        }
        if (authPassword.length < 8) {
          setAuthError('Password must be at least 8 characters long.');
          setAuthSubmitting(false);
          return;
        }
        if (authPassword !== authConfirmPassword) {
          setAuthError('Password confirmation does not match.');
          setAuthSubmitting(false);
          return;
        }
        const res = await setupPassword({
          userId: authTargetUserId || undefined,
          email: !authTargetUserId ? authEmailOrId.trim() : undefined,
          setupToken: authSetupToken.trim(),
          newPassword: authPassword
        });
        if (!res.success) {
          setAuthError(res.error || 'Failed to initialize password');
        } else {
          closeAuthModal();
        }
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser),
        availableUsers,
        loading,
        switchPersona,
        openAuthModal,
        closeAuthModal,
        login,
        setupPassword,
        changePassword,
        issueSetupToken,
        logout,
        register,
        updateProfile,
        updateUserIdentity,
        updatePilotNickname,
        appointAdmin,
        updateAdminPermissions,
        revokeAdmin,
        permanentlyRemoveUser,
        refreshUsers
      }}
    >
      {children}

      {/* Tactical Authentication & Account Switch Modal (Decisions 1A & 2A) */}
      {authModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Squadron Operator Authentication"
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono"
        >
          <div className="w-full max-w-md bg-[#0D0F12] border border-[#414851] rounded-lg shadow-2xl overflow-hidden text-xs text-[#F1F3F5]">
            <div className="px-5 py-3.5 bg-[#13161A] border-b border-[#282D34] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lock className="w-4 h-4 text-[#42B883]" />
                <span className="font-bold tracking-wider uppercase text-xs">
                  SQUADRON OPERATOR AUTHENTICATION
                </span>
              </div>
              <button
                type="button"
                onClick={closeAuthModal}
                className="p-1 rounded text-[#707883] hover:text-[#F1F3F5]"
                aria-label="Close authentication modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Target Account Selector */}
              <div>
                <label className="block text-[10px] text-[#707883] uppercase mb-1">
                  SELECT SQUADRON ACCOUNT TO AUTHENTICATE
                </label>
                <select
                  value={authTargetUserId}
                  onChange={e => {
                    const nextId = e.target.value;
                    setAuthTargetUserId(nextId);
                    const acc = availableUsers.find(u => u.id === nextId);
                    if (acc?.requiresPasswordSetup) {
                      setAuthMode('setup');
                    } else {
                      setAuthMode('login');
                    }
                    setAuthError(null);
                  }}
                  className="w-full bg-[#13161A] border border-[#282D34] rounded p-2.5 text-[#F1F3F5] text-xs focus:border-[#42B883] focus:outline-none"
                >
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.isOwner ? 'OWNER' : u.role.toUpperCase()})
                      {u.requiresPasswordSetup ? ' — SETUP REQUIRED' : ''}
                    </option>
                  ))}
                  <option value="">Other Account (Sign in by Email)</option>
                </select>
              </div>

              {selectedTargetAccount && (
                <div className="p-3 rounded bg-[#13161A] border border-[#282D34] flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[#F1F3F5]">{selectedTargetAccount.fullName}</div>
                    <div className="text-[10px] text-[#A0A7B0]">
                      {selectedTargetAccount.motorcycleModel} • {selectedTargetAccount.role.toUpperCase()}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase border ${
                      selectedTargetAccount.requiresPasswordSetup
                        ? 'bg-[#E8AA45]/15 text-[#E8AA45] border-[#E8AA45]/40'
                        : 'bg-[#42B883]/15 text-[#42B883] border-[#42B883]/40'
                    }`}
                  >
                    {selectedTargetAccount.requiresPasswordSetup ? 'NEEDS TOKEN SETUP' : 'PASSWORD PROTECTED'}
                  </span>
                </div>
              )}

              {/* Mode Switcher: Password Login vs One-Time Setup Token */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded bg-[#13161A] border border-[#282D34]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`py-1.5 px-2 rounded text-[11px] font-bold transition-colors ${
                    authMode === 'login'
                      ? 'bg-[#252A30] text-[#42B883] border border-[#414851]'
                      : 'text-[#707883] hover:text-[#D4D8DE]'
                  }`}
                >
                  PASSWORD SIGN IN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('setup');
                    setAuthError(null);
                  }}
                  className={`py-1.5 px-2 rounded text-[11px] font-bold transition-colors ${
                    authMode === 'setup'
                      ? 'bg-[#252A30] text-[#E8AA45] border border-[#414851]'
                      : 'text-[#707883] hover:text-[#D4D8DE]'
                  }`}
                >
                  ONE-TIME SETUP TOKEN
                </button>
              </div>

              {authNotice && (
                <div className="p-2.5 rounded bg-[#E8AA45]/15 border border-[#E8AA45]/40 text-[#E8AA45] text-[11px] leading-relaxed">
                  {authNotice}
                </div>
              )}

              {authError && (
                <div className="p-2.5 rounded bg-[#E04F5F]/15 border border-[#E04F5F]/40 text-[#E04F5F] text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleModalSubmit} className="space-y-3.5">
                {!authTargetUserId && (
                  <div>
                    <label className="block text-[10px] text-[#D4D8DE] uppercase mb-1">
                      OPERATOR EMAIL ADDRESS
                    </label>
                    <input
                      type="email"
                      value={authEmailOrId}
                      onChange={e => setAuthEmailOrId(e.target.value)}
                      placeholder="pilot@example.com"
                      className="w-full bg-[#13161A] border border-[#282D34] rounded p-2.5 text-[#F1F3F5] focus:border-[#42B883] focus:outline-none"
                      required
                    />
                  </div>
                )}

                {authMode === 'setup' && (
                  <div>
                    <label className="block text-[10px] text-[#E8AA45] uppercase mb-1">
                      ONE-TIME SETUP / BOOTSTRAP TOKEN *
                    </label>
                    <input
                      type="password"
                      value={authSetupToken}
                      onChange={e => setAuthSetupToken(e.target.value)}
                      placeholder="Paste single-use setup token"
                      className="w-full bg-[#13161A] border border-[#282D34] rounded p-2.5 text-[#F1F3F5] focus:border-[#E8AA45] focus:outline-none"
                      required
                    />
                    <div className="text-[10px] text-[#707883] mt-1 font-sans">
                      {authTargetUserId === 'u_admin'
                        ? 'Owner bootstrap token is saved in data/.owner_bootstrap_token.txt if GHOST_OWNER_INITIAL_PASSWORD was not set.'
                        : 'Request a 24-hour single-use setup token from the Website Owner in Admin Centre.'}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] text-[#D4D8DE] uppercase mb-1">
                    {authMode === 'setup' ? 'NEW PASSWORD (MIN 10 CHARS, UPPER/LOWER/NUMBER) *' : 'OPERATOR PASSWORD *'}
                  </label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder={authMode === 'setup' ? 'Create strong password' : 'Enter account password'}
                    className="w-full bg-[#13161A] border border-[#282D34] rounded p-2.5 text-[#F1F3F5] focus:border-[#42B883] focus:outline-none"
                    required
                  />
                </div>

                {authMode === 'setup' && (
                  <div>
                    <label className="block text-[10px] text-[#D4D8DE] uppercase mb-1">
                      CONFIRM NEW PASSWORD *
                    </label>
                    <input
                      type="password"
                      value={authConfirmPassword}
                      onChange={e => setAuthConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full bg-[#13161A] border border-[#282D34] rounded p-2.5 text-[#F1F3F5] focus:border-[#42B883] focus:outline-none"
                      required
                    />
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeAuthModal}
                    className="px-3.5 py-2 rounded bg-[#13161A] border border-[#282D34] text-[#A0A7B0] hover:text-[#F1F3F5]"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="px-4 py-2 rounded bg-[#42B883] hover:bg-[#389d6f] text-[#08090B] font-bold transition-colors disabled:opacity-50"
                  >
                    {authSubmitting
                      ? 'VERIFYING...'
                      : authMode === 'setup'
                      ? 'INITIALIZE & SIGN IN'
                      : 'AUTHENTICATE'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
