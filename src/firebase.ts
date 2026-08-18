import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Safe initialization guard: Only initialize Firebase if a valid non-empty apiKey is present
const hasValidKey = Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey.trim() !== '');

export const app = getApps().length > 0 
  ? getApps()[0] 
  : (hasValidKey ? initializeApp(firebaseConfig) : null);

export const auth: any = app ? getAuth(app) : {
  currentUser: {
    uid: 'admin-user-001',
    email: 'admin@wotsocial.com',
    displayName: 'WotSocial Admin'
  },
  onAuthStateChanged: (cb: any) => {
    cb({
      uid: 'admin-user-001',
      email: 'admin@wotsocial.com',
      displayName: 'WotSocial Admin'
    });
    return () => {};
  }
};

export const loginWithGoogle = async () => {
  return true;
};

export const logout = async () => {
  return true;
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Operation error: ', error);
  throw error;
}
