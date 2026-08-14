import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';


import OnboardingScreen    from '../screens/auth/OnboardingScreen';
import WelcomeScreen       from '../screens/auth/WelcomeScreen';
import LoginScreen         from '../screens/auth/LoginScreen';
import RegisterScreen      from '../screens/auth/RegisterScreen';
import OTPScreen           from '../screens/auth/OTPScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import TermsScreen          from '../screens/main/TermsScreen';
import PrivacyScreen        from '../screens/main/PrivacyScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  const { hasSeenOnboarding } = useAuth();
  
  return (
    <Stack.Navigator 
      initialRouteName={hasSeenOnboarding ? 'Welcome' : 'Onboarding'}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >

      <Stack.Screen name="Onboarding"      component={OnboardingScreen}     options={{ animation: 'fade' }} />
      <Stack.Screen name="Welcome"         component={WelcomeScreen}        options={{ animation: 'fade' }} />
      <Stack.Screen name="Login"           component={LoginScreen}          />
      <Stack.Screen name="Register"        component={RegisterScreen}       />
      <Stack.Screen name="OTP"             component={OTPScreen}            />
      <Stack.Screen name="ForgotPassword"  component={ForgotPasswordScreen} />
      <Stack.Screen name="Terms"           component={TermsScreen}          options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Privacy"         component={PrivacyScreen}        options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}
