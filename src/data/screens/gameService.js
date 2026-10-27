import { db } from './firebaseConfig';
import { doc, setDoc, increment, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { saveGameResult } from './path/to/gameService';

export const saveGameResult = async (gameType, score, coinsEarned) => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (user) {
    // 1. บันทึกประวัติ
    await addDoc(collection(db, "game_results"), {
      uid: user.uid,
      gameType,
      score,
      timestamp: serverTimestamp()
    });

    saveGameResult('Grammar', finalScore, 10); // เพิ่ม 10 เหรียญ

    // 2. อัปเดตเหรียญในโปรไฟล์
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      coins: increment(coinsEarned)
    });
  }
};