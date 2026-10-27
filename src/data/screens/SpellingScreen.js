import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ImageBackground,
  Image,
  Dimensions,
  Animated,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ConfettiCannon from "react-native-confetti-cannon";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  increment,
  getDoc,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { spellingData } from "../screens/spellingData";
import { saveGameScore } from "./services/scoreService";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HINT_COST = 30; // ราคา Hint 30 เหรียญ
const REWARD_COINS = 30; // รางวัลเมื่อเล่นผ่านด่าน

const LEVELS_PER_DIFFICULTY = 5; // ทุกระดับความยากมีได้สูงสุด 5 ด่าน

// ---------- ค่าคงที่สำหรับจัดเลย์เอาต์ ----------
const GAP = 8; // ระยะห่างระหว่างช่อง/ปุ่ม
const MAX_SLOT = 48; // ขนาดช่องคำตอบสูงสุด
const MIN_SLOT = 36; // ขนาดช่องคำตอบต่ำสุดก่อนจะขึ้นแถวใหม่
const MAX_BTN = 52; // ขนาดปุ่มตัวอักษรสูงสุด
const MIN_BTN = 40; // ขนาดปุ่มตัวอักษรต่ำสุด (ยังกดง่าย)
const MAX_IMG = 220; // ขนาดรูปโจทย์สูงสุด
const MIN_IMG = 130; // ขนาดรูปโจทย์ต่ำสุด

// คำนวณขนาดช่องคำตอบ ปุ่มตัวอักษร และรูปโจทย์ ให้พอดีหน้าจอเสมอ
// - คำสั้น: ช่องเรียงแถวเดียว
// - คำยาว: แบ่งเป็นหลายแถวแบบสมดุล (ลำดับช่องเรียงจากซ้ายไปขวา บนลงล่าง)
// - ถ้าพื้นที่แนวตั้งไม่พอ จะลดขนาดรูปก่อน แล้วค่อยลดขนาดปุ่ม
const computeLayout = (W, H, wordLen, poolLen) => {
  const avail = W - 32; // เว้นขอบซ้ายขวาข้างละ 16

  let perRow;
  if (wordLen * (MIN_SLOT + GAP) <= avail) {
    perRow = wordLen;
  } else {
    const maxPer = Math.max(1, Math.floor(avail / (MIN_SLOT + GAP)));
    perRow = Math.ceil(wordLen / Math.ceil(wordLen / maxPer));
  }
  const slotSize = Math.max(
    28,
    Math.min(MAX_SLOT, Math.floor(avail / perRow) - GAP),
  );
  const slotRows = Math.ceil(wordLen / perRow);
  const slotsH = slotRows * (slotSize + GAP);

  for (let btn = MAX_BTN; btn >= MIN_BTN; btn -= 2) {
    const poolPerRow = Math.max(1, Math.floor(avail / (btn + GAP)));
    const poolH = Math.ceil(poolLen / poolPerRow) * (btn + GAP);
    for (let img = MAX_IMG; img >= MIN_IMG; img -= 10) {
      if (img + 24 + slotsH + 24 + poolH <= H) {
        return { perRow, slotSize, btn, img };
      }
    }
  }
  return { perRow, slotSize, btn: MIN_BTN, img: MIN_IMG };
};

const SpellingScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, 15);
  const { width: winW, height: winH } = useWindowDimensions();

  const levelData = route?.params?.levelData || {
    id: "level_1",
    title: "Level 1",
    word: "CAT",
    image: require("../../../assets/spelling/cat.jpg"),
  };

  const category = route?.params?.category || "Beginner";
  const currentLevelIndex = route?.params?.levelIndex || 0;
  const targetWord = levelData.word.toUpperCase();
  const wordLength = targetWord.length;
  const poolLength = wordLength + (wordLength <= 3 ? 3 : 4); // ตัวอักษรจริง + ตัวหลอก

  // พื้นที่แนวตั้งที่ใช้วางเนื้อหาเกม (หักส่วนหัวและขอบล่าง)
  const availableHeight =
    winH - (topPadding + 70) - (Math.max(insets.bottom, 12) + 16);
  const layout = useMemo(
    () => computeLayout(winW, availableHeight, wordLength, poolLength),
    [winW, availableHeight, wordLength, poolLength],
  );

  // GAME STATE
  const [isLevelCompleted, setIsLevelCompleted] = useState(false);
  const [userCoins, setUserCoins] = useState(0);
  const [hintCount, setHintCount] = useState(2);
  const [selectedLetters, setSelectedLetters] = useState(
    Array(wordLength).fill(null),
  );
  const [shuffledPool, setShuffledPool] = useState([]);
  const [usedIndices, setUsedIndices] = useState([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showNoCoinModal, setShowNoCoinModal] = useState(false);
  const [rewardShown, setRewardShown] = useState(REWARD_COINS); // State ควบคุมการแสดงผลเหรียญรางวัล

  // STATS & REFS
  const hintUsedThisRoundRef = useRef(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [roundMaxStreak, setRoundMaxStreak] = useState(0);

  // ANIMATIONS
  const resultScale = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const isCompletedRef = useRef(false);

  // FETCH USER COINS
  useEffect(() => {
    const user = getAuth().currentUser;
    if (user && !user.isAnonymous) {
      return onSnapshot(doc(getFirestore(), "users", user.uid), (snap) => {
        if (snap.exists()) setUserCoins(snap.data().coins ?? 0);
      });
    }
    AsyncStorage.getItem("@guest_profile")
      .then((raw) => {
        if (raw) setUserCoins(JSON.parse(raw).coins ?? 0);
      })
      .catch((e) => console.error("Error loading guest coins:", e));
  }, []);

  useEffect(() => {
    resetLevelState();
  }, [levelData]);

  const resetLevelState = () => {
    isCompletedRef.current = false;
    const lettersArray = targetWord.split("");
    const dummyAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const extraCount = targetWord.length <= 3 ? 3 : 4;

    let pool = [...lettersArray];
    for (let i = 0; i < extraCount; i++) {
      const randomChar =
        dummyAlphabet[Math.floor(Math.random() * dummyAlphabet.length)];
      pool.push(randomChar);
    }

    const shuffled = pool.sort(() => Math.random() - 0.5);

    setShuffledPool(shuffled);
    setSelectedLetters(Array(targetWord.length).fill(null));
    setUsedIndices([]);
    setIsCompleted(false);
    setIsLevelCompleted(false);
    setHintCount(2);
    hintUsedThisRoundRef.current = 0;
    setCurrentStreak(0);
    setRoundMaxStreak(0);

    resultScale.setValue(0);
    resultOpacity.setValue(0);
    shakeAnim.setValue(0);
  };

  // USE HINT SYSTEM
  const handleUseHint = async () => {
    if (isCompletedRef.current || isCompleted) return;

    const emptyIndex = selectedLetters.findIndex(
      (val, idx) => val === null || val.letter !== targetWord[idx],
    );

    if (emptyIndex === -1) return;
    const correctLetter = targetWord[emptyIndex];

    if (hintCount > 0) {
      setHintCount(hintCount - 1);
      applyHint(emptyIndex, correctLetter);
      return;
    }

    if (userCoins >= HINT_COST) {
      try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (user && !user.isAnonymous) {
          const userRef = doc(getFirestore(), "users", user.uid);
          await setDoc(
            userRef,
            { coins: increment(-HINT_COST) },
            { merge: true },
          );
          setUserCoins((prev) => Math.max(0, prev - HINT_COST));
          applyHint(emptyIndex, correctLetter);
        } else {
          const storedProfile = await AsyncStorage.getItem("@guest_profile");
          if (storedProfile) {
            let profile = JSON.parse(storedProfile);
            const currentCoins = profile.coins ?? profile.coin ?? 0;

            if (currentCoins >= HINT_COST) {
              const newCoins = currentCoins - HINT_COST;
              profile.coins = newCoins;
              profile.coin = newCoins;
              await AsyncStorage.setItem(
                "@guest_profile",
                JSON.stringify(profile),
              );
              setUserCoins(newCoins);
              applyHint(emptyIndex, correctLetter);
            } else {
              setShowNoCoinModal(true);
            }
          } else {
            setShowNoCoinModal(true);
          }
        }
      } catch (error) {
        console.error("Error deducting coins for hint: ", error);
      }
    } else {
      setShowNoCoinModal(true);
    }
  };

  const applyHint = (targetIndex, correctLetter) => {
    hintUsedThisRoundRef.current += 1;

    const newSelected = [...selectedLetters];
    const existingItem = newSelected[targetIndex];
    let currentUsedIndices = [...usedIndices];

    if (existingItem) {
      currentUsedIndices = currentUsedIndices.filter(
        (idx) => idx !== existingItem.poolIndex,
      );
    }

    // รองรับกรณีตัวอักษรถูกวางสลับช่องอยู่
    let poolIndexToUse = shuffledPool.findIndex(
      (letter, idx) =>
        letter === correctLetter && !currentUsedIndices.includes(idx),
    );
    if (poolIndexToUse === -1) {
      const otherSlot = newSelected.findIndex(
        (it, s) => it && s !== targetIndex && it.letter === correctLetter,
      );
      if (otherSlot !== -1) {
        poolIndexToUse = newSelected[otherSlot].poolIndex;
        newSelected[otherSlot] = null;
        currentUsedIndices = currentUsedIndices.filter(
          (i) => i !== poolIndexToUse,
        );
      }
    }

    if (poolIndexToUse !== -1) {
      newSelected[targetIndex] = {
        letter: correctLetter,
        poolIndex: poolIndexToUse,
      };

      setUsedIndices([...currentUsedIndices, poolIndexToUse]);
      setSelectedLetters(newSelected);

      const updatedValues = newSelected
        .map((item) => (item ? item.letter : ""))
        .join("");

      if (updatedValues.length === wordLength) {
        checkAnswer(updatedValues);
      }
    }
  };

  const handlePressPoolLetter = (letter, poolIndex) => {
    if (isCompletedRef.current || isCompleted) return;

    const firstEmptyIndex = selectedLetters.findIndex((val) => val === null);

    if (firstEmptyIndex !== -1) {
      const newSelected = [...selectedLetters];
      newSelected[firstEmptyIndex] = { letter, poolIndex };
      setSelectedLetters(newSelected);
      setUsedIndices([...usedIndices, poolIndex]);

      const updatedValues = newSelected
        .map((item) => (item ? item.letter : ""))
        .join("");

      if (updatedValues.length === wordLength) {
        checkAnswer(updatedValues);
      }
    }
  };

  const handleRemoveLetter = (selectedIndex) => {
    if (isCompletedRef.current || isCompleted) return;

    const itemToRemove = selectedLetters[selectedIndex];
    if (!itemToRemove) return;

    const newSelected = [...selectedLetters];
    newSelected[selectedIndex] = null;
    setSelectedLetters(newSelected);
    setUsedIndices(usedIndices.filter((idx) => idx !== itemToRemove.poolIndex));
  };

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const checkAnswer = (formedWord) => {
    if (formedWord === targetWord) {
      if (isCompletedRef.current) return;
      isCompletedRef.current = true;

      const nextStreak = currentStreak + 1;
      setCurrentStreak(nextStreak);
      if (nextStreak > roundMaxStreak) setRoundMaxStreak(nextStreak);

      setIsCompleted(true);
      setIsLevelCompleted(true);

      saveProgressAndScore();

      setTimeout(() => {
        resultScale.setValue(0.3);
        resultOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(resultScale, {
            toValue: 1,
            friction: 5,
            useNativeDriver: true,
          }),
          Animated.timing(resultOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      }, 300);
    } else {
      setCurrentStreak(0);
      triggerShake();
      setTimeout(() => {
        setSelectedLetters(Array(wordLength).fill(null));
        setUsedIndices([]);
      }, 500);
    }
  };

  // 💾 บันทึกความคืบหน้าด่านและคะแนนสถิติ
  const saveProgressAndScore = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const formattedCategory =
        category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

      const hintsThisRound = hintUsedThisRoundRef.current;
      const accuracyVal = Math.max(0, 100 - hintsThisRound * 25);
      const isNoHintThisRound = hintsThisRound === 0 ? 1 : 0;
      let finalBestStreak = roundMaxStreak > 0 ? roundMaxStreak : 1;
      const targetLevelKey = `level_${currentLevelIndex}`;

      if (user && !user.isAnonymous) {
        const db = getFirestore();
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        let oldNoHint = 0;
        let oldHints = 0;
        let oldStreak = 0;
        let spellingProgressMap = {};

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const oldData = userData?.scores?.spelling?.[formattedCategory] || {};
          oldStreak = oldData.streak || 0;
          oldNoHint = oldData.noHint || 0;
          oldHints = oldData.hints || 0;
          spellingProgressMap = userData.spellingProgress || {};
        }

        const catProgress = spellingProgressMap[formattedCategory] || {};
        const isAlreadyCompleted = catProgress[targetLevelKey];
        const earnedCoins = isAlreadyCompleted ? 0 : REWARD_COINS;
        setRewardShown(earnedCoins);

        let totalNoHint = oldNoHint;
        let totalHints = oldHints;

        if (!isAlreadyCompleted) {
          catProgress[targetLevelKey] = true;
          totalNoHint += isNoHintThisRound > 0 ? 1 : 0;
          totalHints += hintsThisRound;
        }

        spellingProgressMap[formattedCategory] = catProgress;
        finalBestStreak = Math.max(finalBestStreak, oldStreak);

        await saveGameScore(
          "spelling",
          formattedCategory,
          {
            accuracy: accuracyVal,
            noHint: totalNoHint,
            hints: totalHints,
            streak: finalBestStreak,
            roundHints: hintsThisRound, // จำนวน Hint ที่ใช้ในรอบนี้
            levelIndex: currentLevelIndex + 1, // เลขด่านที่เล่น (1-5)
          },
          null,
          earnedCoins,
        );

        await setDoc(
          userRef,
          { spellingProgress: spellingProgressMap },
          { merge: true },
        );
      } else {
        // --- Guest Mode (AsyncStorage) ---
        const storedProfile = await AsyncStorage.getItem("@guest_profile");
        let profile = storedProfile
          ? JSON.parse(storedProfile)
          : { spellingProgress: {}, coins: 0 };

        let spellingProgressMap = profile.spellingProgress || {};
        let catProgress = spellingProgressMap[formattedCategory] || {};
        const isAlreadyCompleted = catProgress[targetLevelKey];
        const earnedCoins = isAlreadyCompleted ? 0 : REWARD_COINS;
        setRewardShown(earnedCoins);

        const storedScores = await AsyncStorage.getItem("@guest_game_scores");
        let guestScores = storedScores ? JSON.parse(storedScores) : {};
        let oldGuestData = guestScores?.spelling?.[formattedCategory] || {};
        let oldGuestHints = oldGuestData.hints || 0;
        let oldGuestNoHint = oldGuestData.noHint || 0;
        let oldGuestStreak = oldGuestData.streak || 0;

        let totalHintsGuest = oldGuestHints;
        let totalNoHintGuest = oldGuestNoHint;

        if (!isAlreadyCompleted) {
          catProgress[targetLevelKey] = true;
          totalNoHintGuest += isNoHintThisRound > 0 ? 1 : 0;
          totalHintsGuest += hintsThisRound;
        }

        spellingProgressMap[formattedCategory] = catProgress;
        profile.spellingProgress = spellingProgressMap;

        await AsyncStorage.setItem("@guest_profile", JSON.stringify(profile));

        const finalGuestStreak = Math.max(finalBestStreak, oldGuestStreak);

        await saveGameScore(
          "spelling",
          formattedCategory,
          {
            accuracy: accuracyVal,
            noHint: totalNoHintGuest,
            hints: totalHintsGuest,
            streak: finalGuestStreak,
            roundHints: hintsThisRound, // ให้ประวัติของ Guest เก็บข้อมูลเท่ากับผู้ใช้ที่ login
            levelIndex: currentLevelIndex + 1,
          },
          null,
          earnedCoins,
        );

        // อัปเดตเหรียญมุมจอของ Guest ให้ดึงค่าล่าสุดหลังจากบันทึกผลเสร็จ
        const fresh = await AsyncStorage.getItem("@guest_profile");
        if (fresh) setUserCoins(JSON.parse(fresh).coins ?? 0);
      }
    } catch (error) {
      console.error("Error saving spelling progress & score: ", error);
    }
  };

  // แบ่งช่องคำตอบเป็นแถว (ลำดับ index คงเดิม: ซ้าย→ขวา, บน→ล่าง)
  const slotRows = [];
  for (let i = 0; i < selectedLetters.length; i += layout.perRow) {
    slotRows.push(
      selectedLetters
        .slice(i, i + layout.perRow)
        .map((item, k) => ({ item, index: i + k })),
    );
  }

  return (
    <ImageBackground
      source={require("../../../assets/background-spelling-game.png")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={[styles.safeArea, { paddingTop: topPadding }]}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={26} color="#1A2530" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>
              {levelData.title.toUpperCase()}
            </Text>
          </View>

          <View style={styles.coinContainer}>
            <Text style={styles.coinText}>{userCoins}</Text>
            <View style={styles.coinBadge} />
          </View>
        </View>

        {/* MAIN GAME (เลื่อนได้เฉพาะกรณีหน้าจอเล็กมากจนจัดไม่พอ) */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.mainContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View
            style={[
              styles.imageCardContainer,
              { width: layout.img, height: layout.img },
            ]}
          >
            <View
              style={[
                styles.imageCard,
                { width: layout.img, height: layout.img },
              ]}
            >
              <Image
                source={levelData.image}
                style={styles.targetImage}
                resizeMode="contain"
              />
            </View>

            {/* HINT BUTTON (อยู่ข้างมุมล่างขวาของรูป ไม่ทับช่องคำตอบ) */}
            <TouchableOpacity
              onPress={handleUseHint}
              style={styles.hintWrapper}
              activeOpacity={0.85}
            >
              <ImageBackground
                source={require("../../../assets/yellow-button.png")}
                style={styles.hintButtonBg}
                resizeMode="contain"
              >
                <Image
                  source={require("../../../assets/Light-On.png")}
                  style={styles.lightIcon}
                />
              </ImageBackground>

              {hintCount > 0 ? (
                <ImageBackground
                  source={require("../../../assets/background-hint-red.png")}
                  style={styles.redBadgeBg}
                  resizeMode="contain"
                >
                  <Text style={styles.redBadgeText}>{hintCount}</Text>
                </ImageBackground>
              ) : (
                <View style={styles.coinBadgeContainer}>
                  <View style={styles.smallCoinIcon} />
                  <Text style={styles.coinBadgeText}>{HINT_COST}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ANSWER SLOTS (ขึ้นแถวใหม่อัตโนมัติเมื่อคำยาว) */}
          <Animated.View
            style={[
              styles.answerSlotsContainer,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            {slotRows.map((row, r) => (
              <View key={r} style={styles.slotRow}>
                {row.map(({ item, index }) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.slotBox,
                      { width: layout.slotSize, height: layout.slotSize },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleRemoveLetter(index)}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        { fontSize: Math.round(layout.slotSize * 0.5) },
                      ]}
                    >
                      {item ? item.letter : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </Animated.View>

          {/* LETTER POOL (ขึ้นแถวใหม่อัตโนมัติ ขนาดปุ่มปรับตามหน้าจอ) */}
          <View style={styles.letterPoolContainer}>
            {shuffledPool.map((letter, index) => {
              const isUsed = usedIndices.includes(index);
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.poolButton,
                    { width: layout.btn, height: layout.btn },
                    isUsed && styles.poolButtonDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={isUsed}
                  onPress={() => handlePressPoolLetter(letter, index)}
                >
                  <Text
                    style={[
                      styles.poolText,
                      { fontSize: Math.round(layout.btn * 0.46) },
                      isUsed && styles.poolTextDisabled,
                    ]}
                  >
                    {letter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* NO COIN MODAL */}
        <Modal
          visible={showNoCoinModal}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => setShowNoCoinModal(false)}
        >
          <View style={styles.resultOverlay}>
            <View style={styles.noCoinCard}>
              <Text style={styles.noCoinTitle}>OOPS!</Text>
              <Text style={styles.noCoinDesc}>
                You don't have enough coins to use hint!
              </Text>
              <TouchableOpacity
                style={styles.actionButtonWrapper}
                activeOpacity={0.8}
                onPress={() => setShowNoCoinModal(false)}
              >
                <ImageBackground
                  source={require("../../../assets/green-button.png")}
                  style={styles.actionButtonBg}
                  resizeMode="contain"
                >
                  <Ionicons name="checkmark" size={28} color="#FFF" />
                </ImageBackground>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* RESULT MODAL */}
        <Modal
          visible={isLevelCompleted}
          transparent={true}
          animationType="none"
          statusBarTranslucent={true}
          onRequestClose={() => {}}
        >
          <Animated.View
            style={[styles.resultOverlay, { opacity: resultOpacity }]}
          >
            <ConfettiCannon
              count={200}
              origin={{ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 }}
              autoStart={true}
              fadeOut={true}
              fallSpeed={3000}
            />

            <Animated.View
              style={[
                styles.resultContentContainer,
                { transform: [{ scale: resultScale }] },
              ]}
            >
              <Image
                source={require("../../../assets/levelup.png")}
                style={styles.levelUpImage}
                resizeMode="contain"
              />

              {rewardShown > 0 && (
                <View style={styles.resultCoinRow}>
                  <Image
                    source={require("../../../assets/coin.png")}
                    style={styles.resultCoinImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.resultCoinText}>+{rewardShown}</Text>
                </View>
              )}

              <View style={styles.resultButtonRow}>
                {/* RETRY */}
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => resetLevelState()}
                >
                  <ImageBackground
                    source={require("../../../assets/sky-button.png")}
                    style={styles.actionButtonBg}
                    resizeMode="contain"
                  >
                    <Ionicons name="reload" size={26} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>

                {/* NEXT LEVEL */}
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => {
                    const currentLevelsList = spellingData[category] || [];
                    const currentIndex = currentLevelsList.findIndex(
                      (item) => item.id === levelData.id,
                    );
                    if (
                      currentIndex !== -1 &&
                      currentIndex + 1 <
                        Math.min(
                          LEVELS_PER_DIFFICULTY,
                          currentLevelsList.length,
                        )
                    ) {
                      const nextLevelData = currentLevelsList[currentIndex + 1];
                      navigation.replace("SpellingScreen", {
                        levelData: nextLevelData,
                        category: category,
                        levelIndex: currentIndex + 1,
                      });
                    } else {
                      navigation.goBack();
                    }
                  }}
                >
                  <ImageBackground
                    source={require("../../../assets/green-button.png")}
                    style={styles.actionButtonBg}
                    resizeMode="contain"
                  >
                    <Ionicons name="play" size={28} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>

                {/* HOME */}
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => {
                    setIsLevelCompleted(false);
                    navigation.navigate("HomeScreen");
                  }}
                >
                  <ImageBackground
                    source={require("../../../assets/sky-button.png")}
                    style={styles.actionButtonBg}
                    resizeMode="contain"
                  >
                    <Ionicons name="home" size={26} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: "100%", height: "100%" },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    width: "100%",
    marginBottom: 10,
    paddingTop: 10,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: "#FFF",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  titleContainer: { alignItems: "center", flex: 1 },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFEB3B",
    letterSpacing: 1.5,
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  coinContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 3,
  },
  coinText: {
    fontWeight: "900",
    fontSize: 13,
    color: "#1A2530",
    marginRight: 4,
  },
  coinBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFD700",
  },
  mainContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 12,
  },
  imageCardContainer: {
    position: "relative",
    marginBottom: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  imageCard: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    borderWidth: 4,
    borderColor: "#FFF",
  },
  targetImage: { width: "75%", height: "75%" },
  hintWrapper: {
    position: "absolute",
    bottom: 0,
    right: -34,
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  hintButtonBg: {
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  lightIcon: { width: 26, height: 26, resizeMode: "contain" },
  redBadgeBg: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  redBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  coinBadgeContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFF",
    elevation: 3,
  },
  smallCoinIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD700",
    marginRight: 2,
  },
  coinBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "900" },
  answerSlotsContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  slotRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: GAP,
  },
  slotBox: {
    backgroundColor: "#FFF9E6",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: GAP / 2,
    borderWidth: 2.5,
    borderColor: "#FFE082",
    elevation: 3,
  },
  slotText: { fontWeight: "900", color: "#1A2530" },
  letterPoolContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
  poolButton: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    margin: GAP / 2,
    elevation: 4,
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  poolButtonDisabled: {
    backgroundColor: "#CBD5E1",
    borderColor: "#94A3B8",
    elevation: 0,
  },
  poolText: { fontWeight: "900", color: "#1E293B" },
  poolTextDisabled: { color: "#94A3B8" },
  resultOverlay: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  resultContentContainer: {
    width: "85%",
    maxWidth: 380,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  levelUpImage: { width: 280, height: 155, marginBottom: 8 },
  resultCoinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 30,
    marginBottom: 18,
  },
  resultCoinImage: { width: 32, height: 32, marginRight: 8 },
  resultCoinText: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFD700",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  resultButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonWrapper: {
    marginHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonBg: {
    width: 68,
    height: 68,
    justifyContent: "center",
    alignItems: "center",
  },
  noCoinCard: {
    width: "75%",
    backgroundColor: "#FFF9E6",
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFE082",
    elevation: 10,
  },
  noCoinTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#E53935",
    marginBottom: 8,
    letterSpacing: 1,
  },
  noCoinDesc: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    textAlign: "center",
    marginBottom: 16,
  },
});

export default SpellingScreen;