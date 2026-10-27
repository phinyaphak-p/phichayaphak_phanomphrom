import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BottomNavBar = ({ navigation, activeTab }) => {
  const insets = useSafeAreaInsets();
  const navBarHeight = 70;
  const bottomPadding = Math.max(insets.bottom, 10);
  const totalNavHeight = navBarHeight + bottomPadding;

  const navigateTo = (screenName) => {
    if (activeTab !== screenName) {
      navigation.navigate(screenName);
    }
  };

  return (
    <View style={[styles.navBar, { height: totalNavHeight, paddingBottom: bottomPadding }]}>
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
  );
};

const styles = StyleSheet.create({
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
    borderTopWidth: 1,
    borderColor: "#F1F1F1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 12, fontWeight: "700", color: "#9E9E9E", marginTop: 4 },
});

export default BottomNavBar;