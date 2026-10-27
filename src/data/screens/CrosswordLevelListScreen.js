import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { crosswordData } from "../../../src/data/screens/crosswordData";
import { useFocusEffect } from "@react-navigation/native";

const CrosswordLevelListScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 20);

  const { difficulty } = route.params || { difficulty: "Beginner" };
  const diffKey = difficulty.toLowerCase();

  const rawLevels = crosswordData[difficulty] || [];
  const levels = rawLevels.slice(0, 3);

  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [showAlertModal, setShowAlertModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchUserProgress();
    }, [difficulty]),
  );

const fetchUserProgress = async () => {
  try {
    const user = getAuth().currentUser;
    const formatted = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();

    let data = null;
    if (user && !user.isAnonymous) {
      const snap = await getDoc(doc(getFirestore(), 'users', user.uid));
      data = snap.exists() ? snap.data() : null;
    } else {
      const raw = await AsyncStorage.getItem('@guest_profile');
      data = raw ? JSON.parse(raw) : null;
    }

    const map = data?.unlockedCrosswordLevels || {};
    setUnlockedLevel(map[formatted] || map[diffKey] || data?.unlockedCrosswordLevel || 1);
  } catch (error) {
    console.error('Error fetching progress:', error);
  }
};

  const handleSelectLevel = (item, levelIndex) => {
    const levelNumber = levelIndex + 1;
    if (levelNumber > unlockedLevel) {
      setShowAlertModal(true);
      return;
    }

    navigation.navigate("CrosswordScreen", {
      levelData: item,
      difficulty: difficulty,
      levelIndex: levelNumber,
      levelKey: diffKey,
    });
  };

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
          <Text style={styles.headerTitle}>Select Level</Text>
          <Text style={styles.headerSubTitle}>Difficulty : {difficulty}</Text>
        </View>
        <View style={styles.placeholderBtn} />
      </View>

      <FlatList
        data={levels}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: bottomPadding + 20 },
        ]}
        renderItem={({ item, index }) => {
          const levelNumber = index + 1;
          const isLocked = levelNumber > unlockedLevel;

          return (
            <TouchableOpacity
              style={[styles.levelCard, isLocked && styles.cardLocked]}
              onPress={() => handleSelectLevel(item, index)}
              activeOpacity={isLocked ? 0.8 : 0.82}
            >
              <View style={styles.cardContent}>
                <View>
                  <Text
                    style={[styles.levelTitle, isLocked && styles.textGray]}
                  >
                    {item.title || `Level ${levelNumber}`}
                  </Text>
                  <Text style={styles.levelSub}>
                    {item.words ? item.words.length : 0} words
                  </Text>
                </View>

                {isLocked ? (
                  <LinearGradient
                    colors={["#B0BEC5", "#78909C"]}
                    style={styles.actionButton}
                  >
                    <Ionicons name="lock-closed" size={22} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <LinearGradient
                    colors={["#FFEB3B", "#FFC107"]}
                    style={styles.actionButton}
                  >
                    <Ionicons name="play" size={22} color="#FFF" />
                  </LinearGradient>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Custom Alert Modal */}
      <Modal
        visible={showAlertModal}
        transparent={true}
        animationType="none"
        statusBarTranslucent={true}
        onRequestClose={() => setShowAlertModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.guestAlertBox}>
            <Ionicons
              name="lock-closed"
              size={48}
              color="#E53935"
              style={{ marginBottom: 5 }}
            />
            <Text style={styles.alertTitle}>LOCKED LEVEL</Text>
            <Text style={styles.alertSub}>
              Please complete the previous level to unlock this one!
            </Text>
            <TouchableOpacity
              style={styles.alertBtn}
              activeOpacity={0.8}
              onPress={() => setShowAlertModal(false)}
            >
              <Text style={styles.alertBtnText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

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
  listContainer: { paddingHorizontal: 24, paddingTop: 20 },
  levelCard: {
    backgroundColor: "#FFF",
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 22,
    marginBottom: 16,
    elevation: 4,
  },
  cardLocked: { backgroundColor: "#E0E6ED", elevation: 1 },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  levelTitle: { fontSize: 20, fontWeight: "900", color: "#1A2530" },
  textGray: { color: "#607D8B" },
  levelSub: { fontSize: 12, color: "#78909C", fontWeight: "600", marginTop: 3 },
  actionButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  guestAlertBox: {
    width: "80%",
    backgroundColor: "#FFF",
    borderRadius: 30,
    padding: 30,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginTop: 15,
    marginBottom: 10,
  },
  alertSub: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 25,
  },
  alertBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 20,
    width: "100%",
    alignItems: "center",
  },
  alertBtnText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },
});

export default CrosswordLevelListScreen;
