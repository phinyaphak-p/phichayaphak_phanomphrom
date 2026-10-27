import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ImageBackground,
  Image,
  Dimensions,
  PanResponder,
  Animated,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Line } from "react-native-svg";
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
import { crosswordData } from "../../../src/data/screens/crosswordData";
import { saveGameScore } from "./services/scoreService";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HINT_COST = 30;
const REWARD_COINS = 30;
const LEVELS_PER_DIFFICULTY = 3;

const CrosswordScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, 15);
  const bottomPadding = Math.max(insets.bottom, 20);

  const difficulty = route?.params?.difficulty || "Beginner";
  const rawLevelKey = route?.params?.levelKey || difficulty;
  const levelKey =
    rawLevelKey.charAt(0).toUpperCase() + rawLevelKey.slice(1).toLowerCase();
  const currentLevelIndex = route?.params?.levelIndex || 1;

  const difficultyLevels =
    crosswordData[difficulty] || crosswordData.Beginner || [];
  const [currentLevelIdx, setCurrentLevelIdx] = useState(currentLevelIndex - 1);
  const levelData = difficultyLevels[currentLevelIdx] ||
    difficultyLevels[0] || { words: [], letters: "" };

  const targetWords = Array.isArray(levelData?.words)
    ? levelData.words.map((item) => item?.word).filter(Boolean)
    : [];

  const totalWords = levelData?.wordsCount ?? targetWords.length;
  const lettersPool =
    typeof levelData?.letters === "string" ? levelData.letters.split("") : [];

  const [selectedIndices, setSelectedIndices] = useState([]);
  const [hintCount, setHintCount] = useState(2);

  const hintUsedThisRoundRef = useRef(0);
  const maxStreakRef = useRef(0);

  const [userCoins, setUserCoins] = useState(0);
  const [revealedLetters, setRevealedLetters] = useState({});
  const [isLevelCompleted, setIsLevelCompleted] = useState(false);
  const [showNoCoinModal, setShowNoCoinModal] = useState(false);

  const [currentStreak, setCurrentStreak] = useState(0);
  const [rewardShown, setRewardShown] = useState(0); // 🌟 เริ่มต้นเป็น 0 ป้องกันเลขแวบผิดจังหวะ

  const circlePositions = useRef([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const greatOpacity = useRef(new Animated.Value(0)).current;
  const greatScale = useRef(new Animated.Value(0.5)).current;

  const resultScale = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  const activeIndicesRef = useRef([]);
  const isCompletedRef = useRef(false);

  const maxCharsInRow =
    targetWords.length > 0 ? Math.max(...targetWords.map((w) => w.length)) : 1;
  const calculatedBoxSize = Math.floor((SCREEN_WIDTH * 0.78) / maxCharsInRow);
  const dynamicBoxSize = Math.min(Math.max(calculatedBoxSize, 20), 34);
  const dynamicFontSize = Math.round(dynamicBoxSize * 0.55);
  const dynamicMarginVertical = totalWords >= 7 ? 2 : 4;

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (user && !user.isAnonymous) {
      const db = getFirestore();
      const userRef = doc(db, "users", user.uid);
      const unsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setUserCoins(userData.coins ?? userData.coin ?? 0);
        }
      });
      return () => unsubscribe();
    } else {
      AsyncStorage.getItem("@guest_profile")
        .then((storedProfile) => {
          if (storedProfile) {
            const profile = JSON.parse(storedProfile);
            setUserCoins(profile.coins ?? profile.coin ?? 0);
          }
        })
        .catch((error) => console.error("Error loading guest coins:", error));
    }
  }, []);

  useEffect(() => {
    isCompletedRef.current = false;
    setIsLevelCompleted(false);
    setRevealedLetters({});
    hintUsedThisRoundRef.current = 0;
  }, [currentLevelIdx]);

  const blanketSize = 280;
  const circleRadius = 90;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isLevelCompleted,
      onStartShouldSetPanResponderCapture: () => !isLevelCompleted,
      onMoveShouldSetPanResponder: () => !isLevelCompleted,
      onMoveShouldSetPanResponderCapture: () => !isLevelCompleted,
      onPanResponderGrant: (evt) => {
        if (isLevelCompleted) return;
        activeIndicesRef.current = [];
        const { locationX, locationY } = evt.nativeEvent;
        findTouchedCircle(locationX, locationY);
      },
      onPanResponderMove: (evt) => {
        if (isLevelCompleted) return;
        const { locationX, locationY } = evt.nativeEvent;
        findTouchedCircle(locationX, locationY);
      },
      onPanResponderRelease: () => {
        if (isLevelCompleted) return;
        checkAndSubmitWord();
      },
    }),
  ).current;

  const findTouchedCircle = (x, y) => {
    circlePositions.current.forEach((pos, index) => {
      if (!pos) return;
      const distance = Math.sqrt(
        Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2),
      );
      if (distance < 45) {
        const currentList = activeIndicesRef.current;
        if (!currentList.includes(index)) {
          activeIndicesRef.current = [...currentList, index];
          setSelectedIndices([...activeIndicesRef.current]);
        }
      }
    });
  };

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
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

  const triggerGreatEffect = () => {
    greatOpacity.setValue(1);
    greatScale.setValue(0.3);
    Animated.parallel([
      Animated.spring(greatScale, {
        toValue: 1.5,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(greatOpacity, {
        toValue: 0,
        duration: 900,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const checkIfLevelCompleted = (newRevealed) => {
    if (isCompletedRef.current || isLevelCompleted) return;
    if (!targetWords || targetWords.length === 0) return;

    let allCompleted = true;
    for (let i = 0; i < targetWords.length; i++) {
      const word = targetWords[i];
      for (let j = 0; j < word.length; j++) {
        if (!newRevealed[i]?.[j]) {
          allCompleted = false;
          break;
        }
      }
      if (!allCompleted) break;
    }

    if (allCompleted) {
      isCompletedRef.current = true;
      setIsLevelCompleted(true);
      saveProgressToFirebase();

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
      }, 50);
    }
  };

  const checkAndSubmitWord = () => {
    if (isCompletedRef.current || isLevelCompleted) return;

    const formedWord = activeIndicesRef.current
      .map((i) => lettersPool[i])
      .join("");
    const matchedIndex = targetWords.findIndex((word) => word === formedWord);

    if (matchedIndex !== -1) {
      const nextStreak = currentStreak + 1;
      setCurrentStreak(nextStreak);
      maxStreakRef.current = Math.max(maxStreakRef.current, nextStreak);

      setRevealedLetters((prev) => {
        const updated = { ...prev };
        if (!updated[matchedIndex]) updated[matchedIndex] = {};
        targetWords[matchedIndex].split("").forEach((_, charIdx) => {
          updated[matchedIndex][charIdx] = true;
        });
        checkIfLevelCompleted(updated);
        return updated;
      });
      triggerGreatEffect();
    } else if (activeIndicesRef.current.length > 0) {
      setCurrentStreak(0);
      triggerShake();
    }

    activeIndicesRef.current = [];
    setSelectedIndices([]);
  };

  const applyHint = () => {
    hintUsedThisRoundRef.current += 1;

    let targetWordIdx = -1;
    let targetCharIdx = -1;

    for (let i = 0; i < targetWords.length; i++) {
      const word = targetWords[i];
      for (let j = 0; j < word.length; j++) {
        if (!revealedLetters[i]?.[j]) {
          targetWordIdx = i;
          targetCharIdx = j;
          break;
        }
      }
      if (targetWordIdx !== -1) break;
    }

    if (targetWordIdx === -1) return;

    setRevealedLetters((prev) => {
      const updated = { ...prev };
      if (!updated[targetWordIdx]) updated[targetWordIdx] = {};
      updated[targetWordIdx][targetCharIdx] = true;
      checkIfLevelCompleted(updated);
      return updated;
    });
    triggerGreatEffect();
  };

  const handleUseHint = async () => {
    if (isCompletedRef.current || isLevelCompleted) return;

    if (hintCount > 0) {
      setHintCount(hintCount - 1);
      applyHint();
      return;
    }

    if (userCoins >= HINT_COST) {
      try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (user && !user.isAnonymous) {
          const db = getFirestore();
          const userRef = doc(db, "users", user.uid);

          await setDoc(
            userRef,
            {
              coins: increment(-HINT_COST),
            },
            { merge: true },
          );

          setUserCoins((prev) => Math.max(0, prev - HINT_COST));
          applyHint();
        } else {
          const storedProfile = await AsyncStorage.getItem("@guest_profile");
          if (storedProfile) {
            let profile = JSON.parse(storedProfile);
            const currentCoins = profile.coins ?? 0;

            if (currentCoins >= HINT_COST) {
              const newCoins = currentCoins - HINT_COST;
              profile.coins = newCoins;
              await AsyncStorage.setItem(
                "@guest_profile",
                JSON.stringify(profile),
              );
              setUserCoins(newCoins);
              applyHint();
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

  const saveProgressToFirebase = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const nextLevelToUnlock = currentLevelIdx + 2;

      const formattedLevelKey =
        levelKey.charAt(0).toUpperCase() + levelKey.slice(1).toLowerCase();

      const hintsThisRound = hintUsedThisRoundRef.current;
      let accuracyVal = Math.max(0, 100 - hintsThisRound * 25);
      const isNoHintThisRound = hintsThisRound === 0 ? 1 : 0;
      let finalBestStreak = maxStreakRef.current > 0 ? maxStreakRef.current : 1;

      if (user && !user.isAnonymous) {
        const db = getFirestore();
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        let oldNoHint = 0;
        let oldHints = 0;
        let oldStreak = 0;
        let unlockedMap = {};
        let completedLevelsMap = {};

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const oldData =
            userData?.scores?.crossword?.[formattedLevelKey] || {};
          oldStreak = oldData.streak || 0;
          oldNoHint = oldData.noHint || 0;
          oldHints = oldData.hints || 0;
          unlockedMap = userData.unlockedCrosswordLevels || {};
          completedLevelsMap = userData.completedCrosswordLevels || {};
        }

        const levelIdentifier = `${formattedLevelKey}_level_${currentLevelIdx + 1}`;
        const isAlreadyCompleted = !!completedLevelsMap[levelIdentifier];
        const earnedCoins = isAlreadyCompleted ? 0 : REWARD_COINS;

        setRewardShown(earnedCoins);

        completedLevelsMap[levelIdentifier] = true;
        finalBestStreak = Math.max(finalBestStreak, oldStreak);

        const totalNoHint = oldNoHint + (isNoHintThisRound > 0 ? 1 : 0);
        const totalHints = oldHints + hintsThisRound;

        // 🌟 ให้ saveGameScore เป็นจุดเดียวที่จัดการบวกเหรียญผ่านระบบกลาง
        await saveGameScore(
          "crossword",
          formattedLevelKey,
          {
            accuracy: accuracyVal,
            noHint: totalNoHint,
            hints: totalHints,
            streak: finalBestStreak,
            roundHints: hintsThisRound,
            levelIndex: currentLevelIdx + 1,
          },
          null,
          earnedCoins,
        );

        const currentUnlockedForDiff = unlockedMap[formattedLevelKey] || 1;
        const finalUnlockedForDiff = Math.max(
          currentUnlockedForDiff,
          nextLevelToUnlock,
        );
        unlockedMap[formattedLevelKey] = finalUnlockedForDiff;

        // 🌟 อัปเดตเฉพาะสถานะด่านและเลเวลปลดล็อก (ไม่บวกเหรียญซ้ำซ้อนตรงนี้)
        const updatePayload = {
          unlockedCrosswordLevels: unlockedMap,
          completedCrosswordLevels: completedLevelsMap,
        };

        await setDoc(userRef, updatePayload, { merge: true });
      } else {
        const storedProfile = await AsyncStorage.getItem("@guest_profile");
        let profile = storedProfile
          ? JSON.parse(storedProfile)
          : {
              unlockedCrosswordLevels: {},
              completedLevelsMap: {},
              coins: 0,
            };

        let completedLevelsMap = profile.completedCrosswordLevels || {};
        const levelIdentifier = `${formattedLevelKey}_level_${currentLevelIdx + 1}`;
        const isAlreadyCompleted = !!completedLevelsMap[levelIdentifier];

        const earnedCoins = isAlreadyCompleted ? 0 : REWARD_COINS;
        setRewardShown(earnedCoins);

        completedLevelsMap[levelIdentifier] = true;
        profile.completedCrosswordLevels = completedLevelsMap;

        let unlockedMap = profile.unlockedCrosswordLevels || {};
        const currentUnlockedForDiff = unlockedMap[formattedLevelKey] || 1;
        const finalUnlockedForDiff = Math.max(
          currentUnlockedForDiff,
          nextLevelToUnlock,
        );
        unlockedMap[formattedLevelKey] = finalUnlockedForDiff;
        profile.unlockedCrosswordLevels = unlockedMap;

        // 🌟 อัปเดตโปรไฟล์ด่านลง AsyncStorage ก่อน
        await AsyncStorage.setItem("@guest_profile", JSON.stringify(profile));

        const storedScores = await AsyncStorage.getItem("@guest_game_scores");
        let guestScores = storedScores ? JSON.parse(storedScores) : {};
        let oldGuestData = guestScores?.crossword?.[formattedLevelKey] || {};
        let oldGuestHints = oldGuestData.hints || 0;
        let oldGuestNoHint = oldGuestData.noHint || 0;
        let oldGuestStreak = oldGuestData.streak || 0;

        const totalHintsGuest = oldGuestHints + hintsThisRound;
        const totalNoHintGuest =
          oldGuestNoHint + (isNoHintThisRound > 0 ? 1 : 0);
        const finalGuestStreak = Math.max(finalBestStreak, oldGuestStreak);

        // 🌟 ให้ saveGameScore จัดการบวกเหรียญให้ฝั่ง Guest
        await saveGameScore(
          "crossword",
          formattedLevelKey,
          {
            accuracy: accuracyVal,
            noHint: totalNoHintGuest,
            hints: totalHintsGuest,
            streak: finalGuestStreak,
            roundHints: hintsThisRound, // บอกว่ารอบนี้ใช้ hint กี่ครั้ง 
            levelIndex: currentLevelIdx + 1, // เลขด่านที่เล่น (1, 2, 3) ผลลัพธ์ เช่น "Level 2 · Hints used: 1" ถ้าไม่ส่ง roundhint และ levelindex ประวัติจะเก็บได้แค่ accuracy 
          },
          null,
          earnedCoins,
        );

        // 🌟 ดึงยอดเหรียญสดๆ ล่าสุดหลังจากบันทึกเสร็จมาแสดงผล
        const fresh = await AsyncStorage.getItem("@guest_profile");
        if (fresh) setUserCoins(JSON.parse(fresh).coins ?? 0);
      }
    } catch (error) {
      console.error("Error saving progress: ", error);
    }
  };

  const currentFormedLetters = selectedIndices.map((i) => lettersPool[i]);

  return (
    <ImageBackground
      source={require("../../../assets/background-crossword-v1.png")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView
        style={[
          styles.safeArea,
          { paddingTop: topPadding, paddingBottom: bottomPadding },
        ]}
        edges={["top", "left", "right"]}
      >
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
              {levelData.title
                ? levelData.title.toUpperCase()
                : `LEVEL ${currentLevelIdx + 1}`}
            </Text>
          </View>

          <View style={styles.coinContainer}>
            <Text style={styles.coinText}>{userCoins}</Text>
            <View style={styles.coinBadge} />
          </View>
        </View>

        <View style={styles.mainContent}>
          <Animated.View
            style={[
              styles.gridWrapperCard,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            <View style={styles.gridContainer}>
              {targetWords.map((word, wordIndex) => (
                <View
                  key={wordIndex}
                  style={[
                    styles.wordRow,
                    { marginVertical: dynamicMarginVertical },
                  ]}
                >
                  {Array.from({ length: word.length }).map((_, idx) => {
                    const isRevealed = revealedLetters[wordIndex]?.[idx];
                    const letterToShow = isRevealed ? word[idx] : "";
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.letterBox,
                          { width: dynamicBoxSize, height: dynamicBoxSize },
                          letterToShow
                            ? styles.letterBoxFilled
                            : styles.letterBoxEmpty,
                        ]}
                      >
                        <Text
                          style={[
                            styles.boxText,
                            { fontSize: dynamicFontSize },
                          ]}
                        >
                          {letterToShow}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </Animated.View>

          <View style={styles.currentTypingContainer}>
            {currentFormedLetters.length > 0 ? (
              <View style={styles.typedLetterBubbleRow}>
                {currentFormedLetters.map((letter, idx) => (
                  <View key={idx} style={styles.typedLetterCircle}>
                    <Text style={styles.typedLetterText}>{letter}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <Animated.View
            style={[
              styles.greatEffectContainer,
              { opacity: greatOpacity, transform: [{ scale: greatScale }] },
            ]}
            pointerEvents="none"
          >
            <Image
              source={require("../../../assets/Great.png")}
              style={styles.greatImage}
              resizeMode="contain"
            />
          </Animated.View>

          <View style={styles.picnicContainer}>
            <ImageBackground
              source={require("../../../assets/picnic-blanket.png")}
              style={[
                styles.picnicBlanket,
                { width: blanketSize, height: blanketSize },
              ]}
              resizeMode="contain"
            >
              <View
                style={styles.circleLettersWrapper}
                {...panResponder.panHandlers}
              >
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  {selectedIndices.map((startIndex, i) => {
                    if (i === 0) return null;
                    const prevIdx = selectedIndices[i - 1];
                    const prevCoord = circlePositions.current[prevIdx];
                    const currentCoord = circlePositions.current[startIndex];
                    if (!prevCoord || !currentCoord) return null;
                    return (
                      <Line
                        key={i}
                        x1={prevCoord.x}
                        y1={prevCoord.y}
                        x2={currentCoord.x}
                        y2={currentCoord.y}
                        stroke="rgba(255, 215, 0, 0.9)"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </Svg>

                {lettersPool.map((letter, index) => {
                  const isSelected = selectedIndices.includes(index);
                  const total = lettersPool.length;
                  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
                  const centerX =
                    blanketSize / 2 + Math.cos(angle) * circleRadius;
                  const centerY =
                    blanketSize / 2 + Math.sin(angle) * circleRadius;
                  circlePositions.current[index] = { x: centerX, y: centerY };

                  const btnSize = 64;
                  const halfBtn = btnSize / 2;

                  return (
                    <View
                      key={index}
                      style={[
                        styles.circleButton,
                        {
                          width: btnSize,
                          height: btnSize,
                          borderRadius: halfBtn,
                          left: centerX - halfBtn,
                          top: centerY - halfBtn,
                        },
                        isSelected && styles.circleSelected,
                      ]}
                      pointerEvents="none"
                    >
                      <Text
                        style={[
                          styles.circleText,
                          isSelected && styles.circleTextSelected,
                        ]}
                      >
                        {letter}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ImageBackground>

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
        </View>

        {showNoCoinModal && (
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
        )}

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
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => {
                    isCompletedRef.current = false;
                    setRevealedLetters({});
                    setIsLevelCompleted(false);
                    hintUsedThisRoundRef.current = 0;
                    setCurrentStreak(0);
                    maxStreakRef.current = 0;
                  }}
                >
                  <ImageBackground
                    source={require("../../../assets/sky-button.png")}
                    style={styles.actionButtonBg}
                    resizeMode="contain"
                  >
                    <Ionicons name="reload" size={26} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => {
                    setIsLevelCompleted(false);
                    hintUsedThisRoundRef.current = 0;
                    const nextLevelIndex = currentLevelIdx + 2;

                    if (
                      nextLevelIndex <=
                      Math.min(LEVELS_PER_DIFFICULTY, difficultyLevels.length)
                    ) {
                      const nextItem = difficultyLevels[nextLevelIndex - 1];
                      navigation.replace("CrosswordScreen", {
                        levelData: nextItem,
                        difficulty: difficulty,
                        levelIndex: nextLevelIndex,
                        levelKey: levelKey,
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

                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => {
                    setIsLevelCompleted(false);
                    hintUsedThisRoundRef.current = 0;
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
  safeArea: { flex: 1, justifyContent: "flex-start" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    width: "100%",
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#FFF",
    borderRadius: 12,
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
    fontSize: 14,
    color: "#1A2530",
    marginRight: 6,
  },
  coinBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFD700",
  },
  mainContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 10,
  },
  gridWrapperCard: {
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 24,
    width: "92%",
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: 6,
  },
  gridContainer: { alignItems: "center", width: "100%" },
  wordRow: { flexDirection: "row", justifyContent: "center" },
  letterBox: {
    marginHorizontal: 3,
    borderRadius: 10,
    backgroundColor: "#FFF9E6",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  letterBoxEmpty: { backgroundColor: "#FFF9E6" },
  letterBoxFilled: { backgroundColor: "#FFF9E6" },
  boxText: { fontWeight: "900", color: "#1A2530" },
  currentTypingContainer: {
    height: 45,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 6,
  },
  typedLetterBubbleRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  typedLetterCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF9E6",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: "#FFE082",
  },
  typedLetterText: { fontSize: 20, fontWeight: "900", color: "#1A2530" },
  greatEffectContainer: {
    position: "absolute",
    top: "24%",
    alignSelf: "center",
    zIndex: 99,
    justifyContent: "center",
    alignItems: "center",
  },
  greatImage: { width: 340, height: 140 },
  picnicContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 5,
  },
  picnicBlanket: { justifyContent: "center", alignItems: "center" },
  circleLettersWrapper: { width: "100%", height: "100%", position: "relative" },
  circleButton: {
    position: "absolute",
    backgroundColor: "#FFF9E6",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    borderWidth: 2.5,
    borderColor: "#FFF",
  },
  circleSelected: { backgroundColor: "#FFC107", borderColor: "#FFA000" },
  circleText: { fontSize: 24, fontWeight: "900", color: "#1A2530" },
  circleTextSelected: { color: "#FFF" },
  hintWrapper: {
    position: "absolute",
    right: 28,
    bottom: 5,
    width: 58,
    height: 58,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  hintButtonBg: {
    width: 54,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
  },
  lightIcon: { width: 22, height: 22, resizeMode: "contain" },
  redBadgeBg: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  redBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "bold" },
  coinBadgeContainer: {
    position: "absolute",
    bottom: -2,
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
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
  coinBadgeText: { color: "#FFF", fontSize: 8, fontWeight: "900" },
  resultOverlay: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  resultContentContainer: {
    width: "85%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  levelUpImage: { width: 320, height: 180, marginBottom: 10 },
  resultCoinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 30,
    marginBottom: 25,
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
    width: "100%",
  },
  actionButtonWrapper: {
    marginHorizontal: 10,
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
    width: "80%",
    backgroundColor: "#FFF9E6",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFE082",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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

export default CrosswordScreen;
