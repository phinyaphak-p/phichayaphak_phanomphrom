import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

// 🌟 รายชื่อ 9 Tenses มาตรฐานที่ใช้ตรวจสอบ
const ALL_TENSES_MAP = [
  { key: 'present_simple', altKey: 'Present Simple', label: 'Present Simple' },
  { key: 'past_simple', altKey: 'Past Simple', label: 'Past Simple' },
  { key: 'future_simple', altKey: 'Future Simple', label: 'Future Simple' },
  { key: 'present_continuous', altKey: 'Present Continuous', label: 'Present Continuous' },
  { key: 'past_continuous', altKey: 'Past Continuous', label: 'Past Continuous' },
  { key: 'future_continuous', altKey: 'Future Continuous', label: 'Future Continuous' },
  { key: 'present_perfect', altKey: 'Present Perfect', label: 'Present Perfect' },
  { key: 'past_perfect', altKey: 'Past Perfect', label: 'Past Perfect' },
  { key: 'future_perfect', altKey: 'Future Perfect', label: 'Future Perfect' },
];

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const PosttestScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeTab = "PosttestScreen";

  const [isLocked, setIsLocked] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [completedList, setCompletedList] = useState([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const TOTAL_REQUIRED_TENSES = 9; 

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const auth = getAuth();

      const fetchLatestProgress = async () => {
        try {
          let user = auth.currentUser;
          if (!user) {
            const userCred = await signInAnonymously(auth);
            user = userCred.user;
          }

          let data = null;
          if (user && !user.isAnonymous) {
            const db = getFirestore();
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            if (docSnap.exists()) {
              data = docSnap.data();
            }
          } else {
            const storedProfile = await AsyncStorage.getItem("@guest_profile");
            if (storedProfile) {
              data = JSON.parse(storedProfile);
            }
          }

          if (isMounted && data) {
            processCompletedTenses(data);
          }
        } catch (error) {
          console.error("Error fetching progress for post-test:", error);
        }
      };

      fetchLatestProgress();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  const processCompletedTenses = (data) => {
    let rawPassed = [];

    if (Array.isArray(data.completedTenses)) {
      rawPassed = data.completedTenses;
    }

    const cleanStr = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const cleanedRaw = rawPassed.map(t => cleanStr(t));

    let matchedCount = 0;
    let matchedLabels = [];

    ALL_TENSES_MAP.forEach(item => {
      const targetKeys = [
        cleanStr(item.key),
        cleanStr(item.altKey),
        cleanStr(item.label)
      ];

      const isFound = cleanedRaw.some(p => targetKeys.includes(p) || targetKeys.some(t => p.includes(t) || t.includes(p)));

      if (isFound) {
        matchedCount++;
        matchedLabels.push(item.altKey);
      }
    });

    setCompletedList(matchedLabels);
    setCompletedCount(matchedCount);

    if (matchedCount >= TOTAL_REQUIRED_TENSES) {
      setIsLocked(false);
    } else {
      setIsLocked(true);
    }
  };
  
  const navigateTo = (screenName) => {
    navigation.navigate(screenName);
  };

  const handlePressPostTest = () => {
    if (isLocked) {
      setAlertVisible(true);
    } else {
      navigation.navigate('GrammarPostTestScreen');
    }
  };

  const navBarHeight = 70;
  const bottomPadding = Math.max(insets.bottom, 10);
  const totalNavHeight = navBarHeight + bottomPadding;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrapper, { paddingBottom: totalNavHeight }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitleMain}>EXPLORE</Text>
          <Text style={styles.headerSubtitle}>Evaluate your English grammar proficiency</Text>
        </View>

        <View style={styles.contentContainer}>
          <View style={[styles.cardWrapper, isLocked && styles.cardLockedBorder]}>
            <View style={styles.cardContent}>
              <View style={styles.textSection}>
                <View style={[styles.badgeContainer, isLocked && styles.badgeLockedBg]}>
                  <Ionicons name={isLocked ? "shield-outline" : "star"} size={12} color={isLocked ? "#0284C7" : "#D97706"} style={{ marginRight: 4 }} />
                  <Text style={[styles.badgeText, isLocked && styles.badgeLockedText]}>
                    {isLocked ? `QUEST PROGRESS: ${completedCount}/${TOTAL_REQUIRED_TENSES}` : "READY FOR BOSS BATTLE!"}
                  </Text>
                </View>
                <Text style={styles.postTestTitle}>POST-TEST</Text>
                <Text style={[styles.postTestDesc, isLocked && { color: '#64748B' }]}>
                  {isLocked 
                    ? `Complete all 9 Tense quests across Beginner, Intermediate, and Advanced to unlock this ultimate exam.` 
                    : "All grammar stages conquered! Prove your mastery now."}
                </Text>

                <TouchableOpacity
                  onPress={handlePressPostTest}
                  activeOpacity={0.85}
                  style={styles.buttonShadow}
                >
                  <LinearGradient
                    colors={isLocked ? ['#94A3B8', '#64748B'] : ['#F59E0B', '#D97706']}
                    style={styles.playBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons 
                      name={isLocked ? "lock-closed" : "flash"} 
                      size={18} 
                      color="#FFF" 
                      style={{ marginRight: 6 }} 
                    />
                    <Text style={styles.playText}>{isLocked ? "Locked Quest" : "Start Post-Test"}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <View style={styles.lockContainer}>
                <View style={[styles.iconBackground, isLocked ? { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' } : { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                  <Ionicons
                    name={isLocked ? "lock-closed" : "trophy"}
                    size={36}
                    color={isLocked ? "#0284C7" : "#D97706"}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 🎮 Gaming Modal แสดงเควสต์ Tenses สไตล์ Arcade UI */}
      <Modal visible={alertVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <TouchableOpacity 
              onPress={() => setAlertVisible(false)}
              style={styles.gameCloseBtn}
            >
              <Ionicons name="close" size={20} color="#FF5252" />
            </TouchableOpacity>

            <View style={styles.modalHeaderDecor}>
              <View style={styles.modalIconRing}>
                <Ionicons name="shield-checkmark" size={26} color="#0284C7" />
              </View>
              <Text style={styles.modalTitle}>Quest Locked</Text>
              <Text style={styles.modalSubtitle}>
                You have completed <Text style={{fontWeight: '900', color: '#0284C7'}}>{completedCount}</Text> of <Text style={{fontWeight: '900', color: '#1E293B'}}>{TOTAL_REQUIRED_TENSES}</Text> Grammar Tenses.
              </Text>
            </View>

            <View style={styles.progressListBox}>
              <View style={styles.questLogHeader}>
                <Text style={styles.progressListTitle}>🎯 Grammar Quest Checkpoint</Text>
              </View>
              <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
                {ALL_TENSES_MAP.map((item, index) => {
                  const isDone = completedList.includes(item.altKey);

                  return (
                    <View key={index} style={[styles.rowItem, isDone && styles.rowItemDoneBg]}>
                      <View style={styles.rowLeftGroup}>
                        <Ionicons 
                          name={isDone ? "checkbox" : "square-outline"} 
                          size={20} 
                          color={isDone ? "#16A34A" : "#94A3B8"} 
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[styles.rowText, isDone ? styles.rowTextDone : styles.rowTextPending]}>
                          {item.label}
                        </Text>
                      </View>
                      <View style={[styles.statusBadgeMini, isDone ? styles.statusDoneBg : styles.statusPendingBg]}>
                        <Text style={[styles.statusMiniText, isDone ? styles.statusDoneText : styles.statusPendingText]}>
                          {isDone ? "DONE" : "LOCKED"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={() => setAlertVisible(false)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#0284C7', '#0369A1']}
                style={styles.modalBtnGradient}
              >
                <Text style={styles.modalButtonText}>Got It, Let's Play!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={[styles.navBar, { height: totalNavHeight, paddingBottom: bottomPadding }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => navigateTo("HomeScreen")}>
          <Ionicons name="home" size={26} color={activeTab === "HomeScreen" ? "#0284C7" : "#94A3B8"} />
          <Text style={[styles.navText, { color: activeTab === "HomeScreen" ? "#0284C7" : "#94A3B8" }]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => navigateTo("BattleScreen")}>
          <MaterialCommunityIcons name="sword-cross" size={26} color={activeTab === "BattleScreen" ? "#0284C7" : "#94A3B8"} />
          <Text style={[styles.navText, { color: activeTab === "BattleScreen" ? "#0284C7" : "#94A3B8" }]}>Battle</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => navigateTo("PosttestScreen")}>
          <Ionicons name="compass" size={26} color={activeTab === "PosttestScreen" ? "#0284C7" : "#94A3B8"} />
          <Text style={[styles.navText, { color: activeTab === "PosttestScreen" ? "#0284C7" : "#94A3B8" }]}>Explorer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EBF8FF' }, // พื้นหลังพาสเทลสดใสสไตล์ HomeScreen และ Profile
  mainWrapper: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  header: { marginBottom: 24, paddingHorizontal: 4 },
  headerTitleMain: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: 1 },
  headerSubtitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginTop: 4 },
  contentContainer: { width: '100%', alignItems: 'center', flex: 1 },
  
  // การ์ด Post-test สไตล์ Arcade ขอบหนามิติสวยงาม
  cardWrapper: { 
    width: '100%', 
    borderRadius: 26, 
    padding: 22, 
    backgroundColor: '#FFFFFF',
    borderWidth: 3, 
    borderColor: '#BAE6FD', 
    shadowColor: '#0284C7', 
    shadowOffset: { width: 0, height: 6 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 8, 
    elevation: 6 
  },
  cardLockedBorder: { borderColor: '#BAE6FD' },
  cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  textSection: { flex: 1, paddingRight: 12 },
  
  badgeContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    alignSelf: 'flex-start', 
    backgroundColor: '#FEF3C7', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 10, 
    marginBottom: 8, 
    borderWidth: 1.5, 
    borderColor: '#FCD34D' 
  },
  badgeLockedBg: { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#D97706', letterSpacing: 0.8 },
  badgeLockedText: { color: '#0284C7' },
  
  postTestTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B', letterSpacing: 0.5, marginBottom: 6 },
  postTestDesc: { fontSize: 12, fontWeight: '700', color: '#64748B', lineHeight: 18, marginBottom: 16 },
  
  buttonShadow: { 
    alignSelf: 'flex-start', 
    borderRadius: 14, 
    overflow: 'hidden',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 3, 
    elevation: 3 
  },
  playBtn: { flexDirection: 'row', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  
  lockContainer: { justifyContent: 'center', alignItems: 'center' },
  iconBackground: { 
    width: 72, 
    height: 72, 
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4 
  },
  
  // 🎮 Gaming Modal Styling (Arcade UI)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10, 25, 47, 0.85)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalCard: { 
    width: '100%', 
    maxWidth: 380, 
    maxHeight: '85%', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 30, 
    paddingVertical: 22, 
    paddingHorizontal: 20, 
    alignItems: 'center', 
    borderWidth: 4, 
    borderColor: '#4FC3F7', 
    shadowColor: '#00E5FF', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.4, 
    shadowRadius: 20, 
    elevation: 15,
    position: 'relative'
  },
  gameCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  modalHeaderDecor: { alignItems: 'center', width: '100%', marginBottom: 14, marginTop: 4 },
  modalIconRing: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0F2FE', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 2, borderColor: '#BAE6FD' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B', marginBottom: 4, textAlign: 'center', letterSpacing: 0.5 },
  modalSubtitle: { fontSize: 11, fontWeight: '700', color: '#64748B', textAlign: 'center', lineHeight: 18 },
  
  progressListBox: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 18, padding: 12, maxHeight: 220, borderWidth: 2, borderColor: '#E2E8F0', marginBottom: 18 },
  questLogHeader: { borderBottomWidth: 1.5, borderBottomColor: '#E2E8F0', paddingBottom: 6, marginBottom: 8 },
  progressListTitle: { fontSize: 11, fontWeight: '900', color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.8 },
  scrollList: { width: '100%' },
  
  rowItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, marginBottom: 6, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  rowItemDoneBg: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  rowLeftGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowText: { fontSize: 13, fontWeight: '900' },
  rowTextDone: { color: '#166534' },
  rowTextPending: { color: '#334155' },
  
  statusBadgeMini: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  statusDoneBg: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  statusPendingBg: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  statusMiniText: { fontSize: 9, fontWeight: '900' },
  statusDoneText: { color: '#16A34A' },
  statusPendingText: { color: '#64748B' },
  
  modalButton: { width: '100%', borderRadius: 16, overflow: 'hidden', shadowColor: '#0284C7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 },
  modalBtnGradient: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },

  // Navigation Bar (ดีไซน์ Arcade ธีมเดียวกัน)
  navBar: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#FFFFFF', 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center', 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30, 
    borderTopWidth: 2, 
    borderColor: '#BAE6FD', 
    shadowColor: '#0284C7', 
    shadowOffset: { width: 0, height: -5 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 10, 
    elevation: 10 
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 12, fontWeight: '900', marginTop: 4 },
});

export default PosttestScreen;