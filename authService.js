// เซอร์วิสจัดการระบบผู้ใช้ 
import { auth } from '../../../firebaseConfig';
import { 
  GoogleAuthProvider, 
  FacebookAuthProvider, 
  signInWithCredential 
} from 'firebase/auth';

export const signInWithGoogle = async (idToken) => {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
};

export const signInWithFacebook = async (accessToken) => {
  const credential = FacebookAuthProvider.credential(accessToken);
  return signInWithCredential(auth, credential);
};

export const logout = () => auth.signOut();