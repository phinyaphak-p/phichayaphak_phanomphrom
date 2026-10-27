import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  FlatList,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Svg, Circle } from "react-native-svg";
import {
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithCredential,
  linkWithCredential,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  runTransaction,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { LoginManager, AccessToken } from "react-native-fbsdk-next";

GoogleSignin.configure({
  webClientId:
    "614097510744-765el13nk1pf7ne2dc52voor6lkeo70l.apps.googleusercontent.com",
});

const GUEST_STORAGE_KEY = "@guest_game_scores";
const GUEST_PROFILE_KEY = "@guest_profile";

// =============================================================
// GUEST -> ACCOUNT MERGE (only adds or keeps the higher value)
// =============================================================

const LEVEL_ORDER = ["Beginner", "Intermediate", "Advanced"];
const num = (v) => Number(v) || 0;
const maxLevel = (a, b) =>
  LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a;

const dedupeSort = (list, cap = 50) => {
  const seen = new Set();
  return list
    .filter((x) => {
      const k = x?.playedAt;
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((x, y) =>
      String(y?.playedAt || "").localeCompare(String(x?.playedAt || "")),
    )
    .slice(0, cap);
};

const mergeTopic = (a = {}, g = {}) => ({
  accuracy: Math.max(num(a.accuracy), num(g.accuracy)),
  bestScore: Math.max(num(a.bestScore), num(g.bestScore)),
  streak: Math.max(num(a.streak), num(g.streak)),
  avgTime: a.avgTime || g.avgTime || "0s",
  attempts: dedupeSort([...(a.attempts || []), ...(g.attempts || [])]),
});

const mergeWordStats = (a = {}, g = {}) => ({
  accuracy: Math.max(num(a.accuracy), num(g.accuracy)),
  noHint: num(a.noHint) + num(g.noHint),
  hints: num(a.hints) + num(g.hints),
  streak: Math.max(num(a.streak), num(g.streak)),
  attempts: dedupeSort([...(a.attempts || []), ...(g.attempts || [])]),
});

const mergeMaxMap = (a = {}, g = {}) => {
  const out = { ...a };
  Object.entries(g).forEach(([k, v]) => {
    out[k] = Math.max(num(out[k]), num(v));
  });
  return out;
};

const mergeNested = (a = {}, g = {}) => {
  const out = { ...a };
  Object.entries(g).forEach(([k, v]) => {
    out[k] = { ...(out[k] || {}), ...(v || {}) };
  });
  return out;
};

const mergeScores = (a = {}, g = {}) => {
  const out = { ...a };

  out.grammar = { ...(a.grammar || {}) };
  Object.entries(g.grammar || {}).forEach(([lvl, topics]) => {
    out.grammar[lvl] = { ...(out.grammar[lvl] || {}) };
    Object.entries(topics || {}).forEach(([topic, st]) => {
      out.grammar[lvl][topic] = mergeTopic(out.grammar[lvl][topic], st);
    });
  });

  ["crossword", "spelling"].forEach((game) => {
    out[game] = { ...(a[game] || {}) };
    Object.entries(g[game] || {}).forEach(([lvl, st]) => {
      out[game][lvl] = mergeWordStats(out[game][lvl], st);
    });
  });

  const as = a.skillStats || {};
  const gs = g.skillStats || {};
  const skill = { ...as };
  if (!skill.pretest && gs.pretest) skill.pretest = gs.pretest;
  const attempts = dedupeSort([
    ...(as.posttestAttempts || []),
    ...(gs.posttestAttempts || []),
  ]);
  if (attempts.length) {
    skill.posttestAttempts = attempts;
    skill.posttest = `${attempts[0].score}/${attempts[0].total || 20}`;
  }
  out.skillStats = skill;

  return out;
};

let migrating = false;

const migrateGuestData = async (user) => {
  if (migrating) return null;
  migrating = true;
  try {
    const [profileRaw, scoresRaw] = await Promise.all([
      AsyncStorage.getItem(GUEST_PROFILE_KEY),
      AsyncStorage.getItem(GUEST_STORAGE_KEY),
    ]);
    const guest = profileRaw ? JSON.parse(profileRaw) : {};
    const guestScores = scoresRaw ? JSON.parse(scoresRaw) : null;

    if (num(guest.coins) <= 0 && !guestScores) return null;

    const gScores = guestScores ? { ...guestScores } : {};
    if (guest.pretestScore) {
      gScores.skillStats = {
        ...(gScores.skillStats || {}),
        pretest: gScores.skillStats?.pretest || guest.pretestScore,
      };
    }

    const ref = doc(db, "users", user.uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const acc = snap.exists() ? snap.data() : {};

      const merged = {
        coins: num(acc.coins) + num(guest.coins),
        level: maxLevel(acc.level || "Beginner", guest.level || "Beginner"),
        hasCompletedPretest:
          !!acc.hasCompletedPretest || !!guest.hasCompletedPretest,
        scores: mergeScores(acc.scores, gScores),
        unlockedCrosswordLevels: mergeMaxMap(
          acc.unlockedCrosswordLevels,
          guest.unlockedCrosswordLevels,
        ),
        completedCrosswordLevels: {
          ...(acc.completedCrosswordLevels || {}),
          ...(guest.completedCrosswordLevels || {}),
        },
        spellingProgress: mergeNested(
          acc.spellingProgress,
          guest.spellingProgress,
        ),
      };
      if (!acc.avatarId && guest.avatarId) merged.avatarId = guest.avatarId;

      tx.set(ref, merged, { merge: true });
    });

    await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
    await AsyncStorage.setItem(
      GUEST_PROFILE_KEY,
      JSON.stringify({ ...guest, coins: 0 }),
    );

    return { coins: num(guest.coins) };
  } catch (e) {
    console.error("Migrate guest data error:", e);
    return null;
  } finally {
    migrating = false;
  }
};

const getLocalGameScores = async () => {
  try {
    const storedData = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
    if (storedData) return JSON.parse(storedData);
  } catch (error) {
    console.error("Error fetching local scores:", error);
  }
  return {
    grammar: { Beginner: {}, Intermediate: {}, Advanced: {} },
    crossword: {},
    spelling: {},
    battle: {},
    skillStats: {},
  };
};

const AVATAR_LIST = [
  { id: "1", source: require("../../../assets/avatar-1.png") },
  { id: "2", source: require("../../../assets/avatar-2.png") },
  { id: "3", source: require("../../../assets/avatar-3.png") },
  { id: "4", source: require("../../../assets/avatar-4.png") },
  { id: "5", source: require("../../../assets/avatar-5.png") },
  { id: "6", source: require("../../../assets/avatar-6.png") },
];

const GRAMMAR_TOPICS_BY_LEVEL = {
  Beginner: ["Present Simple", "Past Simple", "Future Simple"],
  Intermediate: ["Present Continuous", "Past Continuous", "Future Continuous"],
  Advanced: ["Present Perfect", "Past Perfect", "Future Perfect"],
};

const LEVEL_BADGE = {
  Beginner: { bg: "#FFF3E0", fg: "#E65100" },
  Intermediate: { bg: "#E1F5FE", fg: "#0277BD" },
  Advanced: { bg: "#E8F5E9", fg: "#2E7D32" },
};

const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatDateTime = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} | ${hh}:${mm}`;
};

const levelFromScoreText = (text) => {
  const m = String(text || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m || Number(m[2]) === 0) return null;
  const pct = (Number(m[1]) / Number(m[2])) * 100;
  if (pct >= 80) return "Advanced";
  if (pct >= 50) return "Intermediate";
  return "Beginner";
};

const WORD_STAT_LABELS = {
  noHint: "noHint",
  hints: "hints",
  streak: "streak",
};

const EMPTY_TOPIC = {
  accuracy: 0,
  bestScore: 0,
  avgTime: "0s",
  streak: 0,
  attempts: [],
};

const getFlexibleTopicStats = (levelData, targetTopic) => {
  if (!levelData) return EMPTY_TOPIC;
  if (levelData[targetTopic]) return levelData[targetTopic];
  const targetClean = targetTopic.toLowerCase().replace(/[-_]/g, " ");
  for (const key of Object.keys(levelData)) {
    if (key.toLowerCase().replace(/[-_]/g, " ") === targetClean) {
      return levelData[key];
    }
  }
  return EMPTY_TOPIC;
};

// =============================================================
// SCREEN
// =============================================================

const ProfileScreen = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState("Skill Stats");
  const [activeLevel, setActiveLevel] = useState("Beginner");
  
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedTopicHistory, setSelectedTopicHistory] = useState({
    title: "",
    attempts: [],
  });

  // Game Toast Notification State
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showGameToast = (msg) => {
    setToastMessage(msg);
    setToastVisible(true);
    fadeAnim.setValue(0);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setToastVisible(false);
      });
    }, 2800);
  };

  const [currentAvatar, setCurrentAvatar] = useState(
    require("../../../assets/avatar-1.png"),
  );
  const [userProfile, setUserProfile] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [guestPretest, setGuestPretest] = useState(null);

  const [userScores, setUserScores] = useState({
    grammar: { Beginner: {}, Intermediate: {}, Advanced: {} },
    crossword: {},
    spelling: {},
    battle: {},
    skillStats: {},
  });

  const applyAvatar = (id) => {
    const a = AVATAR_LIST.find((x) => x.id === id);
    if (a) setCurrentAvatar(a.source);
  };

  const pendingCredRef = useRef(null);
  const isConflict = (e) =>
    e?.code === "auth/account-exists-with-different-credential";

  const finishLogin = async (userCred) => {
    const pending = pendingCredRef.current;
    pendingCredRef.current = null;

    let linkedName = null;
    if (pending) {
      try {
        await linkWithCredential(userCred.user, pending.credential);
        linkedName = pending.name;
      } catch (e) {
        console.error("Link credential error:", e);
      }
    }

    const moved = await migrateGuestData(userCred.user);
    setLoginModalVisible(false);

    const msgLines = ["LOGIN SUCCESSFUL!"];
    if (linkedName)
      msgLines.push(`Linked with ${linkedName}`);
    if (moved && moved.coins)
      msgLines.push(`+${moved.coins} Coins Migrated`);

    showGameToast(msgLines.join("\n"));
  };

  const handleGoogleLogin = async () => {
    let credential = null;
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.type === "cancelled") return;
      const idToken = userInfo.data?.idToken || userInfo.idToken;
      if (!idToken) throw new Error("Not found Google ID Token");

      credential = GoogleAuthProvider.credential(idToken);
      const userCred = await signInWithCredential(auth, credential);
      await finishLogin(userCred);
    } catch (error) {
      if (isConflict(error) && credential) {
        pendingCredRef.current = { credential, name: "Google" };
        Alert.alert(
          "Account already exists",
          "This email is already registered with Facebook. Log in with Facebook once, and your Google login will be linked to the same account automatically.",
        );
        return;
      }
      console.error("Google Login Error:", error);
      Alert.alert("Login Failed", error.message);
    }
  };

  const handleFacebookLogin = async () => {
    let credential = null;
    try {
      const result = await LoginManager.logInWithPermissions([
        "public_profile",
        "email",
      ]);
      if (result.isCancelled) return;
      const data = await AccessToken.getCurrentAccessToken();
      if (!data) throw new Error("Unable to get Facebook access token");

      credential = FacebookAuthProvider.credential(data.accessToken);
      const userCred = await signInWithCredential(auth, credential);
      await finishLogin(userCred);
    } catch (error) {
      if (isConflict(error) && credential) {
        pendingCredRef.current = { credential, name: "Facebook" };
        Alert.alert(
          "Account already exists",
          "This email is already registered with Google. Log in with Google once, and your Facebook login will be linked to the same account automatically.",
        );
        return;
      }
      console.error("Facebook Login Error:", error);
      Alert.alert("Login Failed", error.message);
    }
  };

  const loadGuestProfile = async () => {
    setCurrentUserId(null);
    setUserProfile(null);
    const localScores = await getLocalGameScores();
    setUserScores(localScores);

    const raw = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.avatarId) applyAvatar(parsed.avatarId);
    setGuestPretest(parsed.pretestScore || null);
  };

  const fetchProfileData = async () => {
    try {
      if (auth.authStateReady) await auth.authStateReady();
      const currentUser = auth.currentUser;

      if (currentUser && !currentUser.isAnonymous) {
        setCurrentUserId(currentUser.uid);
        setGuestPretest(null);
        const snap = await getDoc(doc(db, "users", currentUser.uid));

        if (snap.exists()) {
          const data = snap.data();
          setUserProfile({
            name: data.name || currentUser.displayName || "Player",
          });
          if (data.scores) setUserScores(data.scores);
          if (data.avatarId) applyAvatar(data.avatarId);
        }
      } else {
        await loadGuestProfile();
      }
    } catch (error) {
      console.error("Error fetching profile data:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setActiveLevel("Beginner");
      fetchProfileData();
    }, []),
  );

  useEffect(() => {
    let unsubSnap = () => {};
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubSnap();
      try {
        if (user && !user.isAnonymous) {
          setCurrentUserId(user.uid);
          setGuestPretest(null);
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(
              ref,
              { name: user.displayName || "Player" },
              { merge: true },
            );
          }
          unsubSnap = onSnapshot(ref, (s) => {
            if (!s.exists()) return;
            const d = s.data();
            setUserProfile({ name: d.name || user.displayName || "Player" });
            if (d.scores) setUserScores(d.scores);
            if (d.avatarId) applyAvatar(d.avatarId);
          });
        } else {
          await loadGuestProfile();
        }
      } catch (e) {
        console.error("Auth state handler error:", e);
      }
    });
    return () => {
      unsubAuth();
      unsubSnap();
    };
  }, []);

  const pretestText = userScores?.skillStats?.pretest || guestPretest || null;
  const pretestLevel = levelFromScoreText(pretestText);

  const getTabStatsData = (tabName) => {
    const key = tabName.toLowerCase();

    if (key === "battle") {
      return (
        userScores?.battle?.general ||
        userScores?.battle || {
          accuracy: 0,
          wins: 0,
          losses: 0,
          bestStreak: 0,
          bestPoints: 0,
          avgTime: "0s",
          attempts: [],
        }
      );
    }

    if (key === "grammar") {
      const grammarData = userScores?.grammar || {};
      return (
        grammarData[activeLevel] || grammarData[activeLevel.toLowerCase()] || {}
      );
    }

    if (key === "crossword" || key === "spelling") {
      const rawData =
        userScores?.[key]?.[activeLevel] ||
        userScores?.[key]?.[activeLevel.toLowerCase()];
      return {
        accuracy: Number(rawData?.accuracy) || 0,
        noHint: Number(rawData?.noHint) || 0,
        hints: Number(rawData?.hints) || 0,
        streak: Number(rawData?.streak) || 0,
        attempts: rawData?.attempts || [],
      };
    }

    return {};
  };

  const handleLogOut = async () => {
    try {
      try {
        await GoogleSignin.signOut();
      } catch {}
      try {
        LoginManager.logOut();
      } catch {}

      await signOut(auth);
      setUserProfile(null);
      setCurrentUserId(null);
      setSettingsModalVisible(false);

      navigation.reset({
        index: 0,
        routes: [{ name: "HomeScreen" }],
      });
    } catch (error) {
      console.error("Logout Error:", error);
      Alert.alert("Error", error.message);
    }
  };

  const confirmLogOut = () =>
    Alert.alert(
      "Log out?",
      "Your progress is saved to your account. You will return to guest mode.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: handleLogOut },
      ],
    );

  const handleSelectAvatar = async (avatar) => {
    setCurrentAvatar(avatar.source);
    setAvatarModalVisible(false);
    try {
      const u = auth.currentUser;
      if (u && !u.isAnonymous) {
        await setDoc(
          doc(db, "users", u.uid),
          { avatarId: avatar.id },
          { merge: true },
        );
      } else {
        const raw = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
        const g = raw ? JSON.parse(raw) : {};
        await AsyncStorage.setItem(
          GUEST_PROFILE_KEY,
          JSON.stringify({ ...g, avatarId: avatar.id }),
        );
      }
    } catch (e) {
      console.error("Save avatar error:", e);
    }
  };

  const SkillStatsView = () => {
    const grammarTopics = GRAMMAR_TOPICS_BY_LEVEL[activeLevel] || [];
    let totalGrammarAcc = 0;
    let playedGrammarCount = 0;

    const levelGrammarData =
      userScores?.grammar?.[activeLevel] ||
      userScores?.grammar?.[activeLevel.toLowerCase()] ||
      {};

    grammarTopics.forEach((topic) => {
      const topicInfo = getFlexibleTopicStats(levelGrammarData, topic);
      if (topicInfo && (topicInfo.accuracy > 0 || topicInfo.bestScore > 0)) {
        totalGrammarAcc += Number(topicInfo.accuracy) || 0;
        playedGrammarCount++;
      }
    });
    const grammarAcc =
      playedGrammarCount > 0
        ? Math.round(totalGrammarAcc / playedGrammarCount)
        : 0;

    const crosswordData =
      userScores?.crossword?.[activeLevel] ||
      userScores?.crossword?.[activeLevel.toLowerCase()];
    const spellingData =
      userScores?.spelling?.[activeLevel] ||
      userScores?.spelling?.[activeLevel.toLowerCase()];

    const crosswordAcc = Number(crosswordData?.accuracy) || 0;
    const spellingAcc = Number(spellingData?.accuracy) || 0;

    let activeSubjectsCount = 0;
    let totalAccSum = 0;
    [grammarAcc, crosswordAcc, spellingAcc].forEach((acc) => {
      if (acc > 0) {
        totalAccSum += acc;
        activeSubjectsCount++;
      }
    });
    const overallAvg =
      activeSubjectsCount > 0
        ? Math.round(totalAccSum / activeSubjectsCount)
        : 0;

    const battleWins =
      userScores?.battle?.general?.wins || userScores?.battle?.wins || 0;
    const battleLosses =
      userScores?.battle?.general?.losses || userScores?.battle?.losses || 0;
    const totalBattles = battleWins + battleLosses;
    const winrate =
      totalBattles > 0 ? Math.round((battleWins / totalBattles) * 100) : 0;

    const posttestScore = userScores?.skillStats?.posttest || "0/20";

    return (
      <View style={styles.statsContent}>
        <View style={styles.overallCard}>
          <Text style={styles.cardTitle}>OVERALL ENGLISH PROGRESS</Text>
          <DonutProgress percent={overallAvg} />
        </View>

        <View style={styles.gridContainer}>
          <StatBox
            icon="trophy"
            color="#FF7043"
            label="Battle Winrate"
            value={`${winrate}%`}
          />
          <StatBox
            icon="book"
            color="#00BCD4"
            label="Grammar"
            value={`${grammarAcc}%`}
          />
          <StatBox
            icon="grid"
            color="#4CAF50"
            label="Crossword"
            value={`${crosswordAcc}%`}
          />
          <StatBox
            icon="pencil"
            color="#FF9800"
            label="Spelling"
            value={`${spellingAcc}%`}
          />
          <StatBox
            icon="clipboard-outline"
            color="#9C27B0"
            label="Pre-Test"
            value={pretestText || "--"}
            badge={
              pretestLevel
                ? { text: pretestLevel, ...LEVEL_BADGE[pretestLevel] }
                : null
            }
          />

          <TouchableOpacity
            style={styles.statBoxClickable}
            activeOpacity={0.8}
            onPress={() => {
              const posttestAttempts =
                userScores?.skillStats?.posttestAttempts || [];
              setSelectedTopicHistory({
                title: "Post-Test History",
                attempts: posttestAttempts,
              });
              setHistoryModalVisible(true);
            }}
          >
            <View style={styles.statBoxTopRow}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color="#0288D1"
              />
              <View style={styles.historyBadgeMini}>
                <Ionicons name="time-outline" size={10} color="#0288D1" />
                <Text style={styles.historyBadgeText}> Logs</Text>
              </View>
            </View>
            <Text style={styles.statBoxValue}>{posttestScore}</Text>
            <Text style={styles.statBoxLabel}>Post-Test (Tap)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* GAME TOAST NOTIFICATION (BOTTOM CENTER, CLEAN TEXT) */}
      {toastVisible && (
        <Animated.View style={[styles.gameToastContainer, { opacity: fadeAnim }]}>
          <View style={styles.gameToastCard}>
            <Text style={styles.gameToastTitle}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}

      <View style={styles.topHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.circleBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#0288D1" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PROFILE</Text>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => setSettingsModalVisible(true)}
        >
          <Ionicons name="settings-outline" size={24} color="#546E7A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Image source={currentAvatar} style={styles.avatarImg} />
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => setAvatarModalVisible(true)}
            >
              <Ionicons name="pencil" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfo}>
            <View style={styles.levelHeaderRow}>
              <View style={styles.levelLabel}>
                <Text style={styles.levelLabelText}>
                  {pretestLevel || "Beginner"}
                </Text>
              </View>
            </View>

            {currentUserId && userProfile ? (
              <View style={{ marginTop: 6 }}>
                <Text style={styles.userNameText} numberOfLines={1}>
                  {userProfile.name}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      "Cloud Synced",
                      "Your progress is saved to your account automatically.",
                    )
                  }
                >
                  <Text style={styles.syncBadgeText}>Cloud Synced</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setLoginModalVisible(true)}
                style={{ marginTop: 6 }}
              >
                <Text style={styles.syncTextLarge}>Login to Sync Data</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
        >
          {["Skill Stats", "Grammar", "Crossword", "Spelling", "Battle"].map(
            (tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tabItem,
                  activeTab === tab && styles.tabItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab && styles.tabTextActive,
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </ScrollView>

        {activeTab === "Skill Stats" ? (
          <SkillStatsView />
        ) : (
          <DetailStatsView
            type={activeTab}
            data={getTabStatsData(activeTab)}
            activeLevel={activeLevel}
            setActiveLevel={setActiveLevel}
            onOpenHistory={(topicTitle, attempts) => {
              setSelectedTopicHistory({
                title: topicTitle,
                attempts: attempts || [],
              });
              setHistoryModalVisible(true);
            }}
          />
        )}
      </ScrollView>

      {/* GAME-STYLE VIBRANT POPUP HISTORY MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={historyModalVisible}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.gameModalOverlay}>
          <View style={styles.gamePopupCard}>
            {/* Close Button X */}
            <TouchableOpacity
              onPress={() => setHistoryModalVisible(false)}
              style={styles.gameCloseBtn}
            >
              <Ionicons name="close" size={20} color="#FF5252" />
            </TouchableOpacity>

            {/* Header Icon & Title */}
            <View style={styles.gamePopupHeader}>
              <View style={styles.gameHeaderIconBadge}>
                <Ionicons name="stats-chart" size={24} color="#0288D1" />
              </View>
              <Text style={styles.gamePopupTitle}>
                {selectedTopicHistory.title}
              </Text>
              <Text style={styles.gamePopupSub}>
                BATTLE & ATTEMPT RECORDS
              </Text>
            </View>

            <View style={styles.gameDivider} />

            {selectedTopicHistory.title === "Post-Test History" && (
              <View style={styles.criteriaInfoBox}>
                <Text style={styles.criteriaBoxHeader}>Rank Criteria</Text>
                <View style={styles.criteriaRowList}>
                  <Text style={styles.criteriaBullet}>
                    • <Text style={{ fontWeight: "bold", color: "#FF9800" }}>Beginner:</Text> below 50% (&lt; 10/20)
                  </Text>
                  <Text style={styles.criteriaBullet}>
                    • <Text style={{ fontWeight: "bold", color: "#00BCD4" }}>Intermediate:</Text> 50%-79% (10-15)
                  </Text>
                  <Text style={styles.criteriaBullet}>
                    • <Text style={{ fontWeight: "bold", color: "#4CAF50" }}>Advanced:</Text> 80%+ (16+)
                  </Text>
                </View>
              </View>
            )}

            {selectedTopicHistory.attempts.length === 0 ? (
              <View style={styles.gameEmptyBox}>
                <View style={styles.emptyIconBg}>
                  <Ionicons name="stats-chart-outline" size={32} color="#0288D1" />
                </View>
                <Text style={styles.gameEmptyText}>No attempt records found yet!</Text>
                <Text style={styles.gameEmptySub}>Jump into a game session to set your high score!</Text>
              </View>
            ) : (
              <FlatList
                data={selectedTopicHistory.attempts}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item, index }) => {
                  const dateObj = item.playedAt
                    ? new Date(item.playedAt)
                    : new Date();
                  const dateStr = `${dateObj.toLocaleDateString()} • ${dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                  
                  const isPost = selectedTopicHistory.title === "Post-Test History";
                  const isBattleLog = selectedTopicHistory.title === "Battle History";
                  let scoreText;

                  if (isPost) {
                    scoreText = `Score: ${item.score}/${item.total || 20}`;
                  } else if (item.total) {
                    scoreText = `Score: ${item.score}/${item.total}`;
                  } else if (isBattleLog) {
                    scoreText =
                      item.score !== undefined
                        ? `Score: ${item.score}`
                        : `Accuracy: ${Number(item.accuracy) || 0}%`;
                  } else if (item.score !== undefined) {
                    const s = Math.round(((Number(item.accuracy) || 0) / 100) * 10);
                    scoreText = `Score: ${s}/10`;
                  } else {
                    scoreText = `Accuracy: ${Number(item.accuracy) || 0}%`;
                  }

                  return (
                    <View style={styles.gameRecordRow}>
                      <View style={styles.gameRecordRankBadge}>
                        <Text style={styles.gameRecordRankText}>#{selectedTopicHistory.attempts.length - index}</Text>
                      </View>
                      <View style={styles.gameRecordInfo}>
                        <Text style={styles.gameRecordScore}>{scoreText}</Text>
                        <Text style={styles.gameRecordDate}>{dateStr}</Text>
                        {item.points !== undefined && (
                          <Text style={styles.gameRecordExtra}>Points: {item.points}</Text>
                        )}
                        <View style={styles.gameRecordExtraRow}>
                          {item.level && (
                            <View style={styles.tagBadge}>
                              <Text style={styles.tagBadgeText}>Level: {item.level}</Text>
                            </View>
                          )}
                          {item.avgTime && (
                            <View style={[styles.tagBadge, { backgroundColor: "#FFF3E0", borderColor: "#FFE0B2" }]}>
                              <Text style={[styles.tagBadgeText, { color: "#F57C00" }]}>⏱ {item.avgTime}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.gameRecordStar}>
                        <Ionicons name="trending-up" size={18} color="#0288D1" />
                      </View>
                    </View>
                  );
                }}
                contentContainerStyle={{ paddingBottom: 6 }}
                style={{ maxHeight: 320 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* AVATAR PICKER MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={avatarModalVisible}
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <View style={styles.modalCenteredOverlay}>
          <View style={styles.avatarPickerCard}>
            <Text style={styles.pickerTitle}>Choose Your Avatar</Text>
            <Text style={styles.pickerSubTitle}>
              Select a character for your profile
            </Text>
            <View style={styles.avatarGrid}>
              {AVATAR_LIST.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  style={[
                    styles.avatarGridItem,
                    currentAvatar === avatar.source &&
                      styles.avatarGridItemActive,
                  ]}
                  onPress={() => handleSelectAvatar(avatar)}
                >
                  <Image source={avatar.source} style={styles.gridAvatarImg} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setAvatarModalVisible(false)}
              style={styles.cancelPickerBtn}
            >
              <Text style={styles.cancelPickerText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* LOGIN MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={loginModalVisible}
        onRequestClose={() => setLoginModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loginCard}>
            <View style={styles.modalKnob} />
            <TouchableOpacity
              onPress={() => setLoginModalVisible(false)}
              style={styles.closeSheetBtn}
            >
              <Ionicons name="close-circle" size={28} color="#BDBDBD" />
            </TouchableOpacity>
            <Text style={styles.loginTitle}>Log in to Sync Data</Text>
            <Text style={styles.loginSubTitle}>
              Save your English learning progress permanently to cloud servers.
            </Text>

            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: "#1877F2" }]}
              onPress={handleFacebookLogin}
            >
              <Ionicons
                name="logo-facebook"
                size={22}
                color="#FFF"
                style={styles.socialIcon}
              />
              <Text style={styles.socialBtnText}>Continue with Facebook</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.socialBtn,
                {
                  backgroundColor: "#FFF",
                  borderWidth: 1,
                  borderColor: "#E0E0E0",
                  marginTop: 12,
                },
              ]}
              onPress={handleGoogleLogin}
            >
              <Ionicons
                name="logo-google"
                size={20}
                color="#EA4335"
                style={styles.socialIcon}
              />
              <Text style={[styles.socialBtnText, { color: "#3F4254" }]}>
                Continue with Google
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SETTINGS MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={settingsModalVisible}
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.settingsCardSheet}>
            <View style={styles.modalKnob} />
            <Text style={styles.settingsSheetTitle}>Settings</Text>
            <View style={styles.divider} />
            {currentUserId ? (
              <TouchableOpacity
                onPress={confirmLogOut}
                style={styles.logoutBtnSheet}
              >
                <Ionicons name="log-out-outline" size={20} color="#D32F2F" />
                <Text style={styles.logoutTextSheet}>Log Out Account</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.noHistoryText}>
                You are playing as a guest.
              </Text>
            )}
            <TouchableOpacity
              onPress={() => setSettingsModalVisible(false)}
              style={styles.closeSettingsBtnSheet}
            >
              <Text style={styles.closeSettingsText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// =============================================================
// SMALL COMPONENTS
// =============================================================

const DonutProgress = ({ percent }) => {
  const size = 130;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(Math.max(Number(percent) || 0, 0), 100);
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle
          stroke="#FEF3C7"
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke="#F59E0B"
          fill="none"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ justifyContent: "center", alignItems: "center" }}>
        <Text style={styles.chartPercent}>{clampedPercent}%</Text>
        <Text style={styles.chartSub}>Accuracy</Text>
      </View>
    </View>
  );
};

const StatBox = ({ icon, color, label, value, badge }) => (
  <View style={styles.statBox}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={styles.statBoxValue}>{value}</Text>
    <Text style={styles.statBoxLabel}>{label}</Text>
    {badge ? (
      <View style={[styles.levelPill, { backgroundColor: badge.bg }]}>
        <Text style={[styles.levelPillText, { color: badge.fg }]}>
          {badge.text}
        </Text>
      </View>
    ) : null}
  </View>
);

const DetailStatsView = ({
  type,
  data,
  activeLevel,
  setActiveLevel,
  onOpenHistory,
}) => {
  const isGrammar = type === "Grammar";
  const isBattle = type === "Battle";
  const isCrosswordOrSpelling = type === "Crossword" || type === "Spelling";

  const topicsToDisplay = isGrammar
    ? GRAMMAR_TOPICS_BY_LEVEL[activeLevel] || []
    : [];

  let overallAcc = 0;
  if (isGrammar) {
    let total = 0;
    let count = 0;
    topicsToDisplay.forEach((topic) => {
      const topicStats = getFlexibleTopicStats(data, topic);
      if (topicStats && (topicStats.accuracy > 0 || topicStats.bestScore > 0)) {
        total += Number(topicStats.accuracy) || 0;
        count++;
      }
    });
    overallAcc = count > 0 ? Math.round(total / count) : 0;
  } else if (isBattle) {
    const wins = Number(data?.wins) || 0;
    const losses = Number(data?.losses) || 0;
    const totalBattles = wins + losses;
    overallAcc = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;
  } else {
    overallAcc = Number(data?.accuracy) || 0;
  }

  return (
    <View style={styles.statsContent}>
      {!isBattle && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subLevelScrollContainer}
          style={styles.subLevelBarScroll}
        >
          {["Beginner", "Intermediate", "Advanced"].map((lvl) => (
            <TouchableOpacity
              key={lvl}
              onPress={() => setActiveLevel(lvl)}
              style={[
                styles.subLvlItemNew,
                activeLevel === lvl && styles.subLvlActiveNew,
              ]}
            >
              <Text
                style={[
                  styles.subLvlTextNew,
                  activeLevel === lvl && styles.subLvlTextActiveNew,
                ]}
              >
                {lvl}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.overallCard}>
        <Text style={styles.cardTitle}>{isBattle ? "BATTLE ACCURACY" : `${type.toUpperCase()} ACCURACY`}</Text>
        <DonutProgress percent={overallAcc} />

        {(isCrosswordOrSpelling || isBattle) && (
          <TouchableOpacity
            style={styles.gameHistoryBtnCompact}
            activeOpacity={0.85}
            onPress={() => onOpenHistory(isBattle ? "Battle History" : `${type} History (${activeLevel})`, data?.attempts)}
          >
            <Ionicons name="trending-up" size={16} color="#0288D1" />
            <Text style={styles.gameHistoryBtnTextCompact}>
              View History ({data?.attempts?.length || 0})
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#0288D1" />
          </TouchableOpacity>
        )}
      </View>

      {isGrammar ? (
        <View style={{ width: "100%" }}>
          <Text style={styles.sectionHeader}>
            Grammar Topics ({activeLevel})
          </Text>
          {topicsToDisplay.map((topicName) => {
            const topicStats = getFlexibleTopicStats(data, topicName);
            return (
              <View key={topicName} style={styles.topicCard}>
                <View style={styles.topicHeaderRow}>
                  <Text style={styles.topicTitle}>{topicName}</Text>
                  <View style={styles.accuracyBadge}>
                    <Text style={styles.accuracyText}>
                      {Number(topicStats.accuracy) || 0}%
                    </Text>
                  </View>
                </View>
                <View style={styles.topicStatsGrid}>
                  <View style={styles.topicStatItem}>
                    <Text style={styles.topicStatKey}>BEST SCORE</Text>
                    <Text style={styles.topicStatVal}>
                      {Number(topicStats.bestScore) || 0}
                    </Text>
                  </View>
                  <View style={styles.topicStatItem}>
                    <Text style={styles.topicStatKey}>AVG TIME</Text>
                    <Text style={styles.topicStatVal}>
                      {topicStats.avgTime || "0s"}
                    </Text>
                  </View>
                  <View style={styles.topicStatItem}>
                    <Text style={styles.topicStatKey}>STREAK</Text>
                    <Text style={styles.topicStatVal}>
                      {Number(topicStats.streak) || 0}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.gameHistoryBtnCompact}
                  activeOpacity={0.85}
                  onPress={() => onOpenHistory(topicName, topicStats.attempts)}
                >
                  <Ionicons name="trending-up" size={16} color="#0288D1" />
                  <Text style={styles.gameHistoryBtnTextCompact}>
                    View History ({topicStats.attempts?.length || 0})
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#0288D1" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : isBattle ? (
        <View style={styles.detailList}>
          <View style={styles.detailItem}>
            <Text style={styles.detailKey}>WINS</Text>
            <Text style={styles.detailVal}>{Number(data?.wins) || 0}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailKey}>LOSSES</Text>
            <Text style={styles.detailVal}>{Number(data?.losses) || 0}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailKey}>BEST STREAK</Text>
            <Text style={styles.detailVal}>{Number(data?.bestStreak) || 0}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailKey}>BEST SCORE</Text>
            <Text style={styles.detailVal}>{Number(data?.bestPoints) || 0}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailKey}>AVG TIME</Text>
            <Text style={styles.detailVal}>{data?.avgTime || "0s"}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.detailList}>
          {Object.keys(WORD_STAT_LABELS).map((k) => (
            <View key={k} style={styles.detailItem}>
              <Text style={styles.detailKey}>{WORD_STAT_LABELS[k]}</Text>
              <Text style={styles.detailVal}>{Number(data?.[k]) || 0}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// =============================================================
// STYLES
// =============================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EBF8FF" },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#0F172A", letterSpacing: 1 },
  circleBtn: {
    width: 45,
    height: 45,
    backgroundColor: "#FFF",
    borderRadius: 22.5,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  profileCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3.5,
    borderColor: "#FFD700",
    padding: 3,
    position: "relative",
    backgroundColor: "#FFFBEB",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: 40 },
  editBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#F59E0B",
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInfo: { marginLeft: 16, flex: 1 },
  levelHeaderRow: { flexDirection: "row", alignItems: "center" },
  levelLabel: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FCD34D",
  },
  levelLabelText: { color: "#D97706", fontSize: 11, fontWeight: "900" },
  syncTextLarge: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0284C7",
    marginTop: 6,
  },
  userNameText: { fontSize: 18, fontWeight: "900", color: "#1E293B" },
  syncBadgeText: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "800",
    marginTop: 3,
  },
  tabBar: { paddingLeft: 20, marginBottom: 18 },
  tabItem: {
    marginRight: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#E0F2FE",
    borderWidth: 2,
    borderColor: "#BAE6FD",
  },
  tabItemActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0369A1",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: { fontSize: 14, color: "#0369A1", fontWeight: "900" },
  tabTextActive: { color: "#FFF" },
  statsContent: { paddingHorizontal: 20 },
  overallCard: {
    backgroundColor: "#FFF",
    padding: 22,
    borderRadius: 26,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 3,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0369A1",
    marginBottom: 14,
    letterSpacing: 1,
  },
  chartPercent: { fontSize: 26, fontWeight: "900", color: "#0F172A" },
  chartSub: { fontSize: 10, fontWeight: "800", color: "#64748B", marginTop: 2 },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statBox: {
    backgroundColor: "#FFF",
    width: "48%",
    padding: 16,
    borderRadius: 22,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2.5,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  statBoxValue: { fontSize: 20, fontWeight: "900", color: "#1E293B", marginVertical: 4 },
  statBoxLabel: { fontSize: 11, fontWeight: "800", color: "#64748B" },
  levelPill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  levelPillText: { fontSize: 10, fontWeight: "bold" },
  statBoxClickable: {
    backgroundColor: "#FFF",
    width: "48%",
    padding: 16,
    borderRadius: 22,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2.5,
    borderColor: "#38BDF8",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  statBoxTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyBadgeMini: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  historyBadgeText: { fontSize: 9, fontWeight: "900", color: "#0288D1" },

  subLevelBarScroll: { marginBottom: 16 },
  subLevelScrollContainer: {
    backgroundColor: "#E0F2FE",
    borderRadius: 18,
    padding: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    borderWidth: 2,
    borderColor: "#BAE6FD",
  },
  subLvlItemNew: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 2,
  },
  subLvlActiveNew: {
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#0284C7",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  subLvlTextNew: { color: "#0284C7", fontWeight: "900", fontSize: 12 },
  subLvlTextActiveNew: { color: "#0369A1" },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "900",
    color: "#1E293B",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  topicCard: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2.5,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  topicHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  topicTitle: { fontSize: 16, fontWeight: "900", color: "#1E293B" },
  accuracyBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#BAE6FD",
  },
  accuracyText: { fontSize: 13, fontWeight: "900", color: "#0284C7" },
  topicStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 2,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
  },
  topicStatItem: { alignItems: "center", paddingVertical: 4 },
  topicStatKey: { fontSize: 10, fontWeight: "900", color: "#64748B" },
  topicStatVal: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    marginTop: 2,
  },

  gameHistoryBtnCompact: {
    marginTop: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#BAE6FD",
    width: "100%",
  },
  gameHistoryBtnTextCompact: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    fontWeight: "800",
    color: "#0369A1",
  },

  gameToastContainer: {
    position: "absolute",
    bottom: 40,
    left: 30,
    right: 30,
    zIndex: 9999,
    alignItems: "center",
  },
  gameToastCard: {
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  gameToastTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FCD34D",
    textAlign: "center",
    letterSpacing: 1,
  },

  gameModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 25, 47, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  gamePopupCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 22,
    position: "relative",
    borderWidth: 4,
    borderColor: "#4FC3F7",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
  },
  gameCloseBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    backgroundColor: "#FFEBEE",
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#FFCDD2",
  },
  gamePopupHeader: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  gameHeaderIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFF8E1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  gamePopupTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1E293B",
    textAlign: "center",
  },
  gamePopupSub: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0288D1",
    letterSpacing: 1,
    marginTop: 2,
  },
  gameDivider: {
    height: 2,
    backgroundColor: "#E1F5FE",
    marginVertical: 12,
    width: "100%",
  },
  gameEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF8E1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#FFE082",
  },
  gameEmptyText: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 14,
    marginTop: 4,
  },
  gameEmptySub: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  gameRecordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  gameRecordRankBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#E0F7FA",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: "#B2EBF2",
  },
  gameRecordRankText: {
    color: "#00838F",
    fontWeight: "900",
    fontSize: 12,
  },
  gameRecordInfo: {
    flex: 1,
  },
  gameRecordScore: {
    fontSize: 15,
    fontWeight: "900",
    color: "#2E7D32",
  },
  gameRecordDate: {
    fontSize: 10,
    color: "#78909C",
    marginTop: 2,
    fontWeight: "700",
  },
  gameRecordExtra: {
    fontSize: 11,
    color: "#D97706",
    fontWeight: "900",
    marginTop: 2,
  },
  gameRecordExtraRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
    gap: 6,
  },
  tagBadge: {
    backgroundColor: "#E1F5FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B3E5FC",
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0288D1",
  },
  gameRecordStar: {
    paddingLeft: 6,
  },

  criteriaInfoBox: {
    backgroundColor: "#FFFDE7",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#FFF59D",
  },
  criteriaBoxHeader: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F57F17",
    marginBottom: 4,
  },
  criteriaRowList: { paddingLeft: 2 },
  criteriaBullet: { fontSize: 11, color: "#616161", fontWeight: "700", marginVertical: 1 },

  detailList: { marginBottom: 20 },
  detailItem: {
    backgroundColor: "#FFF",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 2.5,
    borderColor: "#BAE6FD",
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailKey: { color: "#0369A1", fontWeight: "900", fontSize: 12 },
  detailVal: { color: "#0F172A", fontWeight: "900", fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalKnob: {
    width: 45,
    height: 5,
    backgroundColor: "#E0E0E0",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 15,
  },
  loginCard: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
    alignItems: "center",
  },
  closeSheetBtn: { position: "absolute", right: 20, top: 20 },
  loginTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
    marginBottom: 5,
  },
  loginSubTitle: {
    fontSize: 13,
    color: "#757575",
    textAlign: "center",
    marginBottom: 25,
  },
  socialBtn: {
    width: "100%",
    flexDirection: "row",
    padding: 14,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  socialIcon: { marginRight: 10 },
  socialBtnText: { fontSize: 15, fontWeight: "bold", color: "#FFF" },
  settingsCardSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
  },
  settingsSheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginBottom: 15,
    width: "100%",
  },
  logoutBtnSheet: {
    flexDirection: "row",
    backgroundColor: "#FFEBEE",
    padding: 15,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  logoutTextSheet: {
    color: "#D32F2F",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 8,
  },
  closeSettingsBtnSheet: {
    backgroundColor: "#F5F5F5",
    padding: 15,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  closeSettingsText: { color: "#616161", fontWeight: "bold", fontSize: 15 },

  modalCenteredOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPickerCard: {
    width: "85%",
    backgroundColor: "#FFF",
    borderRadius: 25,
    padding: 20,
    alignItems: "center",
  },
  pickerTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  pickerSubTitle: { fontSize: 12, color: "#757575", marginBottom: 15 },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 15,
  },
  avatarGridItem: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    margin: 8,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
  },
  avatarGridItemActive: { borderColor: "#FFD700", borderWidth: 3 },
  gridAvatarImg: { width: "100%", height: "100%" },
  cancelPickerBtn: {
    backgroundColor: "#EEEEEE",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 15,
  },
  cancelPickerText: { color: "#616161", fontWeight: "bold" },

  wordRecordCard: {
  backgroundColor: "#F8FAFC",
  padding: 14,
  borderRadius: 18,
  marginBottom: 10,
  borderWidth: 2,
  borderColor: "#E2E8F0",
},
wordRecordDate: {
  fontSize: 12,
  fontWeight: "900",
  color: "#0369A1",
  marginBottom: 6,
},
wordRecordLine: {
  fontSize: 13,
  fontWeight: "700",
  color: "#475569",
  marginTop: 2,
},
wordRecordVal: { fontWeight: "900", color: "#0F172A" },
});

export default ProfileScreen;