import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import ConfettiCannon from "react-native-confetti-cannon";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { grammarPostTestData } from "../../../src/data/screens/PosttestData";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const GrammarPostTestScreen = ({ navigation }) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [score, setScore] = useState(0);
  const [pretestScore, setPretestScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const initGameQuestions = () => {
    const allData = grammarPostTestData || [];

    const getQuestionsByTense = (tenseName, count) => {
      const filtered = allData.filter((item) => item.tense === tenseName);
      const shuffled = [...filtered].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };

    const selectedBatch = [
      ...getQuestionsByTense("Present Simple", 2),
      ...getQuestionsByTense("Past Simple", 2),
      ...getQuestionsByTense("Future Simple", 2),
      ...getQuestionsByTense("Present Continuous", 2),
      ...getQuestionsByTense("Past Continuous", 2),
      ...getQuestionsByTense("Future Continuous", 2),
      ...getQuestionsByTense("Present Perfect", 2), // ปรับลดเหลือ 2 ข้อ
      ...getQuestionsByTense("Past Perfect", 2),
      ...getQuestionsByTense("Future Perfect", 2),
      ...getQuestionsByTense("Mixed Tense", 2), // ปรับลดเหลือ 2 ข้อ
    ];

    const finalBatch =
      selectedBatch.length > 0
        ? selectedBatch
        : [...allData].sort(() => 0.5 - Math.random()).slice(0, 20);
    const finalShuffledQuestions = finalBatch.sort(() => 0.5 - Math.random());

    setQuestions(finalShuffledQuestions);
    setCurrentIndex(0);
    setScore(0);
    setSelectedOption(null);
    setIsCorrect(null);
    setShowResult(false);
    setShowConfetti(false);
  };

  useEffect(() => {
    initGameQuestions();

    const fetchUserData = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user && !user.isAnonymous) {
          const db = getFirestore();
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const pScore =
              data.pretestScore ?? data.scores?.skillStats?.pretest ?? 0;
            setPretestScore(pScore);
          }
        } else {
          const raw = await AsyncStorage.getItem("@guest_game_scores");
          if (raw) setPretestScore(JSON.parse(raw).skillStats?.pretest || 0);
          if (storedProfile) {
            const guestData = JSON.parse(storedProfile);
            setPretestScore(
              guestData.pretestScore ||
                guestData.scores?.skillStats?.pretest ||
                0,
            );
          }
        }
      } catch (err) {
        console.error("Error fetching user pretest data:", err);
      }
    };
    fetchUserData();
  }, []);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];

  const coinsEarned = 30;

  const calculateLevel = (finalScore, total) => {
    const percentage = total > 0 ? (finalScore / total) * 100 : 0;
    if (percentage >= 80) return "Advanced";
    if (percentage >= 50) return "Intermediate";
    return "Beginner";
  };

  const userLevelResult = calculateLevel(score, totalQuestions);

  const resultScale = useRef(new Animated.Value(0.8)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const saveResult = async () => {
      if (showResult) {
        const confettiTimer = setTimeout(() => {
          setShowConfetti(true);
        }, 250);

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

        try {
          const auth = getAuth();
          let user = auth.currentUser;

          if (!user) {
            const userCredential = await signInAnonymously(auth);
            user = userCredential.user;
          }

          const nowTimestamp = new Date().toISOString();
          const newAttempt = {
            score: score,
            total: totalQuestions,
            level: userLevelResult,
            playedAt: nowTimestamp,
          };

          if (user && !user.isAnonymous) {
            const db = getFirestore();
            const userRef = doc(db, "users", user.uid);

            const docSnap = await getDoc(userRef);
            let existingData = docSnap.exists() ? docSnap.data() : {};
            let currentScores = existingData.scores ? existingData.scores : {};
            let currentCoins = existingData.coins ?? existingData.coin ?? 0;
            const updatedCoins = currentCoins + coinsEarned;

            if (!currentScores.skillStats) {
              currentScores.skillStats = {};
            }

            const existingAttempts =
              currentScores.skillStats.posttestAttempts || [];
            const updatedAttempts = [newAttempt, ...existingAttempts];

            currentScores.skillStats.posttest = `${score}/${totalQuestions}`;
            currentScores.skillStats.posttestAttempts = updatedAttempts;

            const allStandardTenses = [
              "Present Simple",
              "Past Simple",
              "Future Simple",
              "Present Continuous",
              "Past Continuous",
              "Future Continuous",
              "Present Perfect",
              "Past Perfect",
              "Future Perfect",
            ];

            const existingCompleted = existingData.completedTenses || [];
            const mergedCompletedTenses = Array.from(
              new Set([...existingCompleted, ...allStandardTenses]),
            );

            await setDoc(
              userRef,
              {
                coins: updatedCoins,
                coin: updatedCoins,
                completedTenses: mergedCompletedTenses,
                scores: currentScores,
                updatedAt: nowTimestamp,
              },
              { merge: true },
            );
          } else {
            // กรณีเล่นแบบ Guest
            const storedProfile = await AsyncStorage.getItem("@guest_profile");
            let guestData = storedProfile
              ? JSON.parse(storedProfile)
              : { coins: 0, scores: { skillStats: { posttestAttempts: [] } } };

            const currentCoins = guestData.coins ?? guestData.coin ?? 0;
            const updatedCoins = currentCoins + coinsEarned;

            if (!guestData.scores) guestData.scores = {};
            if (!guestData.scores.skillStats) guestData.scores.skillStats = {};

            const existingAttempts =
              guestData.scores.skillStats.posttestAttempts || [];
            const updatedAttempts = [newAttempt, ...existingAttempts];

            const allStandardTenses = [
              "Present Simple",
              "Past Simple",
              "Future Simple",
              "Present Continuous",
              "Past Continuous",
              "Future Continuous",
              "Present Perfect",
              "Past Perfect",
              "Future Perfect",
            ];

            guestData.coins = updatedCoins;
            guestData.coin = updatedCoins;
            guestData.completedTenses = Array.from(
              new Set([
                ...(guestData.completedTenses || []),
                ...allStandardTenses,
              ]),
            );
            guestData.scores.skillStats.posttest = `${score}/${totalQuestions}`;
            guestData.scores.skillStats.posttestAttempts = updatedAttempts;

            await AsyncStorage.setItem(
              "@guest_profile",
              JSON.stringify(guestData),
            );

            // บันทึกประวัติและสถิติ Post-Test ลงใน @guest_game_scores เพื่อให้หน้า Profile อ่านค่าได้ถูกต้อง
            const rawScores = await AsyncStorage.getItem("@guest_game_scores");
            const gameScores = rawScores
              ? JSON.parse(rawScores)
              : {
                  grammar: { Beginner: {}, Intermediate: {}, Advanced: {} },
                  crossword: {},
                  spelling: {},
                  battle: {},
                  skillStats: {},
                };

            gameScores.skillStats = {
              ...(gameScores.skillStats || {}),
              posttest: guestData.scores.skillStats.posttest,
              posttestAttempts: guestData.scores.skillStats.posttestAttempts,
            };

            await AsyncStorage.setItem(
              "@guest_game_scores",
              JSON.stringify(gameScores),
            );
          }
        } catch (error) {
          console.error("Error saving post-test results: ", error);
        }

        return () => clearTimeout(confettiTimer);
      }
    };
    saveResult();
  }, [showResult]);

  const handleSelectOption = (index) => {
    if (selectedOption !== null || !currentQuestion) return;

    setSelectedOption(index);
    const chosenOptionText = currentQuestion.options[index];
    const correct =
      chosenOptionText === currentQuestion.correctAnswer ||
      index === currentQuestion.correctAnswer;

    setIsCorrect(correct);
    if (correct) setScore((prev) => prev + 1);

    setTimeout(() => {
      if (currentIndex + 1 < totalQuestions) {
        setCurrentIndex((prev) => prev + 1);
        setSelectedOption(null);
        setIsCorrect(null);
      } else {
        setShowResult(true);
      }
    }, 700);
  };

  const resetGame = () => {
    initGameQuestions();
    resultScale.setValue(0.8);
    resultOpacity.setValue(0);
  };

  if (!currentQuestion) {
    return (
      <View style={[styles.container, styles.centerAlign]}>
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  const optionAccents = ["#00B2E3", "#27C306", "#F49E00", "#3B82F6"];
  const optionLetters = ["A", "B", "C", "D"];

  return (
    <View style={styles.container}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["top", "left", "right", "bottom"]}
      >
        <View style={styles.contentContainer}>
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={22} color="#2D3E50" />
            </TouchableOpacity>

            <View style={styles.topicBadgeContainer}>
              <Text style={styles.headerTopicTitle} numberOfLines={1}>
                POST-TEST
              </Text>
              <View style={styles.levelPill}>
                <Text style={styles.levelPillText}>ASSESSMENT</Text>
              </View>
            </View>

            <View style={{ width: 42 }} />
          </View>

          {/* PROGRESS BAR & QUESTION COUNT */}
          <View style={styles.progressSection}>
            <View style={styles.progressInfoRow}>
              <Text style={styles.questionCountLabel}>
                Question{" "}
                <Text style={{ color: "#00B2E3" }}>{currentIndex + 1}</Text> of{" "}
                {totalQuestions}
              </Text>
            </View>
            <View style={styles.progressWrapper}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* QUESTION SECTION */}
          <View style={styles.questionSection}>
            <Text style={styles.questionText}>{currentQuestion.question}</Text>
          </View>

          {/* OPTIONS CONTAINER */}
          <View style={styles.optionsContainer}>
            {currentQuestion.options.map((option, index) => {
              const isSelected = index === selectedOption;
              const isTheAnswer =
                option === currentQuestion.correctAnswer ||
                index === currentQuestion.correctAnswer;

              let optionStyle = styles.optionCardNormal;
              let textStyle = styles.optionTextNormal;
              let letterCircleStyle = [
                styles.letterCircle,
                {
                  backgroundColor: optionAccents[index % optionAccents.length],
                },
              ];
              let letterTextStyle = styles.letterTextWhite;
              let iconComponent = null;

              if (selectedOption !== null) {
                if (isSelected) {
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
                  } else {
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
                  }
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
                  key={index}
                  style={optionStyle}
                  onPress={() => handleSelectOption(index)}
                  disabled={selectedOption !== null}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeftContent}>
                    <View style={letterCircleStyle}>
                      <Text style={letterTextStyle}>
                        {optionLetters[index]}
                      </Text>
                    </View>
                    <Text style={textStyle}>{option}</Text>
                  </View>
                  {iconComponent}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* RESULT MODAL */}
        <Modal
          visible={showResult}
          transparent={true}
          animationType="none"
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
                source={require("../../../assets/levelup.png")}
                style={styles.levelUpImage}
                resizeMode="contain"
              />

              <Text style={styles.resultSkillLabel}>Assessment Result</Text>

              {/* Score & Pretest Score & Level Details Box */}
              <View style={styles.scoreCompareBox}>
                {totalQuestions > 0 && (score / totalQuestions) * 100 < 60 && (
                  <Text
                    style={[
                      styles.scoreRowLabel,
                      { textAlign: "center", marginBottom: 12 },
                    ]}
                  >
                    Almost there! Review the lessons once more, then try again
                    for an even better result.
                  </Text>
                )}
                <View style={styles.scoreRowItem}>
                  <Text style={styles.scoreRowLabel}>Post-Test Score:</Text>
                  <Text style={styles.bigScoreNum}>
                    {score} / {totalQuestions}
                  </Text>
                </View>
                <View style={styles.scoreRowItem}>
                  <Text style={styles.scoreRowLabel}>Pre-Test Score:</Text>
                  <Text style={[styles.bigScoreNum, { color: "#64748B" }]}>
                    {pretestScore}
                  </Text>
                </View>
                <View style={[styles.scoreRowItem, { borderBottomWidth: 0 }]}>
                  <Text style={styles.scoreRowLabel}>Your Level:</Text>
                  <Text style={[styles.bigScoreNum, { color: "#F59E00" }]}>
                    {userLevelResult}
                  </Text>
                </View>
              </View>

              <View style={styles.resultCoinRow}>
                <Image
                  source={require("../../../assets/coin.png")}
                  style={styles.resultCoinImage}
                  resizeMode="contain"
                />
                <Text style={styles.resultCoinText}>+{coinsEarned}</Text>
              </View>

              <View style={styles.resultButtonRow}>
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={resetGame}
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
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowResult(false);
                    navigation.navigate("HomeScreen", {
                      level: userLevelResult,
                      fromPosttest: true,
                    });
                  }}
                >
                  <ImageBackground
                    source={require("../../../assets/sky-button.png")}
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
  contentContainer: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 45,
    paddingBottom: 24,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: "#FFF",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  topicBadgeContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTopicTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  levelPill: {
    backgroundColor: "#D0F0FD",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 8,
  },
  levelPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0095C8",
    letterSpacing: 0.8,
  },

  progressSection: {
    marginBottom: 24,
    paddingHorizontal: 2,
  },
  progressInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  questionCountLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: 0.5,
  },
  progressWrapper: {
    height: 12,
    backgroundColor: "#D1EAF5",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#27C306",
    borderRadius: 6,
  },

  questionSection: {
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  questionText: {
    fontSize: 21,
    fontWeight: "900",
    color: "#1E293B",
    lineHeight: 32,
  },

  optionsContainer: {
    flex: 1,
    justifyContent: "flex-start",
    gap: 14,
  },

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
  letterTextWhite: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "900",
  },
  optionTextNormal: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    flex: 1,
  },
  optionTextWhite: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFF",
    flex: 1,
  },
  optionTextDisabled: {
    fontSize: 16,
    fontWeight: "800",
    color: "#94A3B8",
    flex: 1,
  },
  statusIcon: {
    marginLeft: 10,
  },

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
    paddingVertical: 22,
    paddingHorizontal: 16,
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
  levelUpImage: {
    width: 180,
    height: 90,
    marginBottom: 4,
  },
  resultSkillLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#8C7A6B",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  scoreCompareBox: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  scoreRowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  scoreRowLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  bigScoreNum: {
    fontSize: 16,
    fontWeight: "900",
    color: "#00B2E3",
  },
  resultCoinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "#FFE082",
  },
  resultCoinImage: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  resultCoinText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#D4AF37",
  },
  resultButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  actionButtonWrapper: {
    marginHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonBg: {
    width: 54,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default GrammarPostTestScreen;
