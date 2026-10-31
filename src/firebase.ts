import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type UserCredential,
  type User as FirebaseUser
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Auth with partitioned storage resilience & local persistence
function createFirebaseAuth() {
  if (typeof window !== 'undefined') {
    try {
      return initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver
      });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = createFirebaseAuth();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    // Wait for auth to resolve persisted session so we don't race against token refresh
    if (typeof (auth as any).authStateReady === 'function') {
      try {
        await auth.authStateReady();
      } catch {
        // Ignore authStateReady rejection
      }
    }

    // Proactively check if the restored user has an active token or disabled token service API
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken();
      } catch (tokenErr: unknown) {
        const tokenMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
        if (tokenMsg.includes('token-service-api') || tokenMsg.includes('securetoken')) {
          console.warn('Google Cloud Token Service API is disabled on project. Clearing stale session:', tokenMsg);
          try {
            await signOut(auth);
          } catch {
            // Ignore signout error
          }
        }
      }
    }

    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      // Check if the offline state was caused by an invalid/broken auth token (e.g. disabled securetoken.googleapis.com)
      if (auth.currentUser) {
        try {
          await auth.currentUser.getIdToken();
        } catch (tokenErr: unknown) {
          const tokenMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
          if (tokenMsg.includes('token-service-api') || tokenMsg.includes('securetoken')) {
            console.warn('Signing out user due to disabled token service API on project:', tokenMsg);
            try {
              await signOut(auth);
              // Retry connection check as unauthenticated client
              await getDocFromServer(doc(db, 'test', 'connection'));
              return;
            } catch (retryErr) {
              if (retryErr instanceof Error && !retryErr.message.includes('the client is offline')) {
                // Online backend reached successfully (e.g. PERMISSION_DENIED on /test/connection)
                return;
              }
            }
          }
        }
      }
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

// Auto-heal broken auth sessions on startup if Token Service API is disabled
if (typeof window !== 'undefined') {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        await user.getIdToken();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('token-service-api') || msg.includes('securetoken.googleapis.com')) {
          console.warn('Google Cloud Token Service API (securetoken.googleapis.com) is disabled on project. Clearing stale session:', msg);
          try {
            await signOut(auth);
          } catch {
            // ignore
          }
        }
      }
    }
  });
}

export async function signInWithGoogleForCloudSync(): Promise<FirebaseUser | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    return cred.user;
  } catch (err: unknown) {
    const code = (err as any)?.code || '';
    const msg = err instanceof Error ? err.message : String(err);
    const isWebView = typeof navigator !== 'undefined' && /wv|Android.*Version\/[0-9]/i.test(navigator.userAgent);

    if (code === 'auth/missing-initial-state' || msg.includes('missing initial state') || msg.includes('sessionStorage is inaccessible') || isWebView) {
      const guidance = isWebView
        ? 'Google Sign-In is restricted inside Play Store App WebViews because Android isolates web storage across popups. Please sign in using your Pilot ID & Password, or tap "Open in External Browser".'
        : 'Google Sign-In blocked by browser storage partitioning. When previewed inside an iframe, Play Store WebView, or private window with third-party cookie blocking, browser sessionStorage is restricted. To resolve: 1) Sign in using your Pilot ID & Password, or 2) Open this app in an external browser tab.';
      console.warn('Firebase Auth Storage Partitioning / WebView Notice:', msg);
      throw new Error(guidance);
    }

    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in popup was blocked or closed. Please allow popups or use Pilot ID & Password.');
    }

    if (code === 'auth/unauthorized-domain') {
      throw new Error(`This domain is not authorized in Firebase Console -> Authentication -> Settings -> Authorized Domains. Please add ${window.location.hostname} to authorized domains.`);
    }

    if (msg.includes('token-service-api') || msg.includes('securetoken.googleapis.com')) {
      const detailedMsg =
        'Google Cloud Token Service API (securetoken.googleapis.com) is disabled on project 214972545002. Please enable it in Google Cloud Console: https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=214972545002';
      console.error(detailedMsg);
      throw new Error(detailedMsg);
    }
    throw err;
  }
}

export async function signOutFromFirebaseCloudSync(): Promise<void> {
  await signOut(auth);
}

// ============================================================================
// FIREBASE PHONE NUMBER OTP AUTHENTICATION
// ============================================================================

let recaptchaVerifierInstance: RecaptchaVerifier | null = null;

export function initRecaptchaVerifier(containerId: string = 'recaptcha-container'): RecaptchaVerifier {
  if (typeof window === 'undefined') {
    throw new Error('reCAPTCHA can only be initialized in the browser.');
  }

  if (recaptchaVerifierInstance) {
    try {
      recaptchaVerifierInstance.clear();
    } catch {
      // ignore
    }
  }

  recaptchaVerifierInstance = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      // Response expired
    }
  });

  return recaptchaVerifierInstance;
}

export async function sendFirebasePhoneOtp(
  phoneNumber: string,
  containerId: string = 'recaptcha-container'
): Promise<ConfirmationResult> {
  const verifier = initRecaptchaVerifier(containerId);
  const cleanDigits = phoneNumber.replace(/\D/g, '');
  const formattedPhone = phoneNumber.startsWith('+')
    ? phoneNumber.replace(/\s+/g, '')
    : `+91${cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits}`;

  return await signInWithPhoneNumber(auth, formattedPhone, verifier);
}

export async function verifyFirebasePhoneOtp(
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<UserCredential> {
  return await confirmationResult.confirm(otpCode);
}

