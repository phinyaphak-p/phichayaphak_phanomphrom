import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  FlatList,
  Image,
  Dimensions,
} from "react-native";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  where,
  runTransaction,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { BATTLE_QUESTION_BANK } from "./battleData";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const AVATAR_LIST = [
  { id: "1", source: require("../../../assets/avatar-1.png") },
  { id: "2", source: require("../../../assets/avatar-2.png") },
  { id: "3", source: require("../../../assets/avatar-3.png") },
  { id: "4", source: require("../../../assets/avatar-4.png") },
  { id: "5", source: require("../../../assets/avatar-5.png") },
  { id: "6", source: require("../../../assets/avatar-6.png") },
];

// ---------- Config ----------
const SEARCH_SECONDS = 10;
const INVITE_SECONDS = 8;
const ROOM_FRESH_MS = 60000;
const QUESTIONS_PER_MATCH = 10;
const HEARTBEAT_MS = 15000;
const PRESENCE_TIMEOUT_MS = 45000;
const SIDEBAR_W = 190;
const TOGGLE_W = 26;

const shuffle = (arr) => [...arr].sort(() => 0.5 - Math.random());
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const fmt = (n) => Number(n || 0).toLocaleString("en-US");

const readPst = (stats) => {
  if (stats.totalPoints != null) return Number(stats.totalPoints) || 0;
  return Array.isArray(stats.attempts)
    ? stats.attempts.reduce((s, a) => s + (Number(a.points) || 0), 0)
    : 0;
};

const PODIUM = {
  1: { color: "#FBBF24", height: 112, icon: "crown", avatar: 68 },
  2: { color: "#CBD5E1", height: 84, icon: "medal", avatar: 54 },
  3: { color: "#F59E0B", height: 68, icon: "medal", avatar: 54 },
};

// ---------- Podium (อันดับ 1-3 มีแสงเรืองและ animation ดั้งเดิม) ----------
const PodiumSpot = ({ player, place, isMe, getAvatarSource }) => {
  const cfg = PODIUM[place];
  const ring = cfg.avatar + 10;
  const halo = ring + 12;
  const glow = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 50,
      delay: place === 1 ? 250 : place === 2 ? 0 : 120,
      useNativeDriver: true,
    }).start();
    const dur = 850 + place * 150;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: dur,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const haloScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });
  const haloOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.65],
  });
  const crownY = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  const blockY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [cfg.height, 0],
  });

  return (
    <View style={styles.podiumCol}>
      {player ? (
        <>
          <Animated.View style={{ transform: [{ translateY: crownY }] }}>
            <MaterialCommunityIcons
              name={cfg.icon}
              size={place === 1 ? 30 : 22}
              color={cfg.color}
              style={{
                marginBottom: 3,
                textShadowColor: cfg.color,
                textShadowRadius: 10,
                textShadowOffset: { width: 0, height: 0 },
              }}
            />
          </Animated.View>
          <View style={styles.podiumAvatarWrap}>
            <Animated.View
              style={{
                position: "absolute",
                width: halo,
                height: halo,
                borderRadius: halo / 2,
                backgroundColor: cfg.color,
                opacity: haloOpacity,
                transform: [{ scale: haloScale }],
              }}
            />
            <View
              style={[
                styles.podiumAvatarRing,
                {
                  borderColor: cfg.color,
                  width: ring,
                  height: ring,
                  borderRadius: ring / 2,
                  shadowColor: cfg.color,
                },
              ]}
            >
              <Image
                source={getAvatarSource(player.avatarId)}
                style={{
                  width: cfg.avatar,
                  height: cfg.avatar,
                  borderRadius: cfg.avatar / 2,
                }}
              />
            </View>
            {place === 1 && (
              <>
                <Animated.View
                  style={[
                    styles.sparkle,
                    { top: -2, left: -6, opacity: haloOpacity },
                  ]}
                >
                  <Ionicons name="sparkles" size={14} color="#FDE68A" />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.sparkle,
                    { bottom: 4, right: -6, opacity: haloOpacity },
                  ]}
                >
                  <Ionicons name="star" size={10} color="#FDE68A" />
                </Animated.View>
              </>
            )}
          </View>
          <Text
            style={[styles.podiumName, isMe && { color: "#38BDF8" }]}
            numberOfLines={1}
          >
            {player.name}
          </Text>
          <Text style={[styles.podiumWins, { color: cfg.color }]}>
            {fmt(player.pst)} PST
          </Text>
        </>
      ) : (
        <>
          <View style={{ height: place === 1 ? 34 : 24 }} />
          <View
            style={[
              styles.podiumAvatarRing,
              {
                borderColor: "#475569",
                width: ring,
                height: ring,
                borderRadius: ring / 2,
              },
            ]}
          >
            <FontAwesome5 name="user" size={18} color="#64748B" />
          </View>
          <Text style={styles.podiumName}>-</Text>
          <Text style={styles.podiumWins}> </Text>
        </>
      )}
      <Animated.View
        style={[
          styles.podiumBlock,
          {
            height: cfg.height,
            backgroundColor: player ? cfg.color : "#334155",
            shadowColor: cfg.color,
            opacity: enter,
            transform: [{ translateY: blockY }],
          },
        ]}
      >
        <View style={styles.podiumShine} />
        <Text style={styles.podiumPlace}>{place}</Text>
      </Animated.View>
    </View>
  );
};

const VS_ANGLE = -9;

const VsScreen = ({ me, opponent, getAvatarSource }) => {
  const { width: W, height: H } = Dimensions.get("window");
  const gold = useRef(new Animated.Value(0)).current;
  const blue = useRef(new Animated.Value(0)).current;
  const cardA = useRef(new Animated.Value(0)).current;
  const cardB = useRef(new Animated.Value(0)).current;
  const vs = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const out = {
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    };
    Animated.sequence([
      Animated.parallel([
        Animated.timing(gold, { toValue: 1, duration: 450, ...out }),
        Animated.timing(blue, { toValue: 1, duration: 450, ...out }),
      ]),
      Animated.parallel([
        Animated.spring(vs, {
          toValue: 1,
          friction: 4,
          tension: 110,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(flash, {
            toValue: 1,
            duration: 70,
            useNativeDriver: true,
          }),
          Animated.timing(flash, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }),
        ]),
        Animated.stagger(140, [
          Animated.spring(cardA, {
            toValue: 1,
            friction: 6,
            tension: 60,
            useNativeDriver: true,
          }),
          Animated.spring(cardB, {
            toValue: 1,
            friction: 6,
            tension: 60,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const goldX = gold.interpolate({
    inputRange: [0, 1],
    outputRange: [-W * 1.6, 0],
  });
  const blueX = blue.interpolate({
    inputRange: [0, 1],
    outputRange: [W * 1.2, 0],
  });
  const aX = cardA.interpolate({ inputRange: [0, 1], outputRange: [-W, 0] });
  const bX = cardB.interpolate({ inputRange: [0, 1], outputRange: [W, 0] });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });
  const slashGlow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.9],
  });
  const vsRotate = vs.interpolate({
    inputRange: [0, 1],
    outputRange: ["-25deg", "0deg"],
  });

  const stripes = [0, 1, 2, 3, 4, 5];

  return (
    <View style={vsStyles.root}>
      <Animated.View
        style={[vsStyles.blue, { transform: [{ translateX: blueX }] }]}
      >
        <View style={vsStyles.blueGlow} />
        {stripes.map((i) => (
          <View
            key={i}
            style={[
              vsStyles.stripe,
              {
                left: i * W * 0.3 - 30,
                backgroundColor: "rgba(147,197,253,0.10)",
                height: H * 1.6,
                top: -H * 0.3,
              },
            ]}
          />
        ))}
      </Animated.View>

      <Animated.View
        style={[
          vsStyles.gold,
          {
            width: W * 2,
            height: H,
            left: -W / 2,
            top: -H / 2,
            transform: [{ translateX: goldX }, { rotate: `${VS_ANGLE}deg` }],
          },
        ]}
      >
        {stripes.map((i) => (
          <View
            key={i}
            style={[
              vsStyles.stripe,
              {
                left: W * 0.2 + i * W * 0.28,
                backgroundColor: "rgba(255,255,255,0.14)",
                height: H * 1.6,
                top: -H * 0.3,
              },
            ]}
          />
        ))}
        <Animated.View style={[vsStyles.slashGlow, { opacity: slashGlow }]} />
      </Animated.View>

      <Animated.View
        style={[vsStyles.cardTop, { transform: [{ translateX: aX }] }]}
      >
        <View
          style={[
            vsStyles.avatar,
            { borderColor: "#FEF3C7", shadowColor: "#FBBF24" },
          ]}
        >
          <Image
            source={getAvatarSource(me.avatarId)}
            style={vsStyles.avatarImg}
          />
        </View>
        <View style={{ marginLeft: 16, flexShrink: 1 }}>
          <View style={[vsStyles.tag, { backgroundColor: "#78350F" }]}>
            <Text style={[vsStyles.tagText, { color: "#FDE68A" }]}>YOU</Text>
          </View>
          <Text style={vsStyles.nameGold} numberOfLines={1}>
            {me.name}
          </Text>
        </View>
      </Animated.View>

      <Animated.View
        style={[vsStyles.cardBottom, { transform: [{ translateX: bX }] }]}
      >
        <View
          style={{ marginRight: 16, flexShrink: 1, alignItems: "flex-end" }}
        >
          <View style={[vsStyles.tag, { backgroundColor: "#1E3A8A" }]}>
            <Text style={[vsStyles.tagText, { color: "#BFDBFE" }]}>
              OPPONENT
            </Text>
          </View>
          <Text style={vsStyles.nameBlue} numberOfLines={1}>
            {opponent.name}
          </Text>
        </View>
        <View
          style={[
            vsStyles.avatar,
            { borderColor: "#BFDBFE", shadowColor: "#3B82F6" },
          ]}
        >
          <Image
            source={getAvatarSource(opponent.avatarId)}
            style={vsStyles.avatarImg}
          />
        </View>
      </Animated.View>

      <View style={vsStyles.vsWrap} pointerEvents="none">
        <Animated.View
          style={[
            vsStyles.vsHalo,
            { opacity: haloOpacity, transform: [{ scale: haloScale }] },
          ]}
        />
        <Animated.View
          style={{ transform: [{ scale: vs }, { rotate: vsRotate }] }}
        >
          <View style={vsStyles.vsDiamond}>
            <Text style={vsStyles.vsText}>VS</Text>
          </View>
        </Animated.View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[vsStyles.flash, { opacity: flash }]}
      />
    </View>
  );
};

const vsStyles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0B1026",
    zIndex: 9999,
    overflow: "hidden",
  },
  blue: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#1D4ED8",
    overflow: "hidden",
  },
  blueGlow: {
    position: "absolute",
    bottom: -120,
    right: -80,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(56,189,248,0.35)",
  },
  gold: {
    position: "absolute",
    backgroundColor: "#F59E0B",
    borderBottomWidth: 7,
    borderBottomColor: "#FFF7CC",
    overflow: "visible",
  },
  stripe: {
    position: "absolute",
    width: 34,
    transform: [{ rotate: "22deg" }],
  },
  slashGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -16,
    height: 16,
    backgroundColor: "rgba(255,247,204,0.55)",
  },
  cardTop: {
    position: "absolute",
    top: "13%",
    left: 22,
    right: 22,
    flexDirection: "row",
    alignItems: "center",
  },
  cardBottom: {
    position: "absolute",
    bottom: "13%",
    left: 22,
    right: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 5,
    backgroundColor: "#FFF",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 12,
  },
  avatarImg: { width: "100%", height: "100%", resizeMode: "cover" },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    transform: [{ skewX: "-12deg" }],
    marginBottom: 6,
  },
  tagText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  nameGold: {
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#FFFFFF",
    textShadowColor: "rgba(120,53,15,0.85)",
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 4,
    maxWidth: 190,
  },
  nameBlue: {
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#FFFFFF",
    textShadowColor: "rgba(15,23,42,0.85)",
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 4,
    maxWidth: 190,
    textAlign: "right",
  },
  vsWrap: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  vsHalo: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#FDE68A",
  },
  vsDiamond: {
    width: 92,
    height: 92,
    marginLeft: -46,
    marginTop: -46,
    position: "absolute",
    backgroundColor: "#0F172A",
    borderWidth: 5,
    borderColor: "#FBBF24",
    borderRadius: 14,
    transform: [{ rotate: "45deg" }],
    shadowColor: "#FBBF24",
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  vsText: {
    position: "absolute",
    width: 92,
    height: 92,
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 92,
    fontSize: 38,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#FBBF24",
    transform: [{ rotate: "-45deg" }],
  },
  flash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
  },
});

const BattleScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [gameState, setGameState] = useState("idle");
  const [timer, setTimer] = useState(SEARCH_SECONDS);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [onlineTab, setOnlineTab] = useState("online");
  const [activeTab] = useState("BattleScreen");
  const [lbTab, setLbTab] = useState("Players");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [offlinePlayers, setOfflinePlayers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);

  const [myName, setMyName] = useState("Player");
  const [myAvatarId, setMyAvatarId] = useState("1");
  const [matchedOpponent, setMatchedOpponent] = useState(null);

  const [waitingRooms, setWaitingRooms] = useState([]);
  const [retryTick, setRetryTick] = useState(0);
  const [ignoreTick, setIgnoreTick] = useState(0);
  const [invite, setInvite] = useState(null);
  const [inviteLeft, setInviteLeft] = useState(INVITE_SECONDS);
  const [pstTipVisible, setPstTipVisible] = useState(false);

  const auth = getAuth();
  const [authUser, setAuthUser] = useState(auth.currentUser);
  const [authReady, setAuthReady] = useState(!!auth.currentUser);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setAuthUser(u);
        setAuthReady(true);
      }),
    [],
  );
  const isGuest = !authUser || authUser.isAnonymous;
  const currentUserId = isGuest ? null : authUser.uid;
  const [showGuestPopup, setShowGuestPopup] = useState(false);

  const spinValue = useRef(new Animated.Value(0)).current;
  const sidebarAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const inviteAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });
  const trophyScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });

  const toggleSidebar = () => {
    Animated.timing(sidebarAnim, {
      toValue: sidebarOpen ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  const sidebarTranslateX = sidebarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(SIDEBAR_W - TOGGLE_W)],
  });

  const searchRef = useRef({
    roomId: null,
    unsub: null,
    matched: false,
    joining: false,
  });
  const matchTimeoutRef = useRef(null);
  const notFoundTimeoutRef = useRef(null);
  const ignoredRoomsRef = useRef(new Set());

  const getAvatarSource = (avatarId) => {
    const found = AVATAR_LIST.find((item) => item.id === String(avatarId));
    return found ? found.source : AVATAR_LIST[0].source;
  };

  const leaderboard = useMemo(() => {
    return allPlayers
      .filter((p) => p.pst > 0 || p.wins + p.losses > 0)
      .sort(
        (a, b) =>
          b.pst - a.pst || b.wins - a.wins || a.name.localeCompare(b.name),
      )
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }, [allPlayers]);

  const myEntry = leaderboard.find((p) => p.id === currentUserId);

  useFocusEffect(
    React.useCallback(() => {
      if (!authReady) return;

      if (!currentUserId) {
        setShowGuestPopup(true);
        return () => setShowGuestPopup(false);
      }

      const userRef = doc(db, "users", currentUserId);

      getDoc(userRef)
        .then((snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.name) setMyName(d.name);
          if (d.avatarId) setMyAvatarId(d.avatarId);
        })
        .catch((err) => console.error("Error fetching profile:", err));

      const beat = () =>
        setDoc(
          userRef,
          { battleStatus: "online", battleLastActive: Date.now() },
          { merge: true },
        ).catch((err) => console.error("Error updating online status:", err));

      beat();
      const heartbeat = setInterval(beat, HEARTBEAT_MS);

      const unsubscribe = onSnapshot(
        collection(db, "users"),
        (snapshot) => {
          const now = Date.now();
          const onlineList = [];
          const offlineList = [];
          const all = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const stats =
              data?.scores?.battle?.general || data?.scores?.battle || {};
            const base = {
              id: docSnap.id,
              name: data.name || "Player",
              avatarId: data.avatarId || "1",
              wins: Number(stats.wins) || 0,
              losses: Number(stats.losses) || 0,
              pst: readPst(stats),
            };
            all.push(base);

            if (docSnap.id === currentUserId) return;
            // ข้าม guest และคนที่ไม่เคยเข้าห้อง Battle
            if (data.isAnonymous || data.isGuest) return;
            if (data.battleStatus === undefined) return;

            const fresh =
              now - (data.battleLastActive || 0) < PRESENCE_TIMEOUT_MS;
            if (data.battleStatus === "online" && fresh) onlineList.push(base);
            else offlineList.push(base);
          });

          setOnlinePlayers(onlineList);
          setOfflinePlayers(offlineList);
          setAllPlayers(all);
        },
        (err) => console.error("Battle players listener error:", err),
      );

  //  ดึงและอัปเดตรายชื่อห้องทั้งหมดที่เปิดรอผู้เล่นอื่นอยู่ สถานะรอคนเข้ามา
      const unsubRooms = onSnapshot(
        query(collection(db, "battles"), where("status", "==", "waiting")),
        (snap) =>
          setWaitingRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("Waiting rooms listener error:", err),
      );

      return () => {
        clearInterval(heartbeat);
        unsubscribe();
        unsubRooms();
        stopSearch();
        const s = searchRef.current;
        s.matched = false;
        s.joining = false;
        if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current);
        if (notFoundTimeoutRef.current)
          clearTimeout(notFoundTimeoutRef.current);
        setWaitingRooms([]);
        setInvite(null);
        setGameState("idle");
        setTimer(SEARCH_SECONDS);
        setDoc(userRef, { battleStatus: "offline" }, { merge: true }).catch(
          (err) => console.error("Error updating offline status:", err),
        );
      };
    }, [currentUserId, authReady]),
  );

  const stopSearch = async () => {
    const s = searchRef.current;
    if (s.unsub) s.unsub();
    s.unsub = null;
    const roomId = s.roomId;
    s.roomId = null;
    if (roomId && !s.matched) {
      try {
        await deleteDoc(doc(db, "battles", roomId));
      } catch (e) {
        console.error("Error cancelling room:", e);
      }
    }
  };

  const onMatched = (battleId, opponent) => {
    const s = searchRef.current;
    if (s.matched) return;
    s.matched = true;
    if (s.unsub) s.unsub();
    s.unsub = null;

    const mine = s.roomId;
    s.roomId = null;
    if (mine && mine !== battleId) {
      deleteDoc(doc(db, "battles", mine)).catch(() => {});
    }

    setInvite(null);
    setMatchedOpponent(opponent || { name: "Opponent", avatarId: "1" });
    setGameState("matched");

    matchTimeoutRef.current = setTimeout(() => {
      setGameState("idle");
      setTimer(SEARCH_SECONDS);
      navigation.navigate("BattleGameScreen", { battleId });
    }, 2200);
  };

  const joinRoom = async (targetId) => {
    const s = searchRef.current;
    if (s.matched || s.joining || !currentUserId) return false;
    s.joining = true;
    try {
      const targetRef = doc(db, "battles", targetId);
      const myRoomRef = s.roomId ? doc(db, "battles", s.roomId) : null;
      const me = {
        name: myName,
        avatarId: myAvatarId,
        score: 0,
        points: 0,
        answered: 0,
        done: false,
        left: false,
        lastSeen: Date.now(),
      };

      const hostInfo = await runTransaction(db, async (tx) => {
        const theirs = await tx.get(targetRef);
        const mine = myRoomRef ? await tx.get(myRoomRef) : null;
        if (!theirs.exists() || theirs.data().status !== "waiting") return null;
        if (myRoomRef && (!mine.exists() || mine.data().status !== "waiting"))
          return null;
        const t = theirs.data();
        tx.update(targetRef, {
          status: "playing",
          guestId: currentUserId,
          startedAt: Date.now(),
          [`players.${currentUserId}`]: me,
        });
        if (myRoomRef) tx.delete(myRoomRef);
        return t.players?.[t.hostId] || { name: "Opponent", avatarId: "1" };
      });

      if (hostInfo) {
        onMatched(targetId, hostInfo);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Join room error:", e);
      return false;
    } finally {
      s.joining = false;
    }
  };

  const startSearch = async () => {
    const s = searchRef.current;
    s.matched = false;
    s.joining = false;
    s.roomId = null;

    const roomId = doc(collection(db, "battles")).id;
    const roomRef = doc(db, "battles", roomId);

    const me = {
      name: myName,
      avatarId: myAvatarId,
      score: 0,
      points: 0,
      answered: 0,
      done: false,
      left: false,
      lastSeen: Date.now(),
    };
 // การสร้างห้องต่อสู้ใหม่ 
    try {
      await setDoc(roomRef, {
        status: "waiting",
        hostId: currentUserId,
        guestId: null,
        createdAt: Date.now(),
        questionIds: shuffle([ //สุ่มคำถามสำหรับใช้แข่งในแมตช์นี้
          ...Array(BATTLE_QUESTION_BANK.length).keys(),
        ]).slice(0, QUESTIONS_PER_MATCH), // สุ่มสลับที่ (shuffle) แล้วตัดมาใช้ตามจำนวนข้อที่กำหนดต่อ 1 แมตช์
        players: { [currentUserId]: me },
        expireAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    } catch (e) {
      console.error("Error creating battle room:", e); // ถ้าเกิดข้อผิดพลาดตอนสร้างห้อง (เช่น เน็ตหลุด, สิทธิ์ไม่ถึง) จะขึ้น จะพิมพ์ Error ใน console และสั่ง return ฟังก์ชัน
      return;
    }

    if (s.matched || gameStateRef.current !== "searching") {
      deleteDoc(roomRef).catch(() => {});
      return;
    }
// ดูการเปลี่ยนแปลงห้องของผู้เล่น จะทำการ บันทึก ID ของห้องเก็บไว้ใน object s 
    s.roomId = roomId;
    // สร้างตัวดักฟังข้อมูลแบบ real-time บนห้องเกมนั้น ๆ แล้วดึงข้อมูลล่าสุดของห้องออกมาเก็บไว้ในตัวแปร d 
    s.unsub = onSnapshot(roomRef, (snap) => { 
      const d = snap.data();
      if (d && d.status === "playing") // เช็คว่า มีห้องอยู่จริงหรือไม่ และสถานะห้องเปลี่ยนเป็น playing แล้วหรือยัง 
        onMatched(roomId, d.players?.[d.guestId]); //ถ้าใช่ ให้เรียกใช้ฟังก์ชัน onmatched แปลว่าจับคู่สำเร็จแล้ว
    });
  };

  const cancelSearch = async () => {
    await stopSearch();
    setGameState("idle");
    setTimer(SEARCH_SECONDS);
  };

  const handlePressPlay = () => {
    if (!currentUserId) {
      setShowGuestPopup(true);
      return;
    }
    setTimer(SEARCH_SECONDS);
    setGameState("searching");
  };

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const onlineIds = useMemo(
    () => new Set(onlinePlayers.map((p) => p.id)),
    [onlinePlayers],
  );
  const eligibleRooms = useMemo(() => {
    const now = Date.now();
    return waitingRooms.filter(
      (r) =>
        r.hostId &&
        r.hostId !== currentUserId &&
        onlineIds.has(r.hostId) &&
        now - (r.createdAt || 0) < ROOM_FRESH_MS &&
        !ignoredRoomsRef.current.has(r.id),
    );
  }, [waitingRooms, onlineIds, currentUserId, ignoreTick]);

  useEffect(() => {
    if (gameState !== "searching") return;
    startSpin();
    startSearch();
    const interval = setInterval(
      () => setTimer((p) => (p > 0 ? p - 1 : 0)),
      1000,
    );
    return () => {
      clearInterval(interval);
      spinValue.stopAnimation();
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState !== "searching") return;
    const s = searchRef.current;
    if (s.matched || s.joining || eligibleRooms.length === 0) return;
    const target = pickRandom(eligibleRooms);
    joinRoom(target.id).then((ok) => {
      if (!ok && gameStateRef.current === "searching")
        setTimeout(() => setRetryTick((t) => t + 1), 600);
    });
  }, [gameState, eligibleRooms, retryTick]);

  useEffect(() => {
    if (gameState !== "idle") {
      if (invite) setInvite(null);
      return;
    }
    if (invite) {
      if (!eligibleRooms.some((r) => r.id === invite.roomId)) setInvite(null);
      return;
    }
    if (eligibleRooms.length > 0) {
      const r = pickRandom(eligibleRooms);
      const host = r.players?.[r.hostId] || {};
      setInvite({
        roomId: r.id,
        name: host.name || "Player",
        avatarId: host.avatarId || "1",
      });
      setInviteLeft(INVITE_SECONDS);
    }
  }, [gameState, eligibleRooms, invite]);

  useEffect(() => {
    if (!invite) return;
    inviteAnim.setValue(0);
    Animated.spring(inviteAnim, {
      toValue: 1,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
    const i = setInterval(() => setInviteLeft((p) => p - 1), 1000);
    return () => clearInterval(i);
  }, [invite?.roomId]);

  useEffect(() => {
    if (invite && inviteLeft <= 0) declineInvite();
  }, [inviteLeft]);

  const declineInvite = () => {
    if (invite) ignoredRoomsRef.current.add(invite.roomId);
    setIgnoreTick((t) => t + 1);
    setInvite(null);
  };

  const acceptInvite = async () => {
    if (!invite) return;
    const { roomId } = invite;
    ignoredRoomsRef.current.add(roomId);
    setIgnoreTick((t) => t + 1);
    setInvite(null);
    searchRef.current.matched = false;
    await joinRoom(roomId);
  };

  useEffect(() => {
    if (gameState !== "searching" || timer > 0) return;
    if (searchRef.current.matched) return;
    (async () => {
      await stopSearch();
      if (searchRef.current.matched) return;
      setGameState("notFound");
      notFoundTimeoutRef.current = setTimeout(() => {
        setGameState("idle");
        setTimer(SEARCH_SECONDS);
      }, 2500);
    })();
  }, [timer, gameState]);

  const startSpin = () => {
    spinValue.setValue(0);
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const navigateTo = (screenName) => {
    if (screenName === "BattleScreen") return;
    navigation.reset({ index: 0, routes: [{ name: screenName }] });
  };

  const navBarHeight = 70;
  const bottomPadding = Math.max(insets.bottom, 10);
  const totalNavHeight = navBarHeight + bottomPadding;

  const isOnlineTab = onlineTab === "online";
  const currentList = isOnlineTab ? onlinePlayers : offlinePlayers;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ImageBackground
        source={require("../../../assets/battle_background.png")}
        style={styles.backgroundImage}
      >
        <View style={styles.header} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sidePanelContainer,
              { transform: [{ translateX: sidebarTranslateX }] },
            ]}
          >
            <View style={styles.sidePanelInner}>
              <View style={styles.lobbyHeader}>
                <Ionicons name="people" size={15} color="#7DD3FC" />
                <Text style={styles.lobbyTitle}>LOBBY</Text>
                <View style={styles.lobbyLive}>
                  <View style={styles.liveDotWrap}>
                    <Animated.View
                      style={[
                        styles.liveHalo,
                        {
                          opacity: pulseOpacity,
                          transform: [{ scale: pulseScale }],
                        },
                      ]}
                    />
                    <View style={styles.liveDot} />
                  </View>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>

              <View style={styles.sideTabHeader}>
                <TouchableOpacity
                  style={[
                    styles.sideTabBtn,
                    isOnlineTab && styles.sideTabBtnActiveOn,
                  ]}
                  onPress={() => setOnlineTab("online")}
                  activeOpacity={0.8}
                >
                  <View
                    style={[styles.tabDot, { backgroundColor: "#4ADE80" }]}
                  />
                  <Text
                    style={[
                      styles.sideTabText,
                      isOnlineTab && styles.sideTabTextActive,
                    ]}
                  >
                    Online
                  </Text>
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {onlinePlayers.length}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sideTabBtn,
                    !isOnlineTab && styles.sideTabBtnActiveOff,
                  ]}
                  onPress={() => setOnlineTab("offline")}
                  activeOpacity={0.8}
                >
                  <View
                    style={[styles.tabDot, { backgroundColor: "#64748B" }]}
                  />
                  <Text
                    style={[
                      styles.sideTabText,
                      !isOnlineTab && styles.sideTabTextActive,
                    ]}
                  >
                    Offline
                  </Text>
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {offlinePlayers.length}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <FlatList
                data={currentList}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 190 }}
                contentContainerStyle={{ paddingBottom: 4 }}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.sidePlayerCard,
                      !isOnlineTab && { opacity: 0.55 },
                    ]}
                  >
                    <View>
                      <View
                        style={[
                          styles.sideAvatarRing,
                          {
                            borderColor: isOnlineTab ? "#4ADE80" : "#475569",
                          },
                        ]}
                      >
                        <Image
                          source={getAvatarSource(item.avatarId)}
                          style={styles.sideAvatarImg}
                        />
                      </View>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: isOnlineTab
                              ? "#4ADE80"
                              : "#64748B",
                          },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.sidePlayerName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.sidePlayerSub,
                          { color: isOnlineTab ? "#86EFAC" : "#94A3B8" },
                        ]}
                      >
                        {isOnlineTab ? "Ready to battle" : "Away"}
                      </Text>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.sideEmpty}>
                    <Ionicons name="person-outline" size={22} color="#475569" />
                    <Text style={styles.sideEmptyText}>
                      {isOnlineTab ? "No one online yet" : "Everyone is here"}
                    </Text>
                  </View>
                }
              />
            </View>

            <TouchableOpacity
              style={styles.sidebarToggleBtn}
              onPress={toggleSidebar}
              activeOpacity={0.85}
            >
              <Ionicons
                name={sidebarOpen ? "chevron-back" : "chevron-forward"}
                size={20}
                color="#FFF"
              />
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.topRightLbWrap} pointerEvents="box-none">
            <Animated.View
              pointerEvents="none"
              style={[
                styles.lbBtnHalo,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <TouchableOpacity
              style={styles.topRightLbBtn}
              onPress={() => setLeaderboardVisible(true)}
              activeOpacity={0.85}
            >
              <Animated.View style={{ transform: [{ scale: trophyScale }] }}>
                <MaterialCommunityIcons
                  name="trophy"
                  size={30}
                  color="#FFFFFF"
                />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.content, { paddingBottom: totalNavHeight + 20 }]}>
          {gameState === "idle" && (
            <View style={styles.bottomPlayContainer}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={handlePressPlay}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name="sword-cross"
                  size={28}
                  color="#FFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.playText}>PLAY BATTLE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ---------- Leaderboard Modal (มีทั้ง Podium ด้านบน + รายการจัดอันดับด้านล่างครบถ้วน พื้นหลังใสสมดุล) ---------- */}
        <Modal
          visible={leaderboardVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLeaderboardVisible(false)}
        >
          <View style={styles.lbOverlay}>
            <View style={styles.lbFullscreenCard}>
              <View style={styles.lbGlowTop} pointerEvents="none" />

              <TouchableOpacity
                onPress={() => setLeaderboardVisible(false)}
                style={styles.redCircleCloseBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>

              <View style={styles.lbTitleRow}>
                <Animated.View style={{ transform: [{ scale: trophyScale }] }}>
                  <MaterialCommunityIcons
                    name="trophy"
                    size={36}
                    color="#FBBF24"
                    style={styles.trophyGlow}
                  />
                </Animated.View>
                <Text style={styles.lbHeaderTitle}>RANKINGS</Text>
                <Animated.View style={{ transform: [{ scale: trophyScale }] }}>
                  <MaterialCommunityIcons
                    name="trophy"
                    size={36}
                    color="#FBBF24"
                    style={styles.trophyGlow}
                  />
                </Animated.View>
              </View>

              <View style={styles.lbSubTabRow}>
                {["Weekly", "Players"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.lbSubTabBtn,
                      lbTab === t && styles.lbSubTabActive,
                    ]}
                    onPress={() => setLbTab(t)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.lbSubTabText,
                        lbTab === t && styles.lbSubTabTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.lbSummaryRow}>
                <View style={styles.lbSummaryChip}>
                  <Ionicons name="people" size={15} color="#7DD3FC" />
                  <Text style={styles.lbSummaryText}>
                    {fmt(leaderboard.length)} Players Ranked
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.pstInfoBtn}
                  onPress={() => setPstTipVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pstInfoText}>What's PST?</Text>
                  <Ionicons name="help-circle" size={17} color="#FBBF24" />
                </TouchableOpacity>
              </View>

              {leaderboard.length === 0 ? (
                <View style={styles.lbEmptyWrap}>
                  <MaterialCommunityIcons
                    name="trophy-outline"
                    size={56}
                    color="#475569"
                  />
                  <Text style={styles.lbEmpty}>
                    No battles played yet. Be the first on the board!
                  </Text>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  {/* แสงเรืองและแท่น Podium อันดับ 1-3 ดั้งเดิม */}
                  <View style={styles.podiumRow}>
                    {[2, 1, 3].map((place) => (
                      <PodiumSpot
                        key={place}
                        place={place}
                        player={leaderboard[place - 1]}
                        isMe={leaderboard[place - 1]?.id === currentUserId}
                        getAvatarSource={getAvatarSource}
                      />
                    ))}
                  </View>

                  <View style={styles.lbHeadRow}>
                    <Text style={[styles.lbHeadText, { width: 44 }]}>Rank</Text>
                    <Text
                      style={[styles.lbHeadText, { flex: 1, marginLeft: 56 }]}
                    >
                      Player
                    </Text>
                    <Text style={[styles.lbHeadText, { color: "#FBBF24" }]}>
                      PST Score
                    </Text>
                  </View>

                  {/* รายชื่อจัดอันดับสไตล์แถวแนวนอน ไล่สีทอง/เงิน/ทองแดง/กระจกใสตามเรฟ */}
                  <FlatList
                    data={leaderboard}
                    keyExtractor={(item) => item.id}
                    style={styles.lbList}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const isMe = item.id === currentUserId;
                      let rowStyle = styles.lbRowDefault;
                      let rankBadgeStyle = styles.lbRankBadgeDefault;
                      let rankTextStyle = styles.lbRankTextDefault;

                      if (item.rank === 1) {
                        rowStyle = styles.lbRowRank1;
                        rankBadgeStyle = styles.lbRankBadge1;
                        rankTextStyle = styles.lbRankText1;
                      } else if (item.rank === 2) {
                        rowStyle = styles.lbRowRank2;
                        rankBadgeStyle = styles.lbRankBadge2;
                        rankTextStyle = styles.lbRankText2;
                      } else if (item.rank === 3) {
                        rowStyle = styles.lbRowRank3;
                        rankBadgeStyle = styles.lbRankBadge3;
                        rankTextStyle = styles.lbRankText3;
                      }

                      return (
                        <View
                          style={[
                            styles.lbRowBase,
                            rowStyle,
                            isMe && styles.lbRowMe,
                          ]}
                        >
                          <View style={[styles.lbRankChip, rankBadgeStyle]}>
                            {item.rank <= 3 ? (
                              <MaterialCommunityIcons
                                name={item.rank === 1 ? "crown" : "medal"}
                                size={16}
                                color={
                                  item.rank === 1
                                    ? "#78350F"
                                    : item.rank === 2
                                      ? "#1E293B"
                                      : "#7C2D12"
                                }
                              />
                            ) : (
                              <Text style={[styles.lbRank, rankTextStyle]}>
                                #{item.rank}
                              </Text>
                            )}
                          </View>
                          <View style={styles.lbAvatarRing}>
                            <Image
                              source={getAvatarSource(item.avatarId)}
                              style={styles.lbAvatar}
                            />
                          </View>
                          <Text
                            style={[
                              styles.lbName,
                              item.rank === 1 && { color: "#78350F" },
                              item.rank === 2 && { color: "#1E293B" },
                              item.rank === 3 && { color: "#7C2D12" },
                              { flex: 1 },
                            ]}
                            numberOfLines={1}
                          >
                            {item.name}
                            {isMe ? "  (you)" : ""}
                          </Text>
                          <Text
                            style={[
                              styles.lbPst,
                              item.rank === 1 && { color: "#78350F" },
                              item.rank === 2 && { color: "#1E293B" },
                              item.rank === 3 && { color: "#7C2D12" },
                            ]}
                          >
                            {fmt(item.pst)}
                          </Text>
                        </View>
                      );
                    }}
                  />
                </View>
              )}

              <View style={styles.lbFooter}>
                <MaterialCommunityIcons
                  name="trophy-variant"
                  size={18}
                  color="#38BDF8"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.lbFooterText}>
                  {myEntry
                    ? `Your rank: #${myEntry.rank} · ${fmt(myEntry.pst)} PST`
                    : "Play your first battle to join the ranking"}
                </Text>
              </View>

              {/* Tooltip อธิบาย PST มีตำแหน่งเดียวสะอาดตา ไม่ซ้ำซ้อน */}
              {pstTipVisible && (
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.pstTipBackdrop}
                  onPress={() => setPstTipVisible(false)}
                >
                  <View style={styles.pstTipCard}>
                    <View style={styles.pstTipIcon}>
                      <Ionicons name="flash" size={22} color="#0F172A" />
                    </View>
                    <Text style={styles.pstTipTitle}>What is PST?</Text>
                    <Text style={styles.pstTipBody}>
                      PST = Correct Answer Score + Speed Bonus ⚡
                    </Text>
                    <Text style={styles.pstTipSub}>
                      The faster you answer, the higher your points soar!
                    </Text>
                    <View style={styles.pstTipBtn}>
                      <Text style={styles.pstTipBtnText}>Got it</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>

        {/* Guest Popup */}
        <Modal
          visible={showGuestPopup}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() =>
            navigation.reset({ index: 0, routes: [{ name: "HomeScreen" }] })
          }
        >
          <View style={styles.searchingOverlay}>
            <View style={styles.searchingCard}>
              <MaterialCommunityIcons
                name="sword-cross"
                size={48}
                color="#F59E0B"
                style={{ marginBottom: 12 }}
              />
              <Text style={styles.searchingTitle}>LOGIN REQUIRED</Text>
              <Text
                style={[
                  styles.searchingTimerText,
                  { textAlign: "center", marginBottom: 8 },
                ]}
              >
                Battle Arena is an online mode. Log in with Google or Facebook
                to challenge other players and save your wins to your profile.
              </Text>
              <TouchableOpacity
                style={[styles.playButton, { width: "100%", marginBottom: 12 }]}
                onPress={() => navigation.navigate("ProfileScreen")}
              >
                <Text style={styles.playText}>LOG IN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() =>
                  navigation.reset({
                    index: 0,
                    routes: [{ name: "HomeScreen" }],
                  })
                }
              >
                <Text style={styles.cancelText}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ImageBackground>

      {invite && gameState === "idle" && (
        <View style={[styles.searchingOverlay, { zIndex: 9998 }]}>
          <Animated.View
            style={[
              styles.searchingCard,
              {
                borderColor: "#F59E0B",
                opacity: inviteAnim,
                transform: [
                  {
                    scale: inviteAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <MaterialCommunityIcons
              name="sword-cross"
              size={34}
              color="#F59E0B"
              style={{ marginBottom: 10 }}
            />
            <View style={styles.inviteAvatar}>
              <Image
                source={getAvatarSource(invite.avatarId)}
                style={styles.inviteAvatarImg}
              />
            </View>
            <Text style={styles.searchingTitle}>{invite.name}</Text>
            <Text style={[styles.searchingTimerText, { marginBottom: 18 }]}>
              challenges you to a battle! ({Math.max(inviteLeft, 0)}s)
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: "#475569" }]}
                onPress={declineInvite}
              >
                <Text style={styles.cancelText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: "#22C55E" }]}
                onPress={acceptInvite}
              >
                <Text style={styles.cancelText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {gameState === "searching" && (
        <View style={styles.searchingOverlay}>
          <View style={styles.searchingCard}>
            <View style={styles.spinnerWrapper}>
              <Animated.View
                style={[
                  styles.searchingRing,
                  { transform: [{ rotate: spin }] },
                ]}
              />
              <MaterialCommunityIcons name="sword" size={40} color="#FFD700" />
            </View>
            <Text style={styles.searchingTitle}>FINDING OPPONENT...</Text>
            <Text style={[styles.searchingTimerText, { marginBottom: 6 }]}>
              Matching in {timer}s
            </Text>
            <Text style={styles.searchingHint}>
              {onlinePlayers.length > 0
                ? `${onlinePlayers.length} online — calling a random player`
                : "Waiting for players to enter the arena"}
            </Text>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelSearch}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {gameState === "notFound" && (
        <View style={styles.searchingOverlay}>
          <View style={styles.searchingCard}>
            <Ionicons
              name="alert-circle"
              size={60}
              color="#FF5722"
              style={{ marginBottom: 10 }}
            />
            <Text style={[styles.searchingTitle, { color: "#FF5722" }]}>
              NO OPPONENT
            </Text>
            <Text style={styles.searchingTimerText}>
              No players found right now. Try again soon.
            </Text>
          </View>
        </View>
      )}

      {gameState === "matched" && matchedOpponent && (
        <VsScreen
          me={{ name: myName, avatarId: myAvatarId }}
          opponent={matchedOpponent}
          getAvatarSource={getAvatarSource}
        />
      )}

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
            color={activeTab === "HomeScreen" ? "#2196F3" : "#9E9E9E"}
          />
          <Text
            style={[
              styles.navText,
              { color: activeTab === "HomeScreen" ? "#2196F3" : "#9E9E9E" },
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
            color={activeTab === "BattleScreen" ? "#2196F3" : "#9E9E9E"}
          />
          <Text
            style={[
              styles.navText,
              { color: activeTab === "BattleScreen" ? "#2196F3" : "#9E9E9E" },
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
            color={activeTab === "PosttestScreen" ? "#2196F3" : "#9E9E9E"}
          />
          <Text
            style={[
              styles.navText,
              { color: activeTab === "PosttestScreen" ? "#2196F3" : "#9E9E9E" },
            ]}
          >
            Explorer
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8F3FA" },
  backgroundImage: { flex: 1, width: "100%", height: "100%" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  topRightLbWrap: {
    position: "absolute",
    right: 14,
    top: SCREEN_HEIGHT * 0.12,
    width: 58,
    height: 58,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  lbBtnHalo: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FBBF24",
  },
  topRightLbBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#F59E0B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FEF3C7",
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 8,
  },
  sidePanelContainer: {
    position: "absolute",
    left: 12,
    top: SCREEN_HEIGHT * 0.14,
    width: SIDEBAR_W,
    flexDirection: "row",
    alignItems: "flex-start",
    zIndex: 15,
  },
  sidePanelInner: {
    flex: 1,
    backgroundColor: "rgba(10, 17, 36, 0.92)",
    borderRadius: 20,
    padding: 10,
    borderWidth: 1.5,
    borderColor: "rgba(125, 211, 252, 0.55)",
    shadowColor: "#38BDF8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  lobbyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  lobbyTitle: {
    flex: 1,
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "900",
    color: "#E0F2FE",
    letterSpacing: 1.5,
  },
  lobbyLive: { flexDirection: "row", alignItems: "center" },
  liveDotWrap: {
    width: 14,
    height: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  liveHalo: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4ADE80",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  liveText: { fontSize: 9, fontWeight: "800", color: "#86EFAC", marginLeft: 2 },
  sideTabHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
  },
  sideTabBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  sideTabBtnActiveOn: { backgroundColor: "rgba(34, 197, 94, 0.35)" },
  sideTabBtnActiveOff: { backgroundColor: "rgba(100, 116, 139, 0.45)" },
  tabDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  sideTabText: { fontSize: 10, fontWeight: "800", color: "#94A3B8" },
  sideTabTextActive: { color: "#FFF" },
  tabBadge: {
    marginLeft: 4,
    minWidth: 16,
    paddingHorizontal: 4,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { fontSize: 9, fontWeight: "900", color: "#E2E8F0" },
  sidePlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
  },
  sideAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFF",
    overflow: "hidden",
    borderWidth: 2,
  },
  sideAvatarImg: { width: "100%", height: "100%", resizeMode: "cover" },
  statusDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#0A1124",
  },
  sidePlayerName: { fontSize: 12, fontWeight: "800", color: "#F8FAFC" },
  sidePlayerSub: { fontSize: 9, fontWeight: "700", marginTop: 1 },
  sideEmpty: { alignItems: "center", paddingVertical: 18 },
  sideEmptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
  },
  sidebarToggleBtn: {
    width: TOGGLE_W,
    height: 56,
    backgroundColor: "#0284C7",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 50,
    borderWidth: 1.5,
    borderColor: "#7DD3FC",
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  bottomPlayContainer: { width: "100%", alignItems: "center" },
  playButton: {
    flexDirection: "row",
    backgroundColor: "#F59E0B",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 2,
    borderColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    width: "85%",
  },
  playText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 3,
  },
  searchingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  searchingCard: {
    width: "82%",
    backgroundColor: "#1E293B",
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    alignSelf: "center",
  },
  spinnerWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    position: "relative",
  },
  searchingRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#F59E0B",
    borderTopColor: "transparent",
  },
  searchingTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#F8FAFC",
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: "center",
  },
  searchingTimerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 24,
    textAlign: "center",
  },
  searchingHint: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7DD3FC",
    marginBottom: 22,
    textAlign: "center",
  },
inviteAvatar: {
  width: 96,
  height: 96,
  borderRadius: 48,
  overflow: "hidden",
  borderWidth: 3,
  borderColor: "#F59E0B",
  backgroundColor: "#FFF",
  marginBottom: 12,
  justifyContent: "center",
  alignItems: "center",
},
inviteAvatarImg: { width: "100%", height: "100%", resizeMode: "contain" },
  cancelButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 14,
  },
  cancelText: { color: "#FFF", fontSize: 14, fontWeight: "bold" },
  lbOverlay: {
    flex: 1,
    backgroundColor: "rgba(6, 10, 24, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  lbFullscreenCard: {
    width: "100%",
    height: "94%",
    backgroundColor: "rgba(17, 27, 51, 0.90)",
    borderRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(56, 189, 248, 0.45)",
    shadowColor: "#38BDF8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 15,
    overflow: "hidden",
  },
  lbGlowTop: {
    position: "absolute",
    top: -110,
    alignSelf: "center",
    width: 320,
    height: 220,
    borderRadius: 160,
    backgroundColor: "rgba(251, 191, 36, 0.16)",
  },
  redCircleCloseBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FCA5A5",
    zIndex: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    elevation: 6,
  },
  lbTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  trophyGlow: {
    textShadowColor: "#FBBF24",
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  lbHeaderTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FBBF24",
    letterSpacing: 2,
    marginHorizontal: 10,
    textShadowColor: "rgba(251, 191, 36, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lbSubTabRow: {
    flexDirection: "row",
    backgroundColor: "#0A1124",
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#23304F",
  },
  lbSubTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 9,
  },
  lbSubTabActive: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 3,
  },
  lbSubTabText: { fontSize: 13, fontWeight: "800", color: "#94A3B8" },
  lbSubTabTextActive: { color: "#FFF" },
  lbSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lbSummaryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A1124",
    borderWidth: 1,
    borderColor: "#23304F",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  lbSummaryText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#E0F2FE",
  },
  pstInfoBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(251,191,36,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.5)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pstInfoText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FBBF24",
    marginRight: 4,
  },
  lbEmptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  lbEmpty: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 14,
    fontWeight: "700",
    fontSize: 14,
    paddingHorizontal: 20,
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 10,
    overflow: "hidden",
    paddingTop: 4,
  },
  podiumCol: {
    flex: 1,
    maxWidth: 100,
    alignItems: "center",
    marginHorizontal: 4,
  },
  podiumAvatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  podiumAvatarRing: {
    borderWidth: 3,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 5,
  },
  sparkle: { position: "absolute" },
  podiumName: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F8FAFC",
    marginTop: 6,
    maxWidth: "100%",
  },
  podiumWins: {
    fontSize: 10,
    fontWeight: "800",
    color: "#CBD5E1",
    marginBottom: 4,
  },
  podiumBlock: {
    width: "100%",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 4,
  },
  podiumShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  podiumPlace: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  lbHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  lbHeadText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  lbList: { flex: 1 },

  // สไตล์แถวอันดับด้านล่าง (ตามเรฟในรูป)
  lbRowBase: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  lbRowRank1: {
    backgroundColor: "#FDE047", // สีทองพรีเมียม
    borderColor: "#FEF08A",
  },
  lbRowRank2: {
    backgroundColor: "#CBD5E1", // สีเงิน
    borderColor: "#E2E8F0",
  },
  lbRowRank3: {
    backgroundColor: "#FDBA74", // สีทองแดง
    borderColor: "#FED7AA",
  },
  lbRowDefault: {
    backgroundColor: "rgba(255, 255, 255, 0.06)", // กระจกใสสำหรับอันดับ 4 ลงไป
    borderColor: "rgba(56, 189, 248, 0.22)",
  },
  lbRowMe: {
    borderWidth: 2,
    borderColor: "#60A5FA",
  },
  lbRankChip: {
    minWidth: 34,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginRight: 2,
  },
  lbRankBadge1: { backgroundColor: "#FACC15" },
  lbRankBadge2: { backgroundColor: "#94A3B8" },
  lbRankBadge3: { backgroundColor: "#FB923C" },
  lbRankBadgeDefault: { backgroundColor: "rgba(255, 255, 255, 0.1)" },
  lbRankText1: { color: "#78350F" },
  lbRankText2: { color: "#0F172A" },
  lbRankText3: { color: "#7C2D12" },
  lbRankTextDefault: { color: "#38BDF8" },
  lbRank: { fontSize: 13, fontWeight: "900" },

  lbAvatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    marginHorizontal: 8,
    backgroundColor: "#FFF",
  },
  lbAvatar: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  lbName: { fontSize: 14, fontWeight: "800", color: "#F8FAFC" },
  lbPst: { fontSize: 15, fontWeight: "900", color: "#FBBF24", marginLeft: 6 },

  lbFooter: {
    flexDirection: "row",
    marginTop: 8,
    backgroundColor: "#0A1124",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#38BDF8",
  },
  lbFooterText: { fontSize: 12, fontWeight: "800", color: "#7DD3FC" },
  pstTipBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(6,10,24,0.72)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 60,
    elevation: 30,
  },
  pstTipCard: {
    width: "82%",
    backgroundColor: "#1E293B",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#FBBF24",
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  pstTipIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FBBF24",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  pstTipTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  pstTipBody: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FDE68A",
    textAlign: "center",
    marginBottom: 6,
  },
  pstTipSub: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 16,
  },
  pstTipBtn: {
    backgroundColor: "#F59E0B",
    borderRadius: 12,
    paddingHorizontal: 26,
    paddingVertical: 9,
  },
  pstTipBtnText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  navBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: "#F1F1F1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 12, fontWeight: "700", marginTop: 4 },
});

export default BattleScreen;
