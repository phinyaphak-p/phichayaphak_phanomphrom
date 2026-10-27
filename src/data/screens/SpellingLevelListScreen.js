import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spellingData } from '../screens/spellingData'; 

export default function SpellingLevelListScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 20);

  const { difficulty } = route.params || { difficulty: 'Beginner' };
  
  // 🔧 ปรับให้โหลดด่านทั้งหมดจาก spellingData ตามหมวดหมู่ (รองรับ 5 ด่าน)
  const rawLevels = (spellingData && spellingData[difficulty]) || [];
  const levels = Array.isArray(rawLevels) ? rawLevels : [];

  const [completedLevels, setCompletedLevels] = useState({});
  const [showAlertModal, setShowAlertModal] = useState(false);

  useEffect(() => {
    fetchUserProgress();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserProgress();
    });
    return unsubscribe;
  }, [navigation, difficulty]);

  const fetchUserProgress = async () => {
    try {
      const user = getAuth().currentUser;
      let data = null;
      if (user && !user.isAnonymous) {
        const snap = await getDoc(doc(getFirestore(), 'users', user.uid));
        data = snap.exists() ? snap.data() : null;
      } else {
        const raw = await AsyncStorage.getItem('@guest_profile');
        data = raw ? JSON.parse(raw) : null;
      }
      setCompletedLevels({ ...((data?.spellingProgress || {})[difficulty] || {}) });
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };

  const handleSelectLevel = (item, index) => {
    let isUnlocked = false;
    
    if (index === 0) {
      isUnlocked = true;
    } else {
      const prevKey = `level_${index - 1}`;
      isUnlocked = completedLevels[prevKey] === true;
    }

    if (!isUnlocked) {
      setShowAlertModal(true);
      return;
    }

    navigation.navigate('SpellingScreen', {
      levelData: item,
      category: difficulty,
      levelIndex: index,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#2D3E50" />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.headerTitle}>Spelling Game</Text>
          <Text style={styles.headerSubTitle}>Difficulty : {difficulty}</Text>
        </View>
        <View style={styles.placeholderBtn} />
      </View>

      {/* ScrollView พร้อมปรับ paddingBottom */}
      <ScrollView 
        contentContainerStyle={[styles.scrollContainer, { paddingBottom: bottomPadding + 20 }]} 
        showsVerticalScrollIndicator={false}
      >
        {levels.map((item, index) => {
          let isLocked = false;
          if (index === 0) {
            isLocked = false;
          } else {
            const prevKey = `level_${index - 1}`;
            isLocked = completedLevels[prevKey] !== true;
          }

          return (
            <TouchableOpacity
              key={index}
              style={[styles.levelCard, isLocked && styles.cardLocked]}
              onPress={() => handleSelectLevel(item, index)}
              activeOpacity={isLocked ? 0.8 : 0.82}
            >
              <View style={styles.cardContent}>
                <View>
                  <Text style={[styles.levelTitle, isLocked && styles.textGray]}>
                    {item.title || `Level ${index + 1}`}
                  </Text>
                  <Text style={styles.levelSub}>
                    Word: {item.word ? `${item.word.length} Letters` : '0 Letters'}
                  </Text>
                </View>

                {isLocked ? (
                  <LinearGradient colors={['#B0BEC5', '#78909C']} style={styles.actionButton}>
                    <Ionicons name="lock-closed" size={22} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <LinearGradient colors={['#FFEB3B', '#FFC107']} style={styles.actionButton}>
                    <Ionicons name="play" size={22} color="#FFF" />
                  </LinearGradient>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
            <Ionicons name="lock-closed" size={48} color="#E53935" style={{ marginBottom: 5 }} />
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
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EBF3FB' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 15, paddingBottom: 10
  },
  backBtn: {
    width: 42, height: 42, backgroundColor: '#FFF', borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
  },
  titleWrapper: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#1A2530' },
  headerSubTitle: { fontSize: 12, fontWeight: '700', color: '#78909C', marginTop: 2 },
  placeholderBtn: { width: 42, height: 42 },
  scrollContainer: { paddingHorizontal: 24, paddingTop: 20 },
  levelCard: {
    backgroundColor: '#FFF', paddingVertical: 18, paddingHorizontal: 22,
    borderRadius: 22, marginBottom: 16, elevation: 4, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6,
  },
  cardLocked: { backgroundColor: '#E0E6ED', elevation: 1, shadowOpacity: 0.02 },
  cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelTitle: { fontSize: 20, fontWeight: '900', color: '#1A2530' },
  textGray: { color: '#607D8B' },
  levelSub: { fontSize: 12, color: '#78909C', fontWeight: '600', marginTop: 3 },
  actionButton: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3
  },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20,
  },
  guestAlertBox: {
    width: "80%", backgroundColor: "#FFF", borderRadius: 30, padding: 30, alignItems: "center", elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  alertTitle: { fontSize: 22, fontWeight: "bold", color: "#333", marginTop: 15, marginBottom: 10 },
  alertSub: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 25 },
  alertBtn: { backgroundColor: "#333", paddingHorizontal: 40, paddingVertical: 12, borderRadius: 20, width: "100%", alignItems: "center" },
  alertBtnText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },
});