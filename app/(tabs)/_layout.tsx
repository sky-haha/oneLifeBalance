import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#3B82F6",
        tabBarStyle: {
          backgroundColor: "#000000ff",
          borderTopColor: "#111827",
        },
        tabBarLabelStyle: { fontSize: 12 },
        lazy:false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "메인",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "고정 할 일",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="paper-plane" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="login"
        options={{
          title: "회원정보",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="lock-closed" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="signup" options={{ href: null }} />
       <Tabs.Screen
        name="purpose"
        options={{
          href: null,          
          headerShown: false,   
        }}
      />
        <Tabs.Screen
        name="playground"
        options={{
          title: "분석",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flag-outline" size={size} color={color} />
          ),
        }}
        />
    </Tabs>
    
    
  );
}
