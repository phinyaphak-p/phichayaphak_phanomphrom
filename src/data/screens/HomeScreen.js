import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

const characters = [
  require("../../../assets/avatar-1.png"),
  require("../../../assets/avatar-2.png"),
  require("../../../assets/avatar-3.png"),
  require("../../../assets/avatar-4.png"),
  require("../../../assets/avatar-5.png"),
  require("../../../assets/avatar-6.png"),
];

const homeCache = {};
const DEFAULT_USER = {
  name: "Loading...",
  coins: 0,
  level: "Beginner",
  hasCompletedPretest: false,
  avatarId: "1",
};

const POSTTEST_TENSES = [
  "presentsimple",
  "pastsimple",
  "futuresimple",
  "presentcontinuous",
  "pastcontinuous",
  "futurecontinuous",
  "presentperfect",
  "pastperfect",
  "futureperfect",
];

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isPostTestUnlocked = (grammar) => {
  const played = new Set();
  Object.values(grammar || {}).forEach((lvl) =>
    Object.entries(lvl || {}).forEach(([topic, st]) => {
      if (Array.isArray(st?.attempts) && st.attempts.length > 0)
        played.add(norm(topic));
    }),
  );
  const list = [...played];
  return POSTTEST_TENSES.every((t) => list.some((p) => p.includes(t)));
};

const HomeScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("HomeScreen");

  const [levelUp, setLevelUp] = useState(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const unlockKeyRef = useRef(null);

  const [userData, setUserData] = useState(
    () =>
      homeCache[
        auth.currentUser && !auth.currentUser.isAnonymous
          ? auth.currentUser.uid
          : "guest"
      ] || DEFAULT_USER,
  );

  const [showGuestAlert, setShowGuestAlert] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setActiveTab("HomeScreen");
      checkGuestAlertLogic();
      loadUserData();
    }, [route?.params]),
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => loadUserData());
    return unsub;
  }, []);

  const checkGuestAlertLogic = async () => {
    try {
      const fromPretest = route?.params?.fromPretest;
      const fromGame = route?.params?.fromGame;

      const lastShowDate = await AsyncStorage.getItem("@last_guest_alert_date");
      const todayDateStr = new Date().toISOString().split("T")[0];

      if (fromPretest) {
        setShowGuestAlert(true);
        await AsyncStorage.setItem("@last_guest_alert_date", todayDateStr);
        navigation.setParams({ fromPretest: undefined });
        return;
      }

      if (fromGame && lastShowDate !== todayDateStr) {
        setShowGuestAlert(true);
        await AsyncStorage.setItem("@last_guest_alert_date", todayDateStr);
        navigation.setParams({ fromGame: undefined });
        return;
      }
    } catch (error) {
      console.error("Error checking guest alert:", error);
    }
  };

  const loadUserData = async () => {
    try {
      if (auth.authStateReady) await auth.authStateReady();

      const user = auth.currentUser;
      const isUser = !!user && !user.isAnonymous;

      let data, ref, isNew, grammar, pretestScoreText;
      if (isUser) {
        ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        isNew = !snap.exists();
        data = snap.exists() ? snap.data() : {};
        data.name =
          data.name || user.displayName || `Player_${user.uid.substring(0, 4)}`;
        grammar = data.scores?.grammar;
        pretestScoreText = data.scores?.skillStats?.pretest;
      } else {
        const stored = await AsyncStorage.getItem("@guest_profile");
        isNew = !stored;
        data = stored ? JSON.parse(stored) : {};
        if (!data.name) {
          data.name = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
          isNew = true;
        }
        const rawScores = await AsyncStorage.getItem("@guest_game_scores");
        const parsedScores = rawScores ? JSON.parse(rawScores) : {};
        grammar = parsedScores.grammar;
        pretestScoreText = parsedScores.skillStats?.pretest || data.pretestScore;
      }

      let calculatedLevel = data.level || "Beginner";
      if (pretestScoreText) {
        const m = String(pretestScoreText).match(/(\d+)\s*\/\s*(\d+)/);
        if (m && Number(m[2]) > 0) {
          const pct = (Number(m[1]) / Number(m[2])) * 100;
          if (pct >= 80) calculatedLevel = "Advanced";
          else if (pct >= 50) calculatedLevel = "Intermediate";
          else calculatedLevel = "Beginner";
        }
      }

      const current = {
        coins: data.coins ?? 0,
        level: calculatedLevel,
        hasCompletedPretest: !!data.hasCompletedPretest || !!pretestScoreText,
      };
      const next = { ...current };

      const paramLevel = route?.params?.level;
      if (paramLevel && LEVELS.includes(paramLevel) && route?.params?.fromPosttest) {
        if (LEVELS.indexOf(paramLevel) > LEVELS.indexOf(current.level)) {
          next.level = paramLevel;
          setLevelUp({ from: current.level, to: paramLevel });
        }
      }

      if (isUser) {
        const updates = {};
        if (isNew) updates.name = data.name;
        if (next.level !== current.level) updates.level = next.level;
        if (updates.level) await setDoc(ref, updates, { merge: true });
      } else {
        await AsyncStorage.setItem(
          "@guest_profile",
          JSON.stringify({ ...data, ...next }),
        );
      }

      if (paramLevel) navigation.setParams({ level: undefined, fromPosttest: undefined, fromPretest: undefined });

      const unlockKey = `@posttest_unlock_notified_${isUser ? user.uid : "guest"}`;
      unlockKeyRef.current = unlockKey;
      if (
        isPostTestUnlocked(grammar) &&
        !(await AsyncStorage.getItem(unlockKey))
      ) {
        setShowUnlock(true);
      }

      const loaded = {
        name: data.name,
        avatarId: data.avatarId || "1",
        ...next,
      };
      homeCache[isUser ? user.uid : "guest"] = { ...DEFAULT_USER, ...loaded };
      setUserData((prev) => ({ ...prev, ...loaded }));
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const dismissUnlock = async (goExplorer) => {
    setShowUnlock(false);
    try {
      if (unlockKeyRef.current)
        await AsyncStorage.setItem(unlockKeyRef.current, "1");
    } catch (e) {}
    if (goExplorer) navigation.navigate("PosttestScreen");
  };

  const handlePlayGame = (screenName) => {
    navigation.navigate(screenName);
  };

  const navigateTo = (screenName) => {
    setActiveTab(screenName);
    if (screenName !== "HomeScreen") {
      navigation.navigate(screenName);
    }
  };

  const navBarHeight = 70;
  const bottomPadding = Math.max(insets.bottom, 10);
  const totalNavHeight = navBarHeight + bottomPadding;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: totalNavHeight + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section (ด้านบนสุด) */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileInfo}
            onPress={() => navigation.navigate("ProfileScreen")}
          >
            <View style={styles.avatarContainer}>
              <Image
                source={
                  characters[(Number(userData.avatarId) || 1) - 1] ||
                  characters[0]
                }
                style={styles.avatarImg}
                resizeMode="cover"
              />
            </View>
            <View style={styles.textGroup}>
              <View style={styles.nameTag}>
                <Text
                  style={styles.nameText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {userData.name}
                </Text>
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText} numberOfLines={1}>
                  Level : {userData.level}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.coinBadge}>
            <Image
              source={require("../../../assets/coin.png")}
              style={styles.coinIcon}
            />
            <Text style={styles.coinText}>{userData.coins}</Text>
          </View>
        </View>

        {/* Game Cards Layout (จัดให้อยู่กึ่งกลางจอสมดุล และขยายการ์ด Spelling ให้ใหญ่ขึ้นสมส่วน) */}
        <View style={styles.gameSection}>
          <View style={styles.topRowCards}>
            <GameCardVertical
              title="GRAMMAR GAME"
              bgColor="#F1FFFF"
              icon="book"
              gradientColors={["#1CFFF7", "#00B2E3"]}
              btnGradient={["#1CFFF7", "#00B2E3"]}
              onPress={() => handlePlayGame("GrammarScreen")}
            />

            <GameCardVertical
              title="CROSSWORD GAME"
              bgColor="#F5FFF1"
              icon="grid"
              gradientColors={["#5BFC51", "#27C306"]}
              btnGradient={["#5BFC51", "#27C306"]}
              onPress={() => handlePlayGame("CrosswordLevelsScreen")}
            />
          </View>

          <GameCardHorizontal
            title="SPELLING GAME"
            bgColor="#FFFDF1"
            icon="pencil"
            gradientColors={["#FFCB48", "#F49E00"]}
            btnGradient={["#FFCB48", "#F49E00"]}
            onPress={() => handlePlayGame("SpellingLevelsScreen")}
          />
        </View>
      </ScrollView>

      {/* Navigation Bar ด้านล่าง */}
      <View
        style={[
          styles.navBar,
          { height: totalNavHeight, paddingBottom: bottomPadding },
        ]}
      >
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo("HomeScreen")}
        >
          <Ionicons
            name="home"
            size={26}
            color={activeTab === "HomeScreen" ? "#0284C7" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              { color: activeTab === "HomeScreen" ? "#0284C7" : "#94A3B8" },
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo("BattleScreen")}
        >
          <MaterialCommunityIcons
            name="sword-cross"
            size={26}
            color={activeTab === "BattleScreen" ? "#0284C7" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              { color: activeTab === "BattleScreen" ? "#0284C7" : "#94A3B8" },
            ]}
          >
            Battle
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigateTo("PosttestScreen")}
        >
          <Ionicons
            name="compass"
            size={26}
            color={activeTab === "PosttestScreen" ? "#0284C7" : "#94A3B8"}
          />
          <Text
            style={[
              styles.navText,
              { color: activeTab === "PosttestScreen" ? "#0284C7" : "#94A3B8" },
            ]}
          >
            Explorer
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <Modal visible={showGuestAlert} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.guestAlertBox}>
            <View style={styles.alertIconCircle}>
              <Ionicons
                name="cloud-offline-outline"
                size={32}
                color="#0284C7"
              />
            </View>
            <Text style={styles.alertTitle}>Playing as Guest</Text>
            <Text style={styles.alertSub}>
              Link your account now to sync and save your English learning
              progress permanently!
            </Text>
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={() => setShowGuestAlert(false)}
            >
              <Text style={styles.alertBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!levelUp && !showGuestAlert}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.guestAlertBox}>
            <View style={styles.alertIconCircle}>
              <Ionicons name="trophy" size={32} color="#F59E0B" />
            </View>
            <Text style={styles.alertTitle}>Congratulations! 🎉</Text>
            <Text style={styles.alertSub}>
              Your Post-test result moved you up from {levelUp?.from} to{" "}
              {levelUp?.to}!
            </Text>
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={() => setLevelUp(null)}
            >
              <Text style={styles.alertBtnText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showUnlock && !showGuestAlert && !levelUp}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.guestAlertBox}>
            <View style={styles.alertIconCircle}>
              <Ionicons name="lock-open" size={32} color="#F59E0B" />
            </View>
            <Text style={styles.alertTitle}>Post-Test Unlocked! 🎯</Text>
            <Text style={styles.alertSub}>
              You have passed all 9 grammar tenses. Head to Explorer to take the
              Post-test and see how much you have improved!
            </Text>
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={() => dismissUnlock(true)}
            >
              <Text style={styles.alertBtnText}>Go to Explorer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 10, paddingVertical: 8 }}
              onPress={() => dismissUnlock(false)}
            >
              <Text style={{ color: "#64748B", fontWeight: "bold" }}>
                Maybe later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const GameCardVertical = ({
  title,
  bgColor,
  icon,
  onPress,
  gradientColors,
  btnGradient,
}) => (
  <TouchableOpacity
    style={[styles.verticalCard, { backgroundColor: bgColor }]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <LinearGradient colors={gradientColors} style={styles.cardIconBoxVertical}>
      <Ionicons name={icon} size={38} color="#FFF" />
    </LinearGradient>

    <View style={styles.verticalCardContent}>
      <Text style={styles.verticalCardTitle}>{title}</Text>
      <Text style={styles.cardSub}>Test your skills</Text>
    </View>

    <TouchableOpacity onPress={onPress} style={{ width: "100%" }}>
      <LinearGradient colors={btnGradient} style={styles.playBtnVertical}>
        <Text style={styles.playBtnText}>Play</Text>
      </LinearGradient>
    </TouchableOpacity>
  </TouchableOpacity>
);

const GameCardHorizontal = ({
  title,
  bgColor,
  icon,
  onPress,
  gradientColors,
  btnGradient,
}) => (
  <TouchableOpacity
    style={[styles.horizontalCard, { backgroundColor: bgColor }]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <LinearGradient colors={gradientColors} style={styles.cardIconBoxHorizontal}>
      <Ionicons name={icon} size={36} color="#FFF" />
    </LinearGradient>

    <View style={styles.cardInfo}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSub}>Test your skills</Text>
    </View>

    <TouchableOpacity onPress={onPress}>
      <LinearGradient colors={btnGradient} style={styles.playBtnHorizontal}>
        <Text style={styles.playBtnText}>Play</Text>
      </LinearGradient>
    </TouchableOpacity>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EBF8FF" },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 10,
    justifyContent: "center", // จัดให้อยู่กึ่งกลางหน้าจอในแนวตั้งอย่างสมดุล
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFFBEB",
    borderWidth: 3.5,
    borderColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    flexShrink: 0,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  avatarImg: { width: "100%", height: "100%", resizeMode: "cover" },
  textGroup: { marginLeft: 14, flex: 1 },
  nameTag: {
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#BAE6FD",
    alignSelf: "flex-start",
    maxWidth: "100%",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  nameText: { fontWeight: "900", color: "#1E293B", fontSize: 16 },
  levelBadge: {
    backgroundColor: "#FEF3C7",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: "#FCD34D",
  },
  levelText: { fontSize: 11, fontWeight: "900", color: "#D97706" },
  coinBadge: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    flexShrink: 0,
  },
  coinIcon: { width: 22, height: 22 },
  coinText: { marginLeft: 6, fontWeight: "900", color: "#F59E0B", fontSize: 15 },

  // Game Section Layout (จัดกึ่งกลางและสมดุล)
  gameSection: { paddingHorizontal: 20 },
  topRowCards: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  verticalCard: {
    width: "48%",
    borderRadius: 26,
    padding: 20,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    minHeight: 285,
    justifyContent: "space-between",
  },
  horizontalCard: {
    flexDirection: "row",
    borderRadius: 26,
    paddingVertical: 24, // ขยายความหนาของการ์ด Spelling ให้ใหญ่สมส่วน
    paddingHorizontal: 22,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 10,
  },
  cardIconBoxVertical: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.05)",
  },
  cardIconBoxHorizontal: {
    width: 68, // ขยายขนาดกล่องไอคอน Spelling ให้ใหญ่ขึ้นสมดุลกัน
    height: 68,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.05)",
  },
  verticalCardContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  verticalCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#1E293B",
    textAlign: "center",
    marginTop: 6,
  },
  cardInfo: { flex: 1, marginLeft: 4 },
  cardTitle: { fontSize: 18, fontWeight: "900", color: "#1E293B" }, // ขยายฟอนต์ชื่อเกม Spelling ให้ใหญ่ขึ้น
  cardSub: { fontSize: 13, fontWeight: "700", color: "#64748B", marginTop: 3 },
  playBtnVertical: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  playBtnHorizontal: {
    paddingHorizontal: 28, // ขยายปุ่ม Play ของ Spelling ให้กว้างและใหญ่ขึ้น
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  playBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },

  // Navigation Bar
  navBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    justifyContent: "space-around",
    alignItems: "center",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 12, fontWeight: "900", marginTop: 4 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 25, 47, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  guestAlertBox: {
    width: "85%",
    backgroundColor: "#FFF",
    borderRadius: 30,
    padding: 25,
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  alertIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#BAE6FD",
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1E293B",
    marginBottom: 8,
  },
  alertSub: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
    fontWeight: "600",
  },
  alertBtn: {
    backgroundColor: "#0284C7",
    paddingVertical: 12,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
    borderBottomWidth: 4,
    borderBottomColor: "#0369A1",
  },
  alertBtnText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
});

export default HomeScreen;