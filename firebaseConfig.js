import { initializeApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyA4W1GchshWwf4sgRB1rKGZgmjtSYgNcGo",
  authDomain: "wordlygrams.firebaseapp.com",
  projectId: "wordlygrams",
  storageBucket: "wordlygrams.firebasestorage.app",
  messagingSenderId: "614097510744",
  appId: "1:614097510744:web:73d0ec5d68aa29207e052d",
  measurementId: "G-3Z55P8XT52"
};

const app = initializeApp(firebaseConfig);

// เก็บสถานะล็อกอินไว้ในเครื่อง ไม่ให้หลุดตอนปิดแอป
let auth;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch (e) {
  if (e?.code !== "auth/already-initialized") {
    console.warn("[Firebase] Auth persistence unavailable, using getAuth:", e?.message);
  }
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };