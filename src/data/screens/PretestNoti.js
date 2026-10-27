import React, { useEffect } from 'react';
import { isPretestDone } from './services/scoreService';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const PretestNoti = ({ navigation }) => {

  useEffect(() => {
  isPretestDone().then((done) => {
    if (done) navigation.reset({ index: 0, routes: [{ name: 'HomeScreen' }] });
  });
}, []);

  return (
    <SafeAreaView style={styles.gameBackground}>
      {/* 🔙 ปุ่มย้อนกลับมุมซ้ายบน */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'WelcomeScreen' }],
            });
          }} 
          style={styles.backBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={24} color="#2D3E50" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        
        {/* Speech Bubble ปรับให้โค้งมนและดู Soft ขึ้น */}
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>
            Before we start, let's take a quick Pre-test to check your English level.
          </Text>
          <View style={styles.bubbleTail} />
        </View>

        {/* Mascot */}
        <View style={styles.mascotContainer}>
          <View style={styles.mascotGlow} />
          
          <Image 
            source={require('../../../assets/grammy-word-logo.png')} 
            style={styles.mascot} 
            resizeMode="contain" 
          />
        </View>

        {/* ปุ่ม Tap to continue (กดไปหน้า PretestScreen ตามปกติ) */}
        <TouchableOpacity 
          style={styles.continueBtn} 
          onPress={() => navigation.navigate('PretestScreen')} 
          activeOpacity={0.8}
        >
          <Text style={styles.continueText}>TAP TO CONTINUE</Text>
        </TouchableOpacity>
        
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  gameBackground: {
    flex: 1,
    backgroundColor: '#81D4FA', // ใช้ฟ้าเดิมของคุณ
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: 'flex-start',
    zIndex: 10, // 👈 เพิ่ม zIndex ป้องกันไม่ให้ปุ่มโดนบล็อค
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
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginTop: -30,
  },
  speechBubble: {
    backgroundColor: '#FFFFFF',
    padding: 25,
    borderRadius: 30, // มนขึ้น
    width: width * 0.9,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  speechText: {
    color: '#0288D1',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -12,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF', // เข้ากับสี bubble
  },
  mascotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 50,
  },
  mascot: { 
    width: width * 0.6,
    height: width * 0.6,
  },
  mascotGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  continueBtn: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    shadowOpacity: 0.3,
    elevation: 5,
  },
  continueText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

export default PretestNoti;