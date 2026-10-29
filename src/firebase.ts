import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
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
export const auth = getAuth(app);

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
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGoogleForCloudSync(): Promise<FirebaseUser | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
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

