import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Dimensions,
  Image,
  ImageBackground,
  Modal,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ConfettiCannon from "react-native-confetti-cannon";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { db } from "../../../firebaseConfig";

import {
  doc,
  setDoc,
  collection,
  getDocs,
  arrayUnion,
  getDoc,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";
import { saveGameScore } from "./services/scoreService";

const { width } = Dimensions.get("window");
const REWARD_COINS = 30; // 30 เหรียญรางวัล

export default function GrammarGameplayScreen({ navigation, route }) {
  // =========================================================
  // GAME DATA
  // =========================================================

  const { topic, level } = route.params || {};
  const formattedLevel = level ? level.trim().toLowerCase() : "beginner";
  const normalizedTopic = topic ? topic.trim() : "Present Simple";

  const [loading, setLoading] = useState(true);

  const [allQuestions, setAllQuestions] = useState([]);
  const [displayQuestions, setDisplayQuestions] = useState([]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [score, setScore] = useState(0);

  const [selectedOption, setSelectedOption] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);

  const [showExplanation, setShowExplanation] = useState(false);

  // Result screen
  const [showResult, setShowResult] = useState(false);

  // Timer
  const [seconds, setSeconds] = useState(0);

  // Streak
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreakInRound, setMaxStreakInRound] = useState(0);

  const TOTAL_QUESTIONS = 10;
  const coinsEarned = REWARD_COINS;

  // =========================================================
  // ANIMATION
  // =========================================================

  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const resultScale = useRef(new Animated.Value(0.8)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // =========================================================
  // SHUFFLE QUESTIONS
  // =========================================================

  const shuffleArray = (array) => {
    return [...array].sort(() => 0.5 - Math.random());
  };

  // =========================================================
  // LOAD QUESTIONS FROM FIREBASE (ปรับปรุงระบบดึงข้อมูลให้แม่นยำและครบถ้วน)
  // =========================================================

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "grammar_questions"));
        
        let data = querySnapshot.docs.map((docSnap) => {
          const docData = docSnap.data();
          
          const textFields = Object.keys(docData).filter((key) => {
            const val = docData[key];
            return (
              typeof val === "string" &&
              key !== "id" &&
              key !== "topic" &&
              key !== "level" &&
              key !== "correctAnswer" &&
              key !== "correct" &&
              key !== "explanation" &&
              !Array.isArray(val)
            );
          });

          textFields.sort((a, b) => docData[b].length - docData[a].length);

          const resolvedQuestionText = textFields.length > 0 
            ? docData[textFields[0]] 
            : (docData.question || docData.questions || docData.sentence || docData.text || docData.prompt || docData.title || docData.grammar || "No question text");

          return {
            id: docSnap.id,
            ...docData,
            questionText: resolvedQuestionText,
          };
        });

        const targetLevelClean = formattedLevel.replace(/[-_]/g, " ").trim();
        const targetTopicClean = normalizedTopic.toLowerCase().replace(/[-_]/g, " ").trim();

        // 🌟 กรองข้อมูลแบบยืดหยุ่นสูง เพื่อให้ดึงข้อสอบของ Tense นั้นๆ มาได้ครบถ้วน
        let filteredData = data.filter((item) => {
          const itemLevel = item.level ? String(item.level).toLowerCase().replace(/[-_]/g, " ").trim() : "";
          const itemTopic = item.topic ? String(item.topic).toLowerCase().replace(/[-_]/g, " ").trim() : "";

          const isTopicMatch = itemTopic === targetTopicClean || itemTopic.includes(targetTopicClean) || targetTopicClean.includes(itemTopic);
          const isLevelMatch = itemLevel === targetLevelClean || itemLevel.includes(targetLevelClean) || targetLevelClean.includes(itemLevel);

          // เน้นเช็คหัวข้อ Topic เป็นหลักก่อน เพื่อให้ดึงข้อสอบ Tense นั้นมาได้ชัวร์
          return isTopicMatch;
        });

        // ถ้ากรองแล้วยังได้น้อยกว่า TOTAL_QUESTIONS ให้ดึงข้อมูลทั้งหมดมาสุ่มสำรองเพื่อไม่ให้ติดปัญหาข้อสอบไม่พอ
        let finalQuestions = filteredData.length >= TOTAL_QUESTIONS ? filteredData : (filteredData.length > 0 ? filteredData : data);

        setAllQuestions(finalQuestions);
        
        const shuffledAndSliced = shuffleArray(finalQuestions).slice(0, TOTAL_QUESTIONS);
        setDisplayQuestions(shuffledAndSliced);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching questions from Firebase:", error);
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [normalizedTopic, formattedLevel]);

  // =========================================================
  // TIMER
  // =========================================================

  useEffect(() => {
    if (loading || showResult) {
      return;
    }

    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, showResult]);

  // =========================================================
  // SAVE GAME RESULT
  // =========================================================

const handleCompleteGrammarGame = async (
    finalScore,
    totalQ,
    timeSpent,
    roundMaxStreak,
  ) => {
    const currentTotal = totalQ > 0 ? totalQ : TOTAL_QUESTIONS;
    const accuracyVal = currentTotal > 0 ? Math.round((finalScore / currentTotal) * 100) : 0;
    
    const currentBestScore = finalScore; 
    
    // 🌟 คำนวณเวลาเฉลี่ยต่อข้อตรงนี้ (ป้องกันค่า avgTime คลาดเคลื่อน)
    const avgTimeVal = `${Math.round(timeSpent / currentTotal)}s`;

    const auth = getAuth();
    const user = auth.currentUser;

    let finalBestStreak = roundMaxStreak;
    const properLevelName = formattedLevel.charAt(0).toUpperCase() + formattedLevel.slice(1);

    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          const oldBestStreak =
            userData?.scores?.grammar?.[properLevelName]?.[normalizedTopic]?.streak || 0;

          const oldBestScore =
            userData?.scores?.grammar?.[properLevelName]?.[normalizedTopic]?.bestScore || 0;

          finalBestStreak = Math.max(roundMaxStreak, oldBestStreak);
          const highestScore = Math.max(currentBestScore, oldBestScore);

          // 🌟 จุดที่ 1: กรณี User มีข้อมูลเดิม (เพิ่ม score และปรับ avgTime)
          await saveGameScore(
            "grammar",
            properLevelName,
            {
              accuracy: accuracyVal,
              score: currentBestScore,       // เพิ่มคะแนนรอบนี้จริง ๆ
              bestScore: highestScore,       // bestScore คงเดิม (เก็บค่าสูงสุดไว้)
              avgTime: avgTimeVal,           // เวลาเฉลี่ยต่อข้อ
              streak: finalBestStreak,
            },
            normalizedTopic,
            REWARD_COINS,
          );
        } else {
          // 🌟 จุดที่ 2: กรณี User ยังไม่มีข้อมูลในระบบ
          await saveGameScore(
            "grammar",
            properLevelName,
            {
              accuracy: accuracyVal,
              score: currentBestScore,       // เพิ่มคะแนนรอบนี้จริง ๆ
              bestScore: currentBestScore,
              avgTime: avgTimeVal,           // เวลาเฉลี่ยต่อข้อ
              streak: finalBestStreak,
            },
            normalizedTopic,
            REWARD_COINS,
          );
        }
      } catch (error) {
        console.error("Error fetching old stats for comparison:", error);
      }
    } else {
      // 🌟 จุดที่ 3: กรณี Guest Mode
      await saveGameScore(
        "grammar",
        properLevelName,
        {
          accuracy: accuracyVal,
          score: currentBestScore,         // เพิ่มคะแนนรอบนี้จริง ๆ
          bestScore: currentBestScore,
          avgTime: avgTimeVal,             // เวลาเฉลี่ยต่อข้อ
          streak: finalBestStreak,
        },
        normalizedTopic,
        REWARD_COINS,
      );
    }
  };
  // =========================================================
  // RESULT SCREEN 
  // =========================================================

  useEffect(() => {
    const updateGameResult = async () => {
      if (!showResult) {
        return;
      }

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

      await handleCompleteGrammarGame(
        score,
        displayQuestions.length,
        seconds,
        maxStreakInRound,
      );

      try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (user && !user.isAnonymous) {
          const userRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(userRef);
          let existingData = docSnap.exists() ? docSnap.data() : {};
          
          const existingCompleted = existingData.completedTenses || [];
          const updatedCompleted = Array.from(new Set([...existingCompleted, normalizedTopic, topic]));

          await setDoc(userRef, {
            completedTenses: updatedCompleted,
          }, { merge: true });
        } else {
          const storedProfile = await AsyncStorage.getItem("@guest_profile");
          let guestData = storedProfile ? JSON.parse(storedProfile) : { completedTenses: [] };
          
          const existingCompleted = guestData.completedTenses || [];
          guestData.completedTenses = Array.from(new Set([...existingCompleted, normalizedTopic, topic]));

          await AsyncStorage.setItem("@guest_profile", JSON.stringify(guestData));
        }
      } catch (error) {
        console.error("Error updating game results to Firebase:", error);
      }
    };

    updateGameResult();
  }, [showResult]);

  // =========================================================
  // FORMAT TIMER
  // =========================================================

  const formatTime = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // =========================================================
  // LOADING & EMPTY STATES
  // =========================================================

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          {
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#EAF8FF",
          },
        ]}
        edges={["top", "left", "right", "bottom"]}
      >
        <ActivityIndicator size="large" color="#00B2E3" />
        <Text style={{ marginTop: 10, fontWeight: "800", color: "#00B2E3" }}>
          Loading questions from Firebase...
        </Text>
      </SafeAreaView>
    );
  }

  if (displayQuestions.length === 0) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          {
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            backgroundColor: "#EAF8FF",
          },
        ]}
        edges={["top", "left", "right", "bottom"]}
      >
        <Ionicons name="alert-circle-outline" size={48} color="#CBD5E1" />
        <Text style={{ marginTop: 10, fontWeight: "800", color: "#1E293B", fontSize: 16 }}>
          No questions found for this topic.
        </Text>
        <TouchableOpacity
          style={[styles.nextButton, { marginTop: 20, paddingHorizontal: 20 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.nextButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const q = displayQuestions[currentQuestionIndex];
  const totalQuestions = displayQuestions.length;
  const progressPercent = ((currentQuestionIndex + 1) / totalQuestions) * 100;

  const optionAccents = ["#00B2E3", "#27C306", "#F49E00", "#3B82F6"];
  const optionLetters = ["A", "B", "C", "D"];

  // =========================================================
  // CHECK ANSWER
  // =========================================================
  const checkIsCorrectOption = (optionText, optionIndex, questionObj) => {
    if (!questionObj) return false;

    const correctAns = 
      questionObj.correctAnswer !== undefined ? questionObj.correctAnswer : 
      (questionObj.correct !== undefined ? questionObj.correct : 
      (questionObj.answer !== undefined ? questionObj.answer : null));

    if (correctAns === null || correctAns === undefined) return false;

    if (typeof correctAns === "number") {
      return optionIndex === correctAns;
    }

    if (typeof correctAns === "string" && typeof optionText === "string") {
      const cleanOption = optionText.trim().toLowerCase();
      const cleanCorrect = correctAns.trim().toLowerCase();

      if (cleanOption === cleanCorrect) return true;

      const letters = ["a", "b", "c", "d"];
      if (cleanCorrect === letters[optionIndex]) return true;
    }

    return false;
  };

  // =========================================================
  // SELECT ANSWER
  // =========================================================

  const handleSelectOption = (index) => {
    if (selectedOption !== null) {
      return;
    }

    setSelectedOption(index);

    const optionValue = q?.options?.[index];
    const correct = checkIsCorrectOption(optionValue, index, q);

    setIsCorrect(correct);

    if (correct) {
      setScore((prev) => prev + 1);
      const newStreak = currentStreak + 1;
      setCurrentStreak(newStreak);
      if (newStreak > maxStreakInRound) {
        setMaxStreakInRound(newStreak);
      }
    } else {
      setCurrentStreak(0);
    }

    setShowExplanation(true);

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // =========================================================
  // NEXT QUESTION
  // =========================================================

  const handleNext = () => {
    if (currentQuestionIndex + 1 < totalQuestions) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsCorrect(null);
      setShowExplanation(false);

      slideAnim.setValue(40);
      fadeAnim.setValue(0);
    } else {
      setShowResult(true);
    }
  };

  // =========================================================
  // RESET / PLAY AGAIN
  // =========================================================

  const resetGame = () => {
    setShowResult(false);
    setDisplayQuestions(shuffleArray(allQuestions).slice(0, TOTAL_QUESTIONS));
    setCurrentQuestionIndex(0);
    setScore(0);
    setSeconds(0);
    setCurrentStreak(0);
    setMaxStreakInRound(0);
    setSelectedOption(null);
    setIsCorrect(null);
    setShowExplanation(false);

    slideAnim.setValue(40);
    fadeAnim.setValue(0);
    resultScale.setValue(0.8);
    resultOpacity.setValue(0);
  };

  // =========================================================
  // MAIN SCREEN
  // =========================================================

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.contentContainer}>
          
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={22} color="#2D3E50" />
            </TouchableOpacity>

            <View style={styles.topicBadgeContainer}>
              <Text style={styles.headerTopicTitle} numberOfLines={1}>{normalizedTopic}</Text>
              <View style={styles.levelPill}>
                <Text style={styles.levelPillText}>{formattedLevel.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.timerBadge}>
              <Ionicons name="time-outline" size={14} color="#00B2E3" />
              <Text style={styles.timerText}>{formatTime(seconds)}</Text>
            </View>
          </View>

          {/* PROGRESS BAR & QUESTION COUNT */}
          <View style={styles.progressSection}>
            <View style={styles.progressInfoRow}>
              <Text style={styles.questionCountLabel}>
                Question <Text style={{ color: "#00B2E3" }}>{currentQuestionIndex + 1}</Text> of {totalQuestions}
              </Text>
            </View>
            <View style={styles.progressWrapper}>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>
          </View>

          {/* QUESTION SECTION */}
          <View style={styles.questionSection}>
            <Text style={styles.questionText}>{q?.questionText}</Text>
          </View>

          {/* OPTIONS CONTAINER */}
          <View style={styles.optionsContainer}>
            {q?.options?.map((option, index) => {
              let optionStyle = styles.optionCardNormal; 
              let textStyle = styles.optionTextNormal;
              let letterCircleStyle = [styles.letterCircle, { backgroundColor: optionAccents[index % optionAccents.length] }];
              let letterTextStyle = styles.letterTextWhite;
              let iconComponent = null;

              const isThisCorrect = checkIsCorrectOption(option, index, q);

              if (selectedOption !== null) {
                if (isThisCorrect) {
                  optionStyle = styles.optionCardGreen; 
                  textStyle = styles.optionTextWhite;
                  letterCircleStyle = [styles.letterCircle, { backgroundColor: "rgba(255, 255, 255, 0.25)" }];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                  iconComponent = <Ionicons name="checkmark-circle" size={26} color="#FFF" style={styles.statusIcon} />;
                } else if (index === selectedOption) {
                  optionStyle = styles.optionCardRed; 
                  textStyle = styles.optionTextWhite;
                  letterCircleStyle = [styles.letterCircle, { backgroundColor: "rgba(255, 255, 255, 0.25)" }];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                  iconComponent = <Ionicons name="close-circle" size={26} color="#FFF" style={styles.statusIcon} />;
                } else {
                  optionStyle = styles.optionCardDisabled;
                  textStyle = styles.optionTextDisabled;
                  letterCircleStyle = [styles.letterCircle, { backgroundColor: "#CBD5E1" }];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                }
              }

              return (
                <TouchableOpacity
                  key={index}
                  style={optionStyle}
                  onPress={() => handleSelectOption(index)}
                  activeOpacity={0.85}
                  disabled={selectedOption !== null}
                >
                  <View style={styles.optionLeftContent}>
                    <View style={letterCircleStyle}>
                      <Text style={letterTextStyle}>{optionLetters[index]}</Text>
                    </View>
                    <Text style={textStyle}>{option}</Text>
                  </View>
                  {iconComponent}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* EXPLANATION BOX */}
          {showExplanation && (
            <Animated.View
              style={[
                styles.explanationBox,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.explanationHeader}>
                <Ionicons
                  name={isCorrect ? "checkmark-circle" : "alert-circle"}
                  size={20}
                  color={isCorrect ? "#27C306" : "#EF4444"}
                />
                <Text style={[styles.explanationTitle, { color: isCorrect ? "#27C306" : "#EF4444" }]}>
                  {isCorrect ? "Correct! Excellent!" : "Incorrect!"}
                </Text>
              </View>

              <Text style={styles.explanationText}>
                {q.explanation || "Great job! Let's move to the next question."}
              </Text>

              <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.85}>
                <Text style={styles.nextButtonText}>
                  {currentQuestionIndex + 1 < totalQuestions ? "Next Question" : "See Results"}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* RESULT MODAL */}
        <Modal
          visible={showResult}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => {}}
        >
          <Animated.View style={[styles.resultOverlay, { opacity: resultOpacity }]}>
            <ConfettiCannon
              count={200}
              origin={{ x: width / 2, y: 0 }}
              autoStart={true}
              fadeOut={true}
              fallSpeed={3000}
            />

            <Animated.View style={[styles.resultCardContainer, { transform: [{ scale: resultScale }] }]}>
              <Image source={require("../../../assets/levelup.png")} style={styles.levelUpImage} resizeMode="contain" />

              <Text style={styles.resultScoreText}>
                Score: {score} / {totalQuestions}
              </Text>

              <View style={styles.resultTimerRow}>
                <Ionicons name="time-outline" size={16} color="#64748B" style={{ marginRight: 4 }} />
                <Text style={styles.resultTimerText}>Time: {formatTime(seconds)}</Text>
              </View>

              <View style={styles.resultCoinRow}>
                <Image source={require("../../../assets/coin.png")} style={styles.resultCoinImage} resizeMode="contain" />
                <Text style={styles.resultCoinText}>+{coinsEarned}</Text>
              </View>

              <View style={styles.resultButtonRow}>
                {/* ปุ่มรีเซ็ตเล่นข้อสอบเดิมซ้ำ */}
                <TouchableOpacity style={styles.actionButtonWrapper} activeOpacity={0.8} onPress={resetGame}>
                  <ImageBackground source={require("../../../assets/sky-button.png")} style={styles.actionButtonBg} resizeMode="contain">
                    <Ionicons name="reload" size={24} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>

                {/* 🌟 ปุ่ม Play สีเขียว: แก้ไขให้กดแล้วกลับไปหน้าเลือก Tense เพื่อไปเล่นหัวข้อถัดไปแทนที่จะรีเซ็ตข้อเดิม */}
                <TouchableOpacity 
                  style={styles.actionButtonWrapper} 
                  activeOpacity={0.8} 
                  onPress={() => {
                    setShowResult(false);
                    navigation.goBack(); // พาผู้เล่นกลับไปหน้าเลือก Tense (GrammarLevelsScreen)
                  }}
                >
                  <ImageBackground source={require("../../../assets/green-button.png")} style={styles.actionButtonBg} resizeMode="contain">
                    <Ionicons name="play" size={26} color="#FFF" />
                  </ImageBackground>
                </TouchableOpacity>

                {/* ปุ่มกลับหน้า Home */}
                <TouchableOpacity
                  style={styles.actionButtonWrapper}
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowResult(false);
                    navigation.navigate("HomeScreen");
                  }}
                >
                  <ImageBackground source={require("../../../assets/sky-button.png")} style={styles.actionButtonBg} resizeMode="contain">
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
}

// =============================================================
// STYLES
// =============================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF8FF" },
  contentContainer: { flex: 1, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24 },
  
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  backBtn: {
    width: 42, height: 42, backgroundColor: "#FFF", borderRadius: 14,
    justifyContent: "center", alignItems: "center", elevation: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  topicBadgeContainer: {
    flex: 1, marginHorizontal: 12, alignItems: "center", justifyContent: "center",
  },
  headerTopicTitle: { fontSize: 13, fontWeight: "900", color: "#1E293B", letterSpacing: 0.5, marginBottom: 2 },
  levelPill: {
    backgroundColor: "#D0F0FD", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8,
  },
  levelPillText: { fontSize: 9, fontWeight: "900", color: "#0095C8", letterSpacing: 0.8 },

  timerBadge: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#FFF",
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, elevation: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  timerText: { fontSize: 12, fontWeight: "900", color: "#00B2E3", marginLeft: 4 },

  progressSection: { marginBottom: 24, paddingHorizontal: 2 },
  progressInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  questionCountLabel: { fontSize: 14, fontWeight: "900", color: "#1E293B", letterSpacing: 0.5 },
  progressWrapper: { height: 12, backgroundColor: "#D1EAF5", borderRadius: 6, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#27C306", borderRadius: 6 },

  questionSection: { marginBottom: 28, paddingHorizontal: 4 },
  questionText: { fontSize: 21, fontWeight: "900", color: "#1E293B", lineHeight: 32 },

  optionsContainer: { flex: 1, justifyContent: "flex-start", gap: 14 },
  
  optionCardNormal: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#FFF", borderRadius: 20, 
    paddingVertical: 16, paddingHorizontal: 18, elevation: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5,
    borderWidth: 1.5, borderColor: "#F1F5F9",
  },
  optionCardGreen: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#27C306", borderRadius: 20, 
    paddingVertical: 16, paddingHorizontal: 18, elevation: 5,
  },
  optionCardRed: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#EF4444", borderRadius: 20, 
    paddingVertical: 16, paddingHorizontal: 18, elevation: 5,
  },
  optionCardDisabled: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#F8FAFC", borderRadius: 20,
    paddingVertical: 16, paddingHorizontal: 18, opacity: 0.5,
    borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  optionLeftContent: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 10 },
  letterCircle: {
    width: 36, height: 36, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14,
  },
  letterTextWhite: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  optionTextNormal: { fontSize: 16, fontWeight: "800", color: "#1E293B", flex: 1 },
  optionTextWhite: { fontSize: 16, fontWeight: "800", color: "#FFF", flex: 1 },
  optionTextDisabled: { fontSize: 16, fontWeight: "800", color: "#94A3B8", flex: 1 },
  statusIcon: { marginLeft: 10 },

  explanationBox: {
    backgroundColor: "#FFF", borderRadius: 20, padding: 18, 
    elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 6, 
    marginBottom: 10, borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  explanationHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  explanationTitle: { fontSize: 15, fontWeight: "900", marginLeft: 8 },
  explanationText: { fontSize: 13, color: "#475569", fontWeight: "700", lineHeight: 20, marginBottom: 14 },
  nextButton: {
    backgroundColor: "#00B2E3", borderRadius: 16, paddingVertical: 14,
    alignItems: "center", justifyContent: "center", elevation: 3,
  },
  nextButtonText: { color: "#FFF", fontSize: 15, fontWeight: "900", letterSpacing: 0.8 },

  resultOverlay: { flex: 1, width: "100%", height: "100%", backgroundColor: "rgba(0, 0, 0, 0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  resultCardContainer: {
    width: "85%", maxWidth: 380, backgroundColor: "#FFF9E6", borderRadius: 24,
    paddingVertical: 24, paddingHorizontal: 16, alignItems: "center", justifyContent: "center",
    borderWidth: 4, borderColor: "#FFE082", elevation: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 10,
  },
  levelUpImage: { 
    width: 240, 
    height: 120, 
    marginBottom: 10 
  },
  resultScoreText: { fontSize: 15, fontWeight: "900", color: "#1E293B", marginBottom: 4 },
  resultTimerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  resultTimerText: { fontSize: 13, fontWeight: "800", color: "#64748B" },
  resultCoinRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255, 193, 7, 0.2)", paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, marginBottom: 16, borderWidth: 1.5, borderColor: "#FFE082",
  },
  resultCoinImage: { width: 24, height: 24, marginRight: 6 },
  resultCoinText: { fontSize: 20, fontWeight: "900", color: "#D4AF37" },
  resultButtonRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", width: "100%" },
  actionButtonWrapper: { marginHorizontal: 8, alignItems: "center", justifyContent: "center" },
  actionButtonBg: { width: 54, height: 54, justifyContent: "center", alignItems: "center" },
});