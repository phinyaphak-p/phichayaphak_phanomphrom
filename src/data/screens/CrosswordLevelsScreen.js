import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function CrosswordLevelsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 20);

  const [userLevel, setUserLevel] = useState("Beginner");

  useFocusEffect(
    useCallback(() => {
      fetchUserProgress();
    }, []),
  );

  const fetchUserProgress = async () => {
    try {
      const user = getAuth().currentUser;
      if (user && !user.isAnonymous) {
        const snap = await getDoc(doc(getFirestore(), "users", user.uid));
        if (snap.exists() && snap.data().level) {
          setUserLevel(snap.data().level);
          return;
        }
      }
      
      // ถ้าไม่ได้ Login หรือใน Firestore ไม่พบเลเวล ให้ดึงจาก AsyncStorage แทน
      const raw = await AsyncStorage.getItem("@guest_profile");
      const lv = raw ? JSON.parse(raw).level : null;
      if (lv) {
        setUserLevel(lv);
      } else {
        const savedLevel = await AsyncStorage.getItem("@user_level");
        if (savedLevel) setUserLevel(savedLevel);
      }
    } catch (error) {
      console.error("Error fetching progress:", error);
    }
  };

  const levels = [
    {
      title: "Beginner",
      difficulty: "Beginner",
      colors: ["#00E5FF", "#00B0FF"],
    },
    {
      title: "Intermediate",
      difficulty: "Intermediate",
      colors: ["#69F0AE", "#00E676"],
    },
    {
      title: "Advanced",
      difficulty: "Advanced",
      colors: ["#FFD54F", "#FFA000"],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#2D3E50" />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.headerTitle}>Crossword Game</Text>
          <Text style={styles.headerSubTitle}>Select Difficulty Level</Text>
        </View>
        <View style={styles.placeholderBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {levels.map((item, index) => {
          const isRecommended =
            userLevel.toLowerCase() === item.difficulty.toLowerCase();

          return (
            <View key={index} style={styles.cardWrapper}>
              {isRecommended && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>⭐ Recommended</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("CrosswordLevelListScreen", {
                    difficulty: item.difficulty,
                  })
                }
                activeOpacity={0.88}
                style={styles.touchableCard}
              >
                <LinearGradient
                  colors={item.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.diffCard}
                >
                  <View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSub}>Tap to select levels</Text>
                  </View>
                  <View style={styles.playBtnContainer}>
                    <Ionicons name="play" size={22} color="#FFF" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EBF3FB" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 15,
    paddingBottom: 10,
  },
  backBtn: {
    width: 42,
    height: 42,
    backgroundColor: "#FFF",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  titleWrapper: { alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#1A2530" },
  headerSubTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#78909C",
    marginTop: 2,
  },
  placeholderBtn: { width: 42, height: 42 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    justifyContent: "center",
    flexGrow: 1,
  },
  cardWrapper: { marginBottom: 24, position: "relative" },
  badgeContainer: {
    position: "absolute",
    top: -12,
    left: 16,
    zIndex: 10,
    backgroundColor: "#FF5722",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    elevation: 4,
  },
  badgeText: { color: "#FFF", fontSize: 10, fontWeight: "bold" },
  touchableCard: {
    borderRadius: 22,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  diffCard: {
    flexDirection: "row",
    paddingVertical: 22,
    paddingHorizontal: 26,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 24, fontWeight: "900", color: "#FFF" },
  cardSub: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "600",
    marginTop: 4,
  },
  playBtnContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
});