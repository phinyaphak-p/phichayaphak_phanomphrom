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
  ScrollView,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ConfettiCannon from "react-native-confetti-cannon";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { isPretestDone, savePretestResult } from "./services/scoreService";

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore"; 

// นำเข้าข้อมูล Pre-test จากไฟล์โค้ดในโปรเจกต์ของคุณ
import { grammarPreTestData } from "../../../src/data/screens/PretestData";

const { width } = Dimensions.get("window");

export default function PretestScreen({ navigation }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const [userAnswers, setUserAnswers] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);

  const resultScale = useRef(new Animated.Value(0.8)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  const savePromiseRef = useRef(null);

  useEffect(() => {
    isPretestDone().then((done) => {
      if (done)
        navigation.reset({ index: 0, routes: [{ name: "HomeScreen" }] });
    });
  }, []);

  // ฟังก์ชันสุ่มข้อสอบเพื่อให้เวลาเล่นใหม่โจทย์จะไม่ซ้ำชุดเดิม
  const shuffleArray = (array) => {
    return [...array].sort(() => 0.5 - Math.random());
  };

  // 1. โหลดและสุ่มข้อมูลคำถาม Pre-test จากไฟล์ PretestData.js ทันที (สุ่ม 20 ข้อตามขอบเขตงาน)
  useEffect(() => {
    const loadPretestData = () => {
      try {
        const rawData = grammarPreTestData || [];
        const shuffled = shuffleArray(rawData)
          .slice(0, 20)
          .map((item) => ({
            ...item,
            questionText: item.question || "",
          }));

        setQuestions(shuffled);
        setLoading(false);
      } catch (error) {
        console.error("Error loading pretest data from file: ", error);
        setLoading(false);
      }
    };

    loadPretestData();
  }, []);

  // เปิด Result Animation เมื่อทำครบ
  useEffect(() => {
    if (!showResult) return;
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
  }, [showResult]);

  const getSkillLevel = (customScore) => {
    const targetScore = customScore !== undefined ? customScore : score;
    const totalQ = questions.length > 0 ? questions.length : 1;
    const percent = (targetScore / totalQ) * 100;
    if (percent >= 80) return "Advanced";
    if (percent >= 50) return "Intermediate";
    return "Beginner";
  };

  const handleFinishPretest = async () => {
  await savePromiseRef.current;
  setShowResult(false);
  navigation.reset({ index: 0, routes: [{ name: "HomeScreen", params: { fromPretest: true } }] });
};


  const checkIsCorrectOption = (optionText, optionIndex, questionObj) => {
    if (!questionObj) return false;
    const correctAns = questionObj.correctAnswer;
    if (correctAns === undefined || correctAns === null) return false;

    if (typeof correctAns === "number") {
      return optionIndex === correctAns;
    }
    if (typeof correctAns === "string" && typeof optionText === "string") {
      if (optionText.trim().toLowerCase() === correctAns.trim().toLowerCase())
        return true;
      const letters = ["a", "b", "c", "d"];
      if (correctAns.trim().toLowerCase() === letters[optionIndex]) return true;
    }
    return false;
  };

  const handleSelectOption = (index) => {
    if (selectedOption !== null) return;

    setSelectedOption(index);
    const currentQ = questions[currentQuestionIndex];
    const correct = checkIsCorrectOption(
      currentQ?.options?.[index],
      index,
      currentQ,
    );
    setIsCorrect(correct);

    const currentAnswerData = {
      question: currentQ.questionText || currentQ.question,
      options: currentQ.options,
      userChoice: index,
      correctChoice: currentQ.correctAnswer,
      isCorrect: correct,
    };
    setUserAnswers([...userAnswers, currentAnswerData]);

    const newScore = correct ? score + 1 : score;
    if (correct) {
      setScore(newScore);
    }

    setTimeout(() => {
      if (currentQuestionIndex + 1 < questions.length) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedOption(null);
        setIsCorrect(null);
      } else {
        savePromiseRef.current = savePretestResult(
          getSkillLevel(newScore),
          newScore,
          questions.length,
        ).catch((e) => console.error("Save pretest error:", e));
        setShowResult(true);
      }
    }, 800);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#00B2E3" />
        <Text style={styles.loadingText}>Loading Pre-test Arena...</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[styles.container, styles.center, { padding: 20 }]}>
        <Ionicons name="game-controller-outline" size={56} color="#00B2E3" />
        <Text
          style={{
            marginTop: 10,
            fontWeight: "800",
            color: "#1E293B",
            fontSize: 18,
          }}
        >
          No pretest questions found.
        </Text>
        <TouchableOpacity
          style={[styles.nextButton, { marginTop: 20, paddingHorizontal: 24 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.nextButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentQ = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const progressPercent = ((currentQuestionIndex + 1) / totalQuestions) * 100;

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
            >
              <Ionicons name="chevron-back" size={24} color="#2D3E50" />
            </TouchableOpacity>

            <View style={styles.gameTitleBadge}>
              <Text style={styles.headerTitle}>PRE-TEST</Text>
            </View>

            <View style={{ width: 44 }} />
          </View>

          {/* PROGRESS SECTION */}
          <View style={styles.progressSection}>
            <View style={styles.progressInfoRow}>
              <Text style={styles.questionCountLabel}>
                Question{" "}
                <Text style={{ color: "#00B2E3" }}>
                  {currentQuestionIndex + 1}
                </Text>{" "}
                of {totalQuestions}
              </Text>
            </View>
            <View style={styles.progressWrapper}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* QUESTION SECTION */}
          <View style={styles.questionSection}>
            <Text style={styles.questionText}>{currentQ?.questionText}</Text>
          </View>

          {/* OPTIONS CONTAINER */}
          <View style={styles.optionsContainer}>
            {currentQ?.options?.map((option, index) => {
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

              const isThisCorrect = checkIsCorrectOption(
                option,
                index,
                currentQ,
              );

              if (selectedOption !== null) {
                if (index === selectedOption) {
                  optionStyle = isThisCorrect
                    ? styles.optionCardGreen
                    : styles.optionCardRed;
                  textStyle = styles.optionTextWhite;
                  letterCircleStyle = [
                    styles.letterCircle,
                    { backgroundColor: "rgba(255, 255, 255, 0.25)" },
                  ];
                  letterTextStyle = { color: "#FFF", fontWeight: "900" };
                  iconComponent = (
                    <Ionicons
                      name={isThisCorrect ? "checkmark-circle" : "close-circle"}
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
                  key={index}
                  style={optionStyle}
                  onPress={() => handleSelectOption(index)}
                  activeOpacity={0.85}
                  disabled={selectedOption !== null}
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
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => {}}
        >
          <Animated.View
            style={[styles.resultOverlay, { opacity: resultOpacity }]}
          >
            {score >= questions.length / 2 && (
              <ConfettiCannon
                count={200}
                origin={{ x: width / 2, y: 0 }}
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

              <Text style={styles.resultSkillLabel}>Your Skill Level</Text>
              <Text style={styles.resultSkillValue}>{getSkillLevel()}</Text>

              <Text style={styles.resultScoreText}>
                Score: {score} / {questions.length}
              </Text>

              {/* ปุ่ม Review Answers */}
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() => setShowReview(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.reviewBtnText}>Review Answers</Text>
                <Ionicons name="chevron-forward" size={16} color="#FFF" />
              </TouchableOpacity>

              {/* ปุ่ม Next */}
              <TouchableOpacity
                style={styles.actionButtonWrapper}
                activeOpacity={0.85}
                onPress={handleFinishPretest}
              >
                <ImageBackground
                  source={require("../../../assets/green-button.png")}
                  style={styles.actionButtonBg}
                  resizeMode="contain"
                >
                  <Ionicons name="play" size={26} color="#FFF" />
                </ImageBackground>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Modal>

        {/* REVIEW ANSWERS MODAL */}
        <Modal visible={showReview} transparent={false} animationType="slide">
          <SafeAreaView style={styles.reviewModalContainer}>
            <View style={styles.reviewTopHeader}>
              <Text style={styles.reviewTitleText}>Review Answers</Text>
              <TouchableOpacity
                style={styles.closeReviewCircle}
                onPress={() => setShowReview(false)}
              >
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.reviewScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {userAnswers.map((item, idx) => (
                <View key={idx} style={styles.reviewItemCard}>
                  <View style={styles.reviewHeader}>
                    <Ionicons
                      name={
                        item.isCorrect ? "checkmark-circle" : "close-circle"
                      }
                      size={22}
                      color={item.isCorrect ? "#27C306" : "#EF4444"}
                    />
                    <Text style={styles.reviewQText}>
                      {" "}
                      Question {idx + 1}: {item.question}
                    </Text>
                  </View>

                  <View style={styles.answerBlock}>
                    <Text style={styles.ansText}>
                      <Text
                        style={{
                          fontWeight: "bold",
                          color: item.isCorrect ? "#27C306" : "#EF4444",
                        }}
                      >
                        Your Answer:{" "}
                      </Text>
                      {item.options[item.userChoice]}
                    </Text>
                    {!item.isCorrect && (
                      <Text style={[styles.ansText, { marginTop: 6 }]}>
                        <Text style={{ fontWeight: "bold", color: "#27C306" }}>
                          Correct Answer:{" "}
                        </Text>
                        {item.options[item.correctChoice]}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
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
  center: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontWeight: "800", color: "#00B2E3" },

  contentContainer: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
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

  progressSection: { marginBottom: 24, paddingHorizontal: 2 },
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

  questionSection: { marginBottom: 28, paddingHorizontal: 4 },
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
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#FFF9E6",
    borderRadius: 24,
    paddingVertical: 24,
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
  starIcon: { width: 70, height: 70, marginBottom: 8 },
  resultSkillLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8C7A6B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultSkillValue: {
    fontSize: 32,
    fontWeight: "900",
    color: "#1E293B",
    marginVertical: 4,
  },
  resultScoreText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#D4AF37",
    marginBottom: 14,
  },

  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(212, 175, 55, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#FFE082",
  },
  reviewBtnText: {
    color: "#8C7A6B",
    fontSize: 13,
    fontWeight: "bold",
    marginRight: 5,
  },

  actionButtonWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  actionButtonBg: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },

  reviewModalContainer: { flex: 1, backgroundColor: "#F0F7FF" },
  reviewTopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E8F5",
    elevation: 2,
  },
  reviewTitleText: { fontSize: 18, fontWeight: "900", color: "#005088" },
  closeReviewCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F44336",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  reviewScrollContent: { padding: 20, paddingBottom: 40 },
  reviewItemCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  reviewQText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    lineHeight: 22,
  },
  answerBlock: {
    marginLeft: 28,
    backgroundColor: "#F9FCFF",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EBF3FC",
  },
  ansText: { fontSize: 14, color: "#444", lineHeight: 20 },
});
