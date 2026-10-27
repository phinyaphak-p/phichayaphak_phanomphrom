import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { grammarData } from '../../data/questions';

const GrammarLevelsScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, 15);
  const bottomPadding = Math.max(insets.bottom, 20);

  const { difficulty } = route.params || { difficulty: 'Beginner' };
  const formattedDifficulty = difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase() : 'Beginner';
  
  const data = grammarData[formattedDifficulty] || grammarData[difficulty] || [];

  const handleStartGame = (item) => {
    // 🌟 จัดรูปแบบชื่อ Topic ให้เป็นมาตรฐานเดียวกันเสมอ (เช่น "Present Simple")
    const rawTitle = item.title || item.id;
    const resolvedTopic = rawTitle.trim();

    console.log('Topic Selected:', resolvedTopic);
    console.log('Level Selected:', formattedDifficulty);

    navigation.navigate(
      'GrammarGameplayScreen',
      {
        topic: resolvedTopic,
        level: formattedDifficulty,
      }
    );
  };

  const renderTenseCard = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => handleStartGame(item)} // ส่งทั้ง object item เข้าไป
      activeOpacity={0.85}
    >
      <View style={styles.cardContentLeft}>
        <Text style={styles.levelTitle}>{item.title}</Text>
        <Text style={styles.cardSub}>10 Questions • Level {item.level || formattedDifficulty}</Text>
      </View>
      <View style={styles.playBtnContainer}>
        <Ionicons name="play" size={22} color="#FFF" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: bottomPadding }]}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#2D3E50" />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.headerTitle}>Select Tense</Text>
          <Text style={styles.headerSubTitle}>Difficulty: {formattedDifficulty}</Text>
        </View>
        <View style={styles.placeholderBtn} />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item, index) => item.id || index.toString()}
        renderItem={renderTenseCard}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingBottom: 15 
  },
  backBtn: { 
    width: 46, height: 46, backgroundColor: '#FFF', borderRadius: 16, 
    justifyContent: 'center', alignItems: 'center', elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
  },
  titleWrapper: { alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#1A2530' },
  headerSubTitle: { fontSize: 12, fontWeight: '700', color: '#78909C', marginTop: 2, textTransform: 'capitalize' },
  placeholderBtn: { width: 46, height: 46 },
  listContainer: { paddingHorizontal: 24, paddingTop: 10 },
  card: {
    flexDirection: 'row', backgroundColor: '#FFF', paddingVertical: 22, paddingHorizontal: 26,
    borderRadius: 26, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8,
  },
  cardContentLeft: { flex: 1 },
  levelTitle: { fontSize: 20, fontWeight: '900', color: '#2C3E50' },
  cardSub: { fontSize: 13, color: '#00B0FF', fontWeight: 'bold', marginTop: 3 },
  playBtnContainer: { 
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#00E5FF', 
    justifyContent: 'center', alignItems: 'center', elevation: 3 
  },
});

export default GrammarLevelsScreen;