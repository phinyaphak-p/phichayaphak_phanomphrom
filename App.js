import React, { useState, useEffect } from 'react';
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import LoadingScreen from "./src/data/screens/LoadingScreen";
import PretestNoti from "./src/data/screens/PretestNoti";
import PreTestScreen from "./src/data/screens/PretestScreen";
// import PretestResultScreen from "./src/data/screens/PretestResultScreen";
import WelcomeScreen from "./src/data/screens/WelcomeScreen";
import HomeScreen from "./src/data/screens/HomeScreen";
import ProfileScreen from "./src/data/screens/ProfileScreen";
import GrammarScreen from "./src/data/screens/GrammarScreen";
import GrammarLevelsScreen from "./src/data/screens/GrammarLevelsScreen";
import GrammarGameplayScreen from "./src/data/screens/GrammarGameplayScreen";
import BattleScreen from './src/data/screens/BattleScreen';
import CrosswordScreen from './src/data/screens/CrosswordScreen';
import CrosswordLevelsScreen from './src/data/screens/CrosswordLevelsScreen';
import CrosswordLevelListScreen from './src/data/screens/CrosswordLevelListScreen';
import SpellingLevelsScreen from './src/data/screens/SpellingLevelsScreen';
import SpellingScreen from './src/data/screens/SpellingScreen';
import SpellingLevelListScreen from './src/data/screens/SpellingLevelListScreen';
import PosttestScreen from './src/data/screens/PosttestScreen';
import GrammarPostTestScreen from './src/data/screens/GrammarPostTestScreen';
import BattleGameScreen from './src/data/screens/BattleGameScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} 
         initialRouteName="LoadingScreen"
        >
        {/* 🌟 แก้จาก name="Loading" เป็น name="LoadingScreen" ให้ตรงกับ initialRouteName */}
        <Stack.Screen name="LoadingScreen" component={LoadingScreen} />
        
        <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
        <Stack.Screen name="PretestNoti" component={PretestNoti} />
        <Stack.Screen name="PretestScreen" component={PreTestScreen} />
        {/* <Stack.Screen name="PretestResultScreen" component={PretestResultScreen} /> */}
        <Stack.Screen name="HomeScreen" component={HomeScreen} />
        <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
        <Stack.Screen name="GrammarScreen" component={GrammarScreen} />
        <Stack.Screen name="GrammarLevelsScreen" component={GrammarLevelsScreen} />
        <Stack.Screen name="GrammarGameplayScreen" component={GrammarGameplayScreen} />
        <Stack.Screen name="BattleScreen" component={BattleScreen} />
        <Stack.Screen name="CrosswordScreen" component={CrosswordScreen} />
        <Stack.Screen name="CrosswordLevelsScreen" component={CrosswordLevelsScreen} />
        <Stack.Screen name="CrosswordLevelListScreen" component={CrosswordLevelListScreen} />
        <Stack.Screen name="SpellingLevelsScreen" component={SpellingLevelsScreen} />
        <Stack.Screen name="SpellingScreen" component={SpellingScreen} />
        <Stack.Screen name="SpellingLevelListScreen" component={SpellingLevelListScreen} />
        <Stack.Screen name="PosttestScreen" component={PosttestScreen} />
        <Stack.Screen name="GrammarPostTestScreen" component={GrammarPostTestScreen} />
        <Stack.Screen name="BattleGameScreen" component={BattleGameScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}