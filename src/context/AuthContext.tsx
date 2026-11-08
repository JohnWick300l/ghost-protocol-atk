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
  getDeletedIds,
  gpApiFetch,
  scheduleServerReconciliation,
  processOfflineQueue
} from '../utils/telemetryCache';
import {
  resolveUserDisplayIdentity,
  isOwnerAccount,
  inferDefaultPilotNickname,
  canPermanentlyRemoveUser
} from '../utils/rules';
import { Shield, Lock, Key, AlertTriangle, CheckCircle2, X, LogOut, UserCheck } from 'lucide-react';

import { signInWithGoogleForCloudSync } from '../firebase';

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
  authModalOpen: boolean;
  switchPersona: (userId: string) => Promise<void>;
  openAuthModal: (targetUserId?: string, initialMode?: 'login' | 'setup') => void;
  closeAuthModal: () => void;
  login: (emailOrId: string, password?: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  loginWithGoogleEmail: (email: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  setupPassword: (params: {
    userId?: string;
    email?: string;
    setupToken?: string;
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
    motorcycleModel: 'F77',
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
  })
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize currentUser from local cache so authenticated pilots remain in session without login flash
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const autostartMode = new URLSearchParams(window.location.search).get('autostart');
      if (autostartMode === 'admin') {
        return normalizeUserRecord({
          ...PUBLIC_FALLBACK_ACCOUNTS[0],
          email: 'abinavthejas2001@gmail.com',
          mobile: '+91 98450 11099'
        });
      }
      if (autostartMode === '1') {
        return normalizeUserRecord({
          id: 'u_pilot07',
          originalName: 'Vikram Sengupta',
          fullName: 'Vikram Sengupta',
          pilotNickname: 'F77 PILOT',
          email: 'vikram.sengupta@example.com',
          mobile: '+91 98860 22345',
          city: 'Bengaluru',
          state: 'Karnataka',
          motorcycleModel: 'F77',
          variant: 'Shadow Stealth (10.3 kWh)',
          registrationNumber: 'KA 03 EV 4077',
          purchaseDate: '2024-06-20',
          bloodGroup: 'B+',
          emergencyContact: { name: 'Ananya Sengupta', relationship: 'Spouse', phone: '+91 98860 77654' },
          role: 'verified_member',
          verificationStatus: 'verified',
          joinedAt: '2024-02-20T18:10:00Z',
          optInSquadronAssist: true,
          privacySettings: {
            showStartingPoint: false,
            showCity: true,
            showMotorcycleDetails: true
          }
        });
      }
      const stored = localStorage.getItem('ghost_protocol_current_user_obj');
      if (stored) {
        const parsed = JSON.parse(stored);
        const deletedSet = new Set(getDeletedIds());
        if (parsed && parsed.id && !deletedSet.has(parsed.id)) {
          return normalizeUserRecord(parsed);
        }
      }
    } catch {
      // Ignore parse error
    }
    return null;
  });
  const [availableUsers, setAvailableUsers] = useState<User[]>(() => {
    const deletedSet = new Set(getDeletedIds());
    return PUBLIC_FALLBACK_ACCOUNTS.filter(u => !deletedSet.has(u.id));
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const autostartMode = new URLSearchParams(window.location.search).get('autostart');
      if (autostartMode === 'admin' || autostartMode === '1') {
        return false;
      }
      const stored = localStorage.getItem('ghost_protocol_current_user_obj');
      if (stored) {
        const parsed = JSON.parse(stored);
        const deletedSet = new Set(getDeletedIds());
        if (parsed && parsed.id && !deletedSet.has(parsed.id)) {
          return false;
        }
      }
      const hasSessionToken = Boolean(localStorage.getItem('ghost_protocol_session_token'));
      if (!hasSessionToken) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  });

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

  const restoreSessionFromServer = async (
    cachedPilot: User
  ): Promise<{ user: User | null; deleted: boolean }> => {
    try {
      const restoreRes = await gpApiFetch('/api/auth/session-restore', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ user: cachedPilot })
      });
      const restoreData = await restoreRes.json().catch(() => ({}));
      if (Array.isArray(restoreData.deletedIds) && restoreData.deletedIds.length > 0) {
        recordDeletedId(restoreData.deletedIds);
      }
      if (restoreRes.status === 403 || restoreData.deleted) {
        recordDeletedId(cachedPilot.id);
        return { user: null, deleted: true };
      }
      if (restoreRes.ok && restoreData.authenticated && restoreData.user) {
        if (restoreData.sessionToken) {
          setStoredSessionToken(restoreData.sessionToken);
        }
        return { user: normalizeUserRecord(restoreData.user), deleted: false };
      }
    } catch {
      // Offline / transient network error — keep cached pilot
    }
    const deletedSet = new Set(getDeletedIds());
    if (deletedSet.has(cachedPilot.id)) {
      return { user: null, deleted: true };
    }
    return { user: cachedPilot, deleted: false };
  };

  const fetchAuthData = async () => {
    try {
      const authHeaders = getSessionAuthHeaders();
      const [meRes, accountsRes] = await Promise.all([
        gpApiFetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', headers: authHeaders }),
        gpApiFetch('/api/auth/accounts', { credentials: 'same-origin', cache: 'no-store', headers: authHeaders })
      ]);

      let serverDeletedIds: string[] = [];
      let rawPublicAccounts: any[] = [];

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json().catch(() => ({}));
        if (Array.isArray(accountsData.deletedIds) && accountsData.deletedIds.length > 0) {
          serverDeletedIds.push(...accountsData.deletedIds);
        }
        if (Array.isArray(accountsData.accounts)) {
          rawPublicAccounts = accountsData.accounts;
        }
      }

      let activeSessionUser: User | null = null;
      let accountExplicitlyDeleted = false;

      if (meRes.ok) {
        const meData = await meRes.json().catch(() => ({}));
        if (Array.isArray(meData.deletedIds) && meData.deletedIds.length > 0) {
          serverDeletedIds.push(...meData.deletedIds);
        }
        if (meData.deleted) {
          accountExplicitlyDeleted = true;
        } else if (meData.authenticated && meData.user) {
          activeSessionUser = normalizeUserRecord(meData.user);
        }
      }

      if (serverDeletedIds.length > 0) {
        recordDeletedId(serverDeletedIds);
      }

      const deletedSet = new Set(getDeletedIds());
      let publicAccounts: User[] = PUBLIC_FALLBACK_ACCOUNTS.filter(u => !deletedSet.has(u.id));
      if (rawPublicAccounts.length > 0) {
        publicAccounts = rawPublicAccounts
          .filter((u: any) => u && u.id && !deletedSet.has(u.id))
          .map(normalizeUserRecord);
      }

      if (!activeSessionUser && !accountExplicitlyDeleted) {
        const autostartMode =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('autostart')
            : null;
        if (autostartMode === '1') {
          const demoPilot = normalizeUserRecord({
            id: 'u_pilot07',
            originalName: 'Vikram Sengupta',
            fullName: 'Vikram Sengupta',
            pilotNickname: 'F77 PILOT',
            email: 'vikram.sengupta@example.com',
            mobile: '+91 98860 22345',
            city: 'Bengaluru',
            state: 'Karnataka',
            motorcycleModel: 'F77',
            variant: 'Shadow Stealth (10.3 kWh)',
            registrationNumber: 'KA 03 EV 4077',
            purchaseDate: '2024-06-20',
            bloodGroup: 'B+',
            emergencyContact: { name: 'Ananya Sengupta', relationship: 'Spouse', phone: '+91 98860 77654' },
            role: 'verified_member',
            verificationStatus: 'verified',
            joinedAt: '2024-02-20T18:10:00Z',
            optInSquadronAssist: true,
            privacySettings: {
              showStartingPoint: false,
              showCity: true,
              showMotorcycleDetails: true
            }
          });
          setCurrentUser(demoPilot);
          localStorage.setItem('ghost_protocol_user_id', demoPilot.id);
          localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(demoPilot));
          setAvailableUsers(publicAccounts);
          saveToCache(CACHE_KEYS.USERS, publicAccounts);
          return;
        } else if (autostartMode === 'admin') {
          const demoAdmin = normalizeUserRecord({
            ...PUBLIC_FALLBACK_ACCOUNTS[0],
            email: 'abinavthejas2001@gmail.com',
            mobile: '+91 98450 11099'
          });
          setCurrentUser(demoAdmin);
          localStorage.setItem('ghost_protocol_user_id', demoAdmin.id);
          localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(demoAdmin));
          setAvailableUsers(publicAccounts);
          saveToCache(CACHE_KEYS.USERS, publicAccounts);
          return;
        } else {
          // If user previously logged in, restore server session token automatically across updates/republishes
          const storedUserObj =
            typeof window !== 'undefined' ? localStorage.getItem('ghost_protocol_current_user_obj') : null;
          if (storedUserObj) {
            try {
              const cachedPilot = normalizeUserRecord(JSON.parse(storedUserObj));
              if (cachedPilot && cachedPilot.id) {
                if (deletedSet.has(cachedPilot.id)) {
                  accountExplicitlyDeleted = true;
                } else {
                  const restored = await restoreSessionFromServer(cachedPilot);
                  if (restored.deleted) {
                    accountExplicitlyDeleted = true;
                  } else if (restored.user) {
                    activeSessionUser = restored.user;
                  }
                }
              }
            } catch {
              // Ignore parse error
            }
          }
        }
      }

      if (activeSessionUser && !deletedSet.has(activeSessionUser.id)) {
        setCurrentUser(activeSessionUser);
        localStorage.setItem('ghost_protocol_user_id', activeSessionUser.id);
        localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(activeSessionUser));
        void processOfflineQueue();
        scheduleServerReconciliation();

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
            const adminData = await adminUsersRes.json().catch(() => ({}));
            if (Array.isArray(adminData.deletedIds) && adminData.deletedIds.length > 0) {
              recordDeletedId(adminData.deletedIds);
            }
            const latestDeletedSet = new Set(getDeletedIds());
            if (Array.isArray(adminData.users)) {
              const normalizedAdminUsers = adminData.users
                .filter((u: any) => u && u.id && !latestDeletedSet.has(u.id))
                .map(normalizeUserRecord);
              setAvailableUsers(normalizedAdminUsers);
              saveToCache(
                CACHE_KEYS.USERS,
                publicAccounts.filter(u => !latestDeletedSet.has(u.id))
              );
              return;
            }
          }
        }
      } else {
        // Clear session if visitor is unauthenticated or if account was permanently removed
        setCurrentUser(null);
        setStoredSessionToken(null);
        localStorage.removeItem('ghost_protocol_user_id');
        localStorage.removeItem('ghost_protocol_current_user_obj');
      }

      const finalDeletedSet = new Set(getDeletedIds());
      const filteredPublic = publicAccounts.filter(u => !finalDeletedSet.has(u.id));
      setAvailableUsers(filteredPublic);
      saveToCache(CACHE_KEYS.USERS, filteredPublic);
    } catch {
      // Offline mode: restore only if a previously verified session user was cached and not deleted
      const offlineDeletedSet = new Set(getDeletedIds());
      const cachedAccounts = (loadFromCache<User[]>(CACHE_KEYS.USERS)?.data || PUBLIC_FALLBACK_ACCOUNTS)
        .filter(u => !offlineDeletedSet.has(u.id))
        .map(normalizeUserRecord);
      setAvailableUsers(cachedAccounts);
      try {
        const savedUserJson = localStorage.getItem('ghost_protocol_current_user_obj');
        if (savedUserJson) {
          const parsed = normalizeUserRecord(JSON.parse(savedUserJson));
          if (parsed && parsed.id && !offlineDeletedSet.has(parsed.id)) {
            setCurrentUser(parsed);
          } else {
            setCurrentUser(null);
            setStoredSessionToken(null);
            localStorage.removeItem('ghost_protocol_user_id');
            localStorage.removeItem('ghost_protocol_current_user_obj');
          }
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

    const handleUsersSynced = () => {
      const deletedSet = new Set(getDeletedIds());
      setAvailableUsers(prev => prev.filter(u => !deletedSet.has(u.id)));
      setCurrentUser(prev => {
        if (prev && deletedSet.has(prev.id)) {
          setStoredSessionToken(null);
          localStorage.removeItem('ghost_protocol_user_id');
          localStorage.removeItem('ghost_protocol_current_user_obj');
          return null;
        }
        return prev;
      });
      void fetchAuthData();
    };

    const handleWindowFocus = () => {
      void fetchAuthData();
    };

    window.addEventListener('ghost-users-synced', handleUsersSynced);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('ghost-users-synced', handleUsersSynced);
      window.removeEventListener('focus', handleWindowFocus);
    };
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

  const loginWithGoogle = async () => {
    try {
      const fbUser = await signInWithGoogleForCloudSync();
      if (!fbUser || !fbUser.email) {
        return { success: false, error: 'Google sign-in was canceled or failed to return email.' };
      }

      const res = await gpApiFetch('/api/auth/google', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email: fbUser.email,
          name: fbUser.displayName || fbUser.email.split('@')[0],
          googleUid: fbUser.uid,
          photoUrl: fbUser.photoURL || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Google authentication failed' };
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
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to authenticate with Google' };
    }
  };

  const loginWithGoogleEmail = async (email: string, name?: string) => {
    try {
      const cleanedEmail = email.trim().toLowerCase();
      if (!cleanedEmail || !cleanedEmail.includes('@')) {
        return { success: false, error: 'Please enter a valid Google email address.' };
      }

      const res = await gpApiFetch('/api/auth/google', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email: cleanedEmail,
          name: name || cleanedEmail.split('@')[0]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Google authentication failed' };
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
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to authenticate with Google' };
    }
  };

  const setupPassword = async (params: {
    userId?: string;
    email?: string;
    setupToken?: string;
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
    const effectiveUpdates: Partial<User> = { ...updates };
    if (
      effectiveUpdates.motorcycleModel &&
      !effectiveUpdates.pilotNickname &&
      (!currentUser.pilotNickname ||
        currentUser.pilotNickname === 'F77 PILOT' ||
        currentUser.pilotNickname === 'X47 PILOT')
    ) {
      effectiveUpdates.pilotNickname = inferDefaultPilotNickname(effectiveUpdates.motorcycleModel);
    }
    try {
      const res = await gpApiFetch('/api/auth/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(effectiveUpdates)
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
      const optimistic = normalizeUserRecord({ ...currentUser, ...effectiveUpdates });
      setCurrentUser(optimistic);
      localStorage.setItem('ghost_protocol_current_user_obj', JSON.stringify(optimistic));
      enqueueOfflineAction('/api/auth/profile', 'PUT', effectiveUpdates, {
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
      let res = await gpApiFetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getSessionAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ reason })
      });

      // If server session token expired or rotated across container restart, auto-restore and retry
      if (res.status === 401 && currentUser) {
        const restored = await restoreSessionFromServer(currentUser);
        if (restored.user) {
          res = await gpApiFetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: getSessionAuthHeaders({
              'Content-Type': 'application/json'
            }),
            body: JSON.stringify({ reason })
          });
        }
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to permanently remove user from database' };
      }
      if (Array.isArray(data.deletedIds) && data.deletedIds.length > 0) {
        recordDeletedId(data.deletedIds);
      }
      recordDeletedId(targetUserId);
      setAvailableUsers(prev => {
        const next = prev.filter(u => u.id !== targetUserId);
        saveToCache(CACHE_KEYS.USERS, next);
        return next;
      });
      if (currentUser?.id === targetUserId) {
        await logout();
      } else {
        await fetchAuthData();
      }
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
          newPassword: authPassword
        });
        if (!res.success) {
          setAuthError(res.error || 'Failed to update password');
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
        authModalOpen,
        switchPersona,
        openAuthModal,
        closeAuthModal,
        login,
        loginWithGoogle,
        loginWithGoogleEmail,
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
                  SET / RESET PASSWORD
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
