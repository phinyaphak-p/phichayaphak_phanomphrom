import { doc, getDoc, setDoc, increment } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../../../../firebaseConfig";

//  คีย์สำหรับจัดเก็บข้อมูลในตัวเครื่อง (Local Storage) สำหรับผู้เล่นที่ไม่ได้ล็อกอิน (Guest Mode)
const GUEST_STORAGE_KEY = "@guest_game_scores";
const GUEST_PROFILE_KEY = "@guest_profile"; 

/**
 *  ฟังก์ชันช่วยเหลือ: จัดรูปแบบโครงสร้างข้อมูลคะแนนมินิเกม (Crossword/Spelling)
 * - เก็บประวัติการเล่นย้อนหลัง (attempts) สูงสุด 20 ครั้งล่าสุด
 */
const buildWordGameEntry = (oldData = {}, newStats = {}, level = "") => {
  const { roundHints, levelIndex, ...persist } = newStats;
  const attempt = {
    accuracy: Number(persist.accuracy) || 0,
    level,
    playedAt: new Date().toISOString(),
  };
  if (roundHints !== undefined) attempt.hints = Number(roundHints) || 0;
  if (levelIndex !== undefined) attempt.levelIndex = Number(levelIndex) || 0;

  return {
    ...oldData,
    ...persist,
    attempts: [
      attempt,
      ...(Array.isArray(oldData.attempts) ? oldData.attempts : []),
    ].slice(0, 20),
  };
};

/**
 *  ฟังก์ชันหลัก: บันทึกคะแนนและสถิติการเล่นเกมทั้งหมด (ใช้ตอบคำถาม: "เก็บคะแนนไว้ที่ไหน?")
 * - ถ้า Login อยู่: บันทึกขึ้น **Firebase Firestore (บน Cloud)** ทันที
 * - ถ้าเป็น Guest: บันทึกเก็บไว้ใน **AsyncStorage (ในตัวเครื่องมือถือ)**
 */
export const saveGameScore = async (
  gameType,
  level,
  newStats,
  topic = null,
  earnedCoins = 30,
) => {
  const user = auth.currentUser;
  const formattedLevel = level
    ? level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()
    : "Beginner";

  //  เงื่อนไขที่ 1: บันทึกข้อมูลลงฐานข้อมูลจริงบน Firebase (กรณีผู้ใช้ล็อกอินแล้ว)
  if (user && !user.isAnonymous) {
    try {
      const userRef = doc(db, "users", user.uid);

      //  ป้องกัน Error "No document to update": เช็กก่อนว่ามี Document ของ User นี้ยัง ถ้ายังให้สร้างตัวเปล่าไว้ก่อน
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(
          userRef,
          {
            name: user.displayName || `Player_${user.uid.substring(0, 4)}`,
            coins: 0,
            level: "Beginner",
            createdAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }

      const latestDocSnap = await getDoc(userRef);
      let existingData = latestDocSnap.exists() ? latestDocSnap.data() : {};
      let scoresData = existingData.scores || {
        grammar: { Beginner: {}, Intermediate: {}, Advanced: {} },
        crossword: {},
        spelling: {},
        battle: {},
        skillStats: {},
      };

      //  จัดโครงสร้างข้อมูลถ้าเป็นโหมด Grammar (แยกตาม Level และ Topic)
      if (gameType === "grammar" && topic) {
        if (!scoresData.grammar) scoresData.grammar = {};
        if (!scoresData.grammar[formattedLevel])
          scoresData.grammar[formattedLevel] = {};
        const oldData = scoresData.grammar[formattedLevel][topic] || {};

        const newBestScore = Number(newStats.bestScore) || 0;
        const currentAttempt = {
          score: Number(newStats.score ?? newStats.bestScore) || 0,
          total: Number(newStats.total) || 0,
          accuracy: Number(newStats.accuracy) || 0,
          avgTime: newStats.avgTime || "0s",
          streak: Number(newStats.streak) || 0,
          playedAt: new Date().toISOString(),
        };

        scoresData.grammar[formattedLevel][topic] = {
          accuracy: Math.max(
            Number(newStats.accuracy) || 0,
            Number(oldData.accuracy) || 0,
          ),
          bestScore: Math.max(newBestScore, Number(oldData.bestScore) || 0),
          avgTime: newStats.avgTime || oldData.avgTime || "0s",
          streak: Math.max(
            Number(newStats.streak) || 0,
            Number(oldData.streak) || 0,
          ),
          attempts: [
            currentAttempt,
            ...(Array.isArray(oldData.attempts) ? oldData.attempts : []),
          ],
        };
      } else {
        //  สำหรับโหมดเกมอื่นๆ (Crossword, Spelling, Battle)
        if (!scoresData[gameType]) scoresData[gameType] = {};
        const targetKey = formattedLevel || "general";
        const oldData = scoresData[gameType][targetKey] || {};
        scoresData[gameType][targetKey] = buildWordGameEntry(oldData, newStats, targetKey);
      }

      //  อัปเดตคะแนนลง Firebase พร้อมบวกเหรียญสะสมเพิ่ม (Coins)
      const updatePayload = { scores: scoresData };
      if (earnedCoins > 0) updatePayload.coins = increment(earnedCoins);
      await setDoc(userRef, updatePayload, { merge: true });
    } catch (error) {
      console.error("Error saving score to Firebase:", error);
    }
  } else {
    //  เงื่อนไขที่ 2: บันทึกข้อมูลลงในเครื่อง (AsyncStorage) สำหรับ Guest Mode
    try {
      const storedData = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
      let scoresData = storedData
        ? JSON.parse(storedData)
        : {
            grammar: { Beginner: {}, Intermediate: {}, Advanced: {} },
            crossword: {},
            spelling: {},
            battle: {},
            skillStats: {},
          };

      if (gameType === "grammar" && topic) {
        if (!scoresData.grammar[formattedLevel])
          scoresData.grammar[formattedLevel] = {};
        const oldData = scoresData.grammar[formattedLevel][topic] || {};
        const newBestScore = Number(newStats.bestScore) || 0;

        const currentAttempt = {
          score: Number(newStats.score ?? newStats.bestScore) || 0,
          total: Number(newStats.total) || 0,
          accuracy: Number(newStats.accuracy) || 0,
          avgTime: newStats.avgTime || "0s",
          streak: Number(newStats.streak) || 0,
          playedAt: new Date().toISOString(),
        };

        scoresData.grammar[formattedLevel][topic] = {
          accuracy: Math.max(
            Number(newStats.accuracy) || 0,
            Number(oldData.accuracy) || 0,
          ),
          bestScore: Math.max(newBestScore, Number(oldData.bestScore) || 0),
          avgTime: newStats.avgTime || oldData.avgTime || "0s",
          streak: Math.max(
            Number(newStats.streak) || 0,
            Number(oldData.streak) || 0,
          ),
          attempts: [
            currentAttempt,
            ...(Array.isArray(oldData.attempts) ? oldData.attempts : []),
          ],
        };
      } else {
        if (!scoresData[gameType]) scoresData[gameType] = {};
        const targetKey = formattedLevel || "general";
        const oldData = scoresData[gameType][targetKey] || {};
        scoresData[gameType][targetKey] = buildWordGameEntry(oldData, newStats, targetKey);
      }

      await AsyncStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(scoresData));

      // 🪙 บันทึกเหรียญสะสมเฉพาะของ Guest ลงหน่วยความจำเครื่อง
      if (earnedCoins > 0) {
        const storedProfile = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
        const guestProfile = storedProfile
          ? JSON.parse(storedProfile)
          : { coins: 0 };
        guestProfile.coins = (guestProfile.coins ?? 0) + earnedCoins;
        await AsyncStorage.setItem(
          GUEST_PROFILE_KEY,
          JSON.stringify(guestProfile),
        );
      }
    } catch (error) {
      console.error("Error saving score to AsyncStorage:", error);
    }
  }
};

/**
 *  ฟังก์ชันตรวจสอบสถานะ: เช็กว่าผู้ใช้งานคนนี้ทำ Pre-test ไปแล้วหรือยัง (ทำได้ครั้งเดียว)
 */
export const isPretestDone = async () => {
  try {
    if (auth.authStateReady) await auth.authStateReady();
    const user = auth.currentUser;
    // เช็กจาก Firebase (กรณีล็อกอิน)
    if (user && !user.isAnonymous) {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const d = snap.exists() ? snap.data() : {};
        if (d.hasCompletedPretest || d.scores?.skillStats?.pretest) return true;
      } catch (e) {
        console.error("isPretestDone (account) error:", e);
      }
    }
    // เช็กจาก AsyncStorage (กรณี Guest)
    const raw = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
    return raw ? !!JSON.parse(raw).hasCompletedPretest : false;
  } catch (e) {
    console.error("isPretestDone error:", e);
    return false;
  }
};

/**
 *  ฟังก์ชันบันทึกผลคะแนน Pre-test (บันทึกครั้งเดียวจบ เพื่อเอาผลไปจัดระดับเลเวลเริ่มต้น)
 */
export const savePretestResult = async (level, score, total) => {
  if (await isPretestDone()) return;
  const scoreText = `${score}/${total}`;
  const user = auth.currentUser;

  // บันทึกลง Firebase สำหรับผู้ใช้ทั่วไป
  if (user && !user.isAnonymous) {
    await setDoc(
      doc(db, "users", user.uid),
      {
        level,
        hasCompletedPretest: true,
        scores: { skillStats: { pretest: scoreText } },
      },
      { merge: true },
    );
    return;
  }

  // บันทึกลงตัวเครื่องสำหรับ Guest Mode
  const rawProfile = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
  const profile = rawProfile ? JSON.parse(rawProfile) : {};
  await AsyncStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({
      ...profile,
      level,
      hasCompletedPretest: true,
      pretestScore: scoreText,
    }),
  );

  const rawScores = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
  const gs = rawScores
    ? JSON.parse(rawScores)
    : {
        grammar: { Beginner: {}, Intermediate: {}, Advanced: {} },
        crossword: {},
        spelling: {},
        battle: {},
        skillStats: {},
      };
  gs.skillStats = { ...(gs.skillStats || {}), pretest: scoreText };
  await AsyncStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(gs));
};