import React, { useEffect } from 'react';
import { View, Image, ImageBackground, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig'; // ปรับ path ตามโครงสร้างโฟลเดอร์จริงของคุณ
import { isPretestDone } from './services/scoreService'; // 🌟 เพิ่ม import ฟังก์ชันตรวจสอบสถานะ Pre-test

const { width, height } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {

  // เพิ่ม useEffect สำหรับจัดการระบบล็อกอินและตรวจสอบข้อมูลใน Firestore อัตโนมัติ
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // ถ้าเครื่องนี้เคยล็อกอินอยู่แล้ว ใช้ UID เดิม
        console.log("Using existing user UID:", user.uid);
        await checkOrCreateUserInFirestore(user.uid);
      } else {
        // ถ้ายังไม่เคย ให้สร้าง Anonymous User ใหม่ครั้งเดียว
        try {
          const userCredential = await signInAnonymously(auth);
          const newUser = userCredential.user;
          console.log("Created new anonymous user:", newUser.uid);
          await checkOrCreateUserInFirestore(newUser.uid);
        } catch (error) {
          console.error("Anonymous auth error:", error);
        }
      }
    });

    return unsubscribe;
  }, []);

  // ฟังก์ชันเช็กหรือสร้างข้อมูลตั้งต้นใน Firestore (ไม่สร้างซ้ำซ้อนถ้ามีไอดีอยู่แล้ว)
  const checkOrCreateUserInFirestore = async (uid) => {
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: `Player_${uid.substring(0, 4)}`,
          coins: 0,
          hasCompletedPretest: false,
          pretestScore: 0,
          posttestsScore: 0,
          level: "Beginner",
          status: "online",
          createdAt: serverTimestamp(),
        });
        console.log("✅ สร้างข้อมูล User ใหม่ใน Firestore สำเร็จ");
      } else {
        console.log("📌 พบข้อมูล User เดิมใน Firestore แล้ว");
      }
    } catch (error) {
      console.error("Error checking/creating user in Firestore:", error);
    }
  };

  // ฟังก์ชันจัดการการนำทางเมื่อกดปุ่ม Play
  const goNext = async () => {
    const done = await isPretestDone();
    navigation.reset({ index: 0, routes: [{ name: done ? "HomeScreen" : "PretestNoti" }] });
  };

  return (
    <ImageBackground 
      source={require('../../../assets/background-splash.png')}
      style={styles.bg}
    >
      <View style={styles.container}>
        <View style={styles.logoArea}>
          <Image 
            source={require('../../../assets/Logo-project.png')} 
            style={styles.logo} 
            resizeMode="contain" 
          />
        </View>

        <TouchableOpacity 
          style={styles.playArea} 
          onPress={goNext}
        >
          <Image 
            source={require('../../../assets/play-button.png')} 
            style={styles.playButton} 
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { 
    flex: 1, 
    width: '100%', 
    height: '100%' ,
  },
  container: { 
    flex: 1, 
    backgroundColor: 'transparent',
    justifyContent: 'flex-start', 
    alignItems: 'center',
    paddingVertical : height * 0.1,

    alignSelf: 'center', 
    width: width > 500 ? 375 : '100%', 
    maxWidth: 500, 
    borderWidth: width > 500 ? 1 : 0, 
    borderColor: '#ddd',
  },   
  logoArea: {
    marginTop: height * 0.1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '50%',
    height: height * 0.1, 
  },
  logo: { 
    width: width * 0.99, 
  },
  playArea: { 
    marginTop: height * 0.2, 
    alignSelf : 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: { 
    width: 200, 
    height: 350, 
    resizeMode: 'contain',
  },
});

export default WelcomeScreen;