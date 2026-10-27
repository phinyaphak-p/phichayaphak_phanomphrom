import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ImageBackground,
  Dimensions,
  Modal,
  Animated,
  Alert,
  BackHandler,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import ConfettiCannon from "react-native-confetti-cannon";
import { getAuth } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  onSnapshot,
  query,
  where,
  limit,
  getDocs,
  runTransaction,
  deleteDoc,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { BATTLE_QUESTION_BANK } from "./battleData";
import { saveGameScore } from "./services/scoreService";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const AVATAR_LIST = [
  { id: "1", source: require("../../../assets/avatar-1.png") },
  { id: "2", source: require("../../../assets/avatar-2.png") },
  { id: "3", source: require("../../../assets/avatar-3.png") },
  { id: "4", source: require("../../../assets/avatar-4.png") },
  { id: "5", source: require("../../../assets/avatar-5.png") },
  { id: "6", source: require("../../../assets/avatar-6.png") },
];

const QUESTION_TIME = 15;
const HEARTBEAT_MS = 10000;
const START_GRACE_MS = 5000;
const OPPONENT_TIMEOUT_MS = 25000;
const QUESTIONS_PER_MATCH = 10;

const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 100;
const MAX_POINTS = QUESTIONS_PER_MATCH * (BASE_POINTS + MAX_SPEED_BONUS);
const COIN_REWARD = { win: 60, tie: 30, lose: 10 }; // ปรับบาลานซ์ตามต้องการ

const BattleGameScreen = ({ route, navigation }) => {
  const battleId = route?.params?.battleId;
  const auth = getAuth();
  const firestoreDb = getFirestore();
  const myId = auth.currentUser?.uid;
  const battleRef = useMemo(
    () => (battleId ? doc(db, "battles", battleId) : null),
    [battleId],
  );

  const getAvatarSource = (avatarId) => {
    const found = AVATAR_LIST.find((item) => item.id === String(avatarId));
    return found ? found.source : AVATAR_LIST[0].source;
  };

  const [battle, setBattle] = useState(null);
  const [battleQuestions, setBattleQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [points, setPoints] = useState(0);
  const [lastGain, setLastGain] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [timer, setTimer] = useState(QUESTION_TIME);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [iAmDone, setIAmDone] = useState(false);
  const [result, setResult] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [roundMaxStreak, setRoundMaxStreak] = useState(0);
  const [now, setNow] = useState(Date.now());

  const lockRef = useRef(false);
  const finishedRef = useRef(false);
  const leaveRef = useRef(null);
  const resultScale = useRef(new Animated.Value(0.8)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  const playing = !iAmDone && !result;

  const oppId = battle
    ? battle.hostId === myId
      ? battle.guestId
      : battle.hostId
    : null;
  const opponentData = (oppId && battle?.players?.[oppId]) || {
    name: "Opponent",
    avatarId: "1",
    score: 0,
    points: 0,
  };
  const opponentPoints = opponentData.points || 0;
  const opponentScore = opponentData.score || 0;
  const myAvatarId = battle?.players?.[myId]?.avatarId || "1";

  const currentQ = battleQuestions[currentIndex];

  // ฟังห้องแข่งแบบ Real-time
  useEffect(() => {
    if (!battleRef || !myId) {
      navigation.navigate("BattleScreen");
      return;
    }
    const unsub = onSnapshot(
      battleRef,
      (snap) => {
        if (!snap.exists()) {
          if (!finishedRef.current) {
            Alert.alert(
              "Match cancelled",
              "This match is no longer available.",
            );
            navigation.navigate("BattleScreen");
          }
          return;
        }
        setBattle(snap.data());
      },
      (err) => console.error("Battle listener error:", err),
    );
    return unsub;
  }, [battleId]);

  // ใช้ชุดโจทย์เดียวกับคู่แข่งจากห้อง
  useEffect(() => {
    if (battle?.questionIds && battleQuestions.length === 0) {
      setBattleQuestions(
        battle.questionIds.map((i) => BATTLE_QUESTION_BANK[i]).filter(Boolean),
      );
    }
  }, [battle]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setSecondsElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);

  // Heartbeat: อัปเดตสถานะว่ายังอยู่ในเกม
  useEffect(() => {
    if (!battleRef || !myId || !playing) return;
    const beat = () =>
      updateDoc(battleRef, { [`players.${myId}.lastSeen`]: Date.now() }).catch(
        () => {},
      );
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [battleId, playing]);

  // เวลาต่อข้อ
  useEffect(() => {
    if (!playing || !currentQ) return;
    if (timer <= 0) {
      handleAnswer(null);
      return;
    }
    const t = setInterval(() => setTimer((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timer, playing, currentQ]);

  const handleAnswer = (optionKey) => {
    if (lockRef.current || !currentQ || !playing) return;
    lockRef.current = true;
    setSelectedOption(optionKey ?? "-");

    const correct = optionKey === currentQ.answer;
    const gained = correct
      ? BASE_POINTS +
        Math.round((Math.max(timer, 0) / QUESTION_TIME) * MAX_SPEED_BONUS)
      : 0;
    const newScore = correct ? score + 1 : score;
    const newPoints = points + gained;
    const nextStreak = correct ? currentStreak + 1 : 0;
    const isLast = currentIndex >= battleQuestions.length - 1;

    setScore(newScore);
    setPoints(newPoints);
    setLastGain(gained);
    setAnswered((p) => p + 1);
    setCurrentStreak(nextStreak);
    setRoundMaxStreak((p) => Math.max(p, nextStreak));

    updateDoc(battleRef, {
      [`players.${myId}.score`]: newScore,
      [`players.${myId}.points`]: newPoints,
      [`players.${myId}.answered`]: currentIndex + 1,
      [`players.${myId}.done`]: isLast,
      [`players.${myId}.lastSeen`]: Date.now(),
    }).catch((err) => console.error("Error syncing answer:", err));

    setTimeout(() => {
      if (isLast) {
        setIAmDone(true);
      } else {
        setCurrentIndex((p) => p + 1);
        setSelectedOption(null);
        setLastGain(0);
        setTimer(QUESTION_TIME);
        lockRef.current = false;
      }
    }, 700);
  };

  const saveBattleResult = async ({
    outcome,
    correct,
    answeredCount,
    maxStreak,
    timeSpent,
    coins,
    points,
    oppName = "",
  }) => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      const data = snap.exists() ? snap.data() : {};
      const old = data?.scores?.battle?.general || data?.scores?.battle || {};

      const accuracy = Math.round((correct / Math.max(1, answeredCount)) * 100);
      const avgTime = `${Math.round(timeSpent / Math.max(1, answeredCount))}s`;

      const attempt = {
        outcome,
        score: correct,
        total: QUESTIONS_PER_MATCH,
        points,
        accuracy,
        avgTime,
        opponent: oppName,
        playedAt: new Date().toISOString(),
      };

      const general = {
        accuracy,
        wins: (Number(old.wins) || 0) + (outcome === "win" ? 1 : 0),
        losses: (Number(old.losses) || 0) + (outcome === "lose" ? 1 : 0),
        bestStreak: Math.max(Number(old.bestStreak) || 0, maxStreak),
        bestPoints: Math.max(Number(old.bestPoints) || 0, points),
        totalPoints: increment(points),
        avgTime,
        attempts: [
          attempt,
          ...(Array.isArray(old.attempts) ? old.attempts : []),
        ].slice(0, 20),
      };

      const payload = { scores: { battle: { general } } };
      if (coins > 0) payload.coins = increment(coins);
      await setDoc(userRef, payload, { merge: true });
    } catch (error) {
      console.error("Error saving battle result:", error);
    }
  };

  const finishBattle = (outcome, reason = "") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const coins = reason ? COIN_REWARD.lose : COIN_REWARD[outcome] || 0;
    setIAmDone(true);
    setResult({ outcome, reason, coins });
    saveBattleResult({
      outcome,
      correct: score,
      answeredCount: answered,
      maxStreak: roundMaxStreak,
      timeSpent: secondsElapsed,
      coins,
      points,
      oppName: opponentData.name,
    });
  };

  const oppLeft =
    !!battle &&
    !!oppId &&
    !opponentData.done &&
    (opponentData.left ||
      (now - (battle.startedAt || 0) > START_GRACE_MS &&
        now - (opponentData.lastSeen || 0) > OPPONENT_TIMEOUT_MS));

  useEffect(() => {
    if (!battle || !oppId || finishedRef.current) return;
    if (oppLeft) {
      finishBattle("win", "Your opponent left the match.");
    } else if (iAmDone && opponentData.done) {
      finishBattle(
        points > opponentPoints
          ? "win"
          : points < opponentPoints
            ? "lose"
            : "tie",
      );
    }
  }, [battle, iAmDone, now]);

  const handleLeave = () => {
    if (finishedRef.current) {
      navigation.navigate("BattleScreen");
      return;
    }
    Alert.alert("Leave match?", "If you leave now, you will lose this match.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          finishedRef.current = true;
          try {
            await updateDoc(battleRef, { [`players.${myId}.left`]: true });
          } catch (e) {}
          await saveBattleResult({
            outcome: "lose",
            correct: score,
            answeredCount: answered,
            maxStreak: roundMaxStreak,
            timeSpent: secondsElapsed,
            coins: 0,
            points,
            oppName: opponentData.name,
          });
          navigation.navigate("BattleScreen");
        },
      },
    ]);
  };
  leaveRef.current = handleLeave;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!result) return;
    const confettiTimer = setTimeout(() => {
      if (result.outcome === "win") setShowConfetti(true);
    }, 250);
    resultScale.setValue(0.8);
    resultOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(resultOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(resultScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
    return () => clearTimeout(confettiTimer);
  }, [result]);

  if (!currentQ) return null;

  const optionAccents = ["#00B2E3", "#27C306", "#F49E00", "#3B82F6"];
  const optionLetters = ["A", "B", "C", "D"];

  return (
    <View style={styles.container}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["top", "left", "right", "bottom"]}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleLeave} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#2D3E50" />
          </TouchableOpacity>

          <View style={styles.gameTitleBadge}>
            <Text style={styles.headerTitle}>BATTLE ARENA</Text>
          </View>

          <View style={styles.timerBox}>
            <Ionicons name="time-outline" size={14} color="#D97706" />
            <Text style={styles.timerText}>{timer}s</Text>
          </View>
        </View>

        {/* Real-time Players Progress Track */}
        <View style={styles.progressTrackCard}>
          <View style={styles.playerProgressRow}>
            <View style={styles.avatarMini}>
              <Image
                source={getAvatarSource(myAvatarId)}
                style={styles.miniAvatarImg}
              />
            </View>
            <View style={styles.trackBarBg}>
              <View
                style={[
                  styles.trackBarFillYou,
                  { width: `${Math.min(100, (points / MAX_POINTS) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.trackScoreText}>{points}</Text>
          </View>

          <View style={styles.playerProgressRow}>
            <View style={[styles.avatarMini, { backgroundColor: "#FEE2E2" }]}>
              <Image
                source={getAvatarSource(opponentData.avatarId)}
                style={styles.miniAvatarImg}
              />
            </View>
            <View style={styles.trackBarBg}>
              <View
                style={[
                  styles.trackBarFillOpp,
                  {
                    width: `${Math.min(100, (opponentPoints / MAX_POINTS) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.trackScoreText, { color: "#EF4444" }]}>
              {opponentPoints}
            </Text>
          </View>
        </View>

        {/* Main Content: Question & Options */}
        <View style={styles.contentContainer}>
          <View style={styles.questionSection}>
            <Text style={styles.questionCountLabel}>
              Question{" "}
              <Text style={{ color: "#00B2E3" }}>{currentIndex + 1}</Text> of{" "}
              {battleQuestions.length}
            </Text>
            <Text
              style={[
                styles.gainText,
                selectedOption === null
                  ? { color: "#94A3B8" }
                  : { color: lastGain > 0 ? "#16A34A" : "#EF4444" },
              ]}
            >
              {selectedOption === null
                ? `Answer fast: up to +${MAX_SPEED_BONUS} bonus`
                : lastGain > 0
                  ? `+${lastGain}  (speed bonus +${lastGain - BASE_POINTS})`
                  : "+0"}
            </Text>
            <Text style={styles.questionText}>{currentQ.question}</Text>
          </View>

          <View style={styles.optionsContainer}>
            {["A", "B", "C", "D"].map((letter, idx) => {
              const optionText = currentQ.options[idx];
              const isSelected = selectedOption === letter;
              const isTheAnswer = letter === currentQ.answer;

              let optionStyle = styles.optionCardNormal;
              let textStyle = styles.optionTextNormal;
              let letterCircleStyle = [
                styles.letterCircle,
                { backgroundColor: optionAccents[idx % optionAccents.length] },
              ];
              let letterTextStyle = styles.letterTextWhite;
              let iconComponent = null;

              if (selectedOption !== null) {
                if (isTheAnswer) {
                  optionStyle = styles.optionCardGreen;
                  textStyle = styles.optionTextWhite;
                  letterCircleStyle = [
                    styles.letterCircle,
                    { backgroundColor: "rgba(255, 255, 255, 0.25)" },
                  ];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                  iconComponent = (
                    <Ionicons
                      name="checkmark-circle"
                      size={26}
                      color="#FFF"
                      style={styles.statusIcon}
                    />
                  );
                } else if (isSelected && !isTheAnswer) {
                  optionStyle = styles.optionCardRed;
                  textStyle = styles.optionTextWhite;
                  letterCircleStyle = [
                    styles.letterCircle,
                    { backgroundColor: "rgba(255, 255, 255, 0.25)" },
                  ];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                  iconComponent = (
                    <Ionicons
                      name="close-circle"
                      size={26}
                      color="#FFF"
                      style={styles.statusIcon}
                    />
                  );
                } else {
                  optionStyle = styles.optionCardDisabled;
                  textStyle = styles.optionTextDisabled;
                  letterCircleStyle = [
                    styles.letterCircle,
                    { backgroundColor: "#CBD5E1" },
                  ];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                }
              }

              return (
                <TouchableOpacity
                  key={letter}
                  style={optionStyle}
                  onPress={() => handleAnswer(letter)}
                  disabled={selectedOption !== null}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeftContent}>
                    <View style={letterCircleStyle}>
                      <Text style={letterTextStyle}>{optionLetters[idx]}</Text>
                    </View>
                    <Text style={textStyle}>{optionText}</Text>
                  </View>
                  {iconComponent}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Modal: หน้ารอคู่แข่งเล่นเสร็จ (อัปเดตแสดงคะแนนแบบ pts) */}
        <Modal
          visible={iAmDone && !result}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={styles.resultOverlay}>
            <View style={styles.resultCardContainer}>
              <Text style={styles.resultSkillLabel}>Waiting for opponent</Text>
              <Text style={styles.resultSkillValue}>{points} pts</Text>
              <Text style={styles.resultScoreText}>
                {opponentData.name}: {opponentPoints} pts
              </Text>
            </View>
          </View>
        </Modal>

        {/* Result Modal ผลลัพธ์ */}
        <Modal
          visible={!!result}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => {}}
        >
          <Animated.View
            style={[styles.resultOverlay, { opacity: resultOpacity }]}
          >
            {showConfetti && (
              <ConfettiCannon
                count={200}
                origin={{ x: SCREEN_WIDTH / 2, y: 0 }}
                autoStart={true}
                fadeOut={true}
                fallSpeed={3000}
              />
            )}

            <Animated.View
              style={[
                styles.resultCardContainer,
                { transform: [{ scale: resultScale }] },
              ]}
            >
              <Image
                source={require("../../../assets/star_result.png")}
                style={styles.starIcon}
                resizeMode="contain"
              />

              <Text style={styles.resultSkillLabel}>Match Result</Text>

              <Text style={styles.resultSkillValue}>
                {result?.outcome === "win"
                  ? "YOU WIN"
                  : result?.outcome === "tie"
                    ? "TIE GAME"
                    : "YOU LOSE"}
              </Text>

              {/* Score Compare Box (อัปเดตแสดง Points และสีฝั่งตรงข้ามเป็น #EF4444) */}
              <View style={styles.scoreCompareBox}>
                <View style={styles.scoreCol}>
                  <Text style={styles.bigScoreNum}>{points}</Text>
                  <Text style={styles.scoreColLabel}>Your Points</Text>
                </View>
                <View style={styles.scoreDivider} />
                <View style={styles.scoreCol}>
                  <Text style={[styles.bigScoreNum, { color: '#EF4444' }]}>
                    {opponentPoints}
                  </Text>
                  <Text style={styles.scoreColLabel} numberOfLines={1}>
                    {opponentData.name}
                  </Text>
                </View>
              </View>

              <Text style={styles.resultScoreText}>
                Correct: {score}/{QUESTIONS_PER_MATCH} | Time:{" "}
                {Math.floor(secondsElapsed / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(secondsElapsed % 60).toString().padStart(2, "0")} | Coins: +
                {result?.coins ?? 0}
              </Text>
              {!!result?.reason && (
                <Text style={styles.resultScoreText}>{result.reason}</Text>
              )}

              <View style={styles.resultButtonRow}>
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate("BattleScreen")}
                >
                  <ImageBackground
                    source={require("../../../assets/sky-button.png")}
                    style={styles.actionButtonBg}
                    resizeMode="contain"
                  >
                    <Ionicons name="reload" size={24} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.85}
                  onPress={() => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: "HomeScreen" }],
                    });
                  }}
                >
                  <ImageBackground
                    source={require("../../../assets/green-button.png")}
                    style={styles.actionButtonBg}
                    resizeMode="contain"
                  >
                    <Ionicons name="home" size={24} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF8FF" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 12,
    marginBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#FFF",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gameTitleBadge: {
    backgroundColor: "#FFF",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#2D3E50",
    letterSpacing: 1,
  },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    elevation: 2,
  },
  timerText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#D97706",
    marginLeft: 4,
  },

  progressTrackCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 22,
    marginBottom: 16,
    padding: 12,
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  playerProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  avatarMini: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#93C5FD",
  },
  miniAvatarImg: { width: "100%", height: "100%", resizeMode: "cover" },
  trackBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: "#E2E8F0",
    borderRadius: 5,
    overflow: "hidden",
    marginRight: 10,
  },
  trackBarFillYou: {
    height: "100%",
    backgroundColor: "#00B2E3",
    borderRadius: 5,
  },
  trackBarFillOpp: {
    height: "100%",
    backgroundColor: "#EF4444",
    borderRadius: 5,
  },
  trackScoreText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#00B2E3",
    width: 52,
    textAlign: "right",
  },

  contentContainer: { flex: 1, paddingHorizontal: 22, paddingBottom: 24 },

  questionSection: { marginBottom: 24, paddingHorizontal: 4 },
  questionCountLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  gainText: { fontSize: 14, fontWeight: "900", marginBottom: 6 },
  questionText: {
    fontSize: 21,
    fontWeight: "900",
    color: "#1E293B",
    lineHeight: 32,
  },

  optionsContainer: { flex: 1, justifyContent: "flex-start", gap: 14 },
  optionCardNormal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: "#F1F5F9",
  },
  optionCardGreen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#27C306",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    elevation: 5,
  },
  optionCardRed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EF4444",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    elevation: 5,
  },
  optionCardDisabled: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    opacity: 0.5,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  optionLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  letterCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  letterTextWhite: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  optionTextNormal: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    flex: 1,
  },
  optionTextWhite: { fontSize: 16, fontWeight: "800", color: "#FFF", flex: 1 },
  optionTextDisabled: {
    fontSize: 16,
    fontWeight: "800",
    color: "#94A3B8",
    flex: 1,
  },
  statusIcon: { marginLeft: 10 },

  resultOverlay: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  resultCardContainer: {
    width: "88%",
    maxWidth: 380,
    backgroundColor: "#FFF9E6",
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFE082",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  starIcon: { width: 70, height: 70, marginBottom: 8 },
  resultSkillLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8C7A6B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultSkillValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1E293B",
    marginVertical: 4,
    textAlign: "center",
  },

  scoreCompareBox: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingVertical: 10,
    marginVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  scoreCol: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  bigScoreNum: { fontSize: 24, fontWeight: "900", color: "#00B2E3" },
  scoreColLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8C7A6B",
    marginTop: 2,
  },
  scoreDivider: { width: 1, height: "70%", backgroundColor: "#FFE082" },

  resultScoreText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#D4AF37",
    marginBottom: 8,
    textAlign: "center",
  },

  resultButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: 10,
  },
  actionButtonWrapper: {
    marginHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonBg: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default BattleGameScreen;