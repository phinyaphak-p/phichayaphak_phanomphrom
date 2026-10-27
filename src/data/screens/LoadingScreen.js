import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, ImageBackground, Animated } from 'react-native';

const { width, height } = Dimensions.get('window');

const LoadingScreen = ({ navigation }) => {
  const [progress] = useState(new Animated.Value(0));
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start(() => navigation.replace('WelcomeScreen'));

    progress.addListener(({ value }) => setPercent(Math.floor(value * 100)));
  }, []);

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
        
        <View style={styles.loaderArea}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width * 0.7] }) }]} />
          </View>
          <Text style={styles.percent}>{percent}%</Text>
        </View>

        <View style={styles.footerSpacer} />
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { 
    flex: 1, 
    width: '100%', 
    height: '100%' 
  },
container: { 
    flex: 1, 
    backgroundColor: 'transparent', 
    justifyContent: 'flex-start', 
    alignItems: 'center',
    paddingVertical: height * 0.1 ,


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
    height: height * 0.1, // ปรับพื้นที่ของโซนโลโก้
  },
  logo: { 
    
    width: width * 0.99,
    resizeMode:'contain',
  },
  loaderArea: { 
    width: width * 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop : height * 0.25,
  },
  track: { 
    height: 16, 
    backgroundColor: 'rgba(255, 230, 150, 0.4)', 
    borderRadius: 10, 
    overflow: 'hidden',
    width: '100%'
  },
  fill: { 
    height: '100%', 
    backgroundColor: '#FFD700' 
  },
  percent: { 
    color: 'white', 
    textAlign: 'center', 
    marginTop: 15, 
    fontSize: 20, 
    fontWeight: 'bold',
    // ปรับส่วนเงาให้เหลือแค่พื้นฐานเพื่อลด Warning
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3
  },
  footerSpacer: {
    height: height * 0.15 
  }
});

export default LoadingScreen;