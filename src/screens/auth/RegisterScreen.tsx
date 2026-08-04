import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, fontSizes, spacing } from "../../theme";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import type { AuthStackParamList } from "../../types";
import { authService } from "../../services/auth.service";
import * as Location from "expo-location";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

const STEPS = ["Account", "Profile", "Interests"];

const INTEREST_OPTIONS = [
  "🎮 Gaming",
  "💻 Coding",
  "🎨 Design",
  "📚 Study",
  "🏆 Sports",
  "🎵 Music",
  "🚀 Startups",
  "🤖 AI/ML",
  "📱 Mobile Dev",
  "🌐 Web Dev",
  "🔒 Cybersecurity",
  "☁️ Cloud",
];

const COUNTRY_CODES = [
  { code: "+91", name: "India" },
  { code: "+1", name: "USA / Canada" },
  { code: "+44", name: "United Kingdom" },
  { code: "+61", name: "Australia" },
  { code: "+81", name: "Japan" },
  { code: "+49", name: "Germany" },
  { code: "+33", name: "France" },
  { code: "+86", name: "China" },
  { code: "+971", name: "UAE" },
  { code: "+92", name: "Pakistan" },
  { code: "+880", name: "Bangladesh" },
  { code: "+94", name: "Sri Lanka" },
  { code: "+65", name: "Singapore" },
  { code: "+60", name: "Malaysia" },
  { code: "+62", name: "Indonesia" },
  { code: "+63", name: "Philippines" },
  { code: "+66", name: "Thailand" },
  { code: "+84", name: "Vietnam" },
  { code: "+82", name: "South Korea" },
  { code: "+7", name: "Russia" },
  { code: "+55", name: "Brazil" },
  { code: "+52", name: "Mexico" },
  { code: "+27", name: "South Africa" },
  { code: "+234", name: "Nigeria" },
  { code: "+254", name: "Kenya" },
  { code: "+20", name: "Egypt" },
  { code: "+90", name: "Turkey" },
  { code: "+98", name: "Iran" },
  { code: "+966", name: "Saudi Arabia" },
  { code: "+39", name: "Italy" },
  { code: "+34", name: "Spain" },
  { code: "+31", name: "Netherlands" },
  { code: "+41", name: "Switzerland" },
  { code: "+46", name: "Sweden" },
  { code: "+47", name: "Norway" },
  { code: "+45", name: "Denmark" },
  { code: "+358", name: "Finland" },
  { code: "+48", name: "Poland" },
  { code: "+43", name: "Austria" },
  { code: "+32", name: "Belgium" },
  { code: "+351", name: "Portugal" },
  { code: "+30", name: "Greece" },
  { code: "+353", name: "Ireland" },
  { code: "+64", name: "New Zealand" },
  { code: "+54", name: "Argentina" },
  { code: "+56", name: "Chile" },
  { code: "+57", name: "Colombia" },
  { code: "+51", name: "Peru" },
  { code: "+58", name: "Venezuela" },
  { code: "+93", name: "Afghanistan" },
  { code: "+977", name: "Nepal" },
  { code: "+95", name: "Myanmar" },
  { code: "+852", name: "Hong Kong" },
  { code: "+886", name: "Taiwan" },
  { code: "+673", name: "Brunei" },
  { code: "+855", name: "Cambodia" },
  { code: "+856", name: "Laos" },
];

export default function RegisterScreen({ navigation, route }: Props) {
  // @ts-ignore
  const { socialToken, socialData } = route.params || {};

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Step 0 — Account
  const [name, setName] = useState(socialData?.name || "");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(socialData?.email || "");
  const [countryCode, setCountryCode] = useState("+91");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "loading" | "available" | "taken"
  >("idle");
  const [usernameError, setUsernameError] = useState("");

  // Step 1 — Profile
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dobDate, setDobDate] = useState(new Date(2000, 0, 1));

  const [gender, setGender] = useState('');
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const GENDER_OPTIONS = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' }
  ];

  const [location, setLocation] = useState("");
  const [locationCoords, setLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const locationCoordsRef = React.useRef<{lat: number, lng: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationResults, setLocationResults] = useState<any[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [isTypingLocation, setIsTypingLocation] = useState(false);
  const [isLocationSearching, setIsLocationSearching] = useState(false);

  const [occupation, setOccupation] = useState("Student");
  const [showOccupationDropdown, setShowOccupationDropdown] = useState(false);

  const [organization, setOrganization] = useState("");
  const [collegeResults, setCollegeResults] = useState<any[]>([]);
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  const OCCUPATION_OPTIONS = [
    "Student",
    "Working Professional",
    "Self-employed / Freelancer",
    "Other",
  ];

  // Step 2 — Interests
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus("idle");
      setUsernameError("");
      return;
    }
    const timer = setTimeout(async () => {
      setUsernameStatus("loading");
      try {
        await authService.checkUsername(username);
        setUsernameStatus("available");
        setUsernameError("");
      } catch (e: any) {
        setUsernameStatus("taken");
        setUsernameError(e.response?.data?.message || "Username taken");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  // Email Domain Detection
  useEffect(() => {
    if (
      email &&
      email.includes("@") &&
      !organization &&
      occupation === "Student"
    ) {
      const domain = email.split("@")[1].toLowerCase();
      if (
        domain.endsWith(".edu") ||
        domain.endsWith(".ac.in") ||
        domain.endsWith(".ac.uk")
      ) {
        axios
          .get(`http://universities.hipolabs.com/search?domain=${domain}`)
          .then((res) => {
            if (res.data && res.data.length > 0) {
              setOrganization(res.data[0].name);
            }
          })
          .catch(() => {});
      }
    }
  }, [email, occupation]);

  // Location Live Search
  useEffect(() => {
    if (!isTypingLocation || location.length < 3) {
      setLocationResults([]);
      setIsLocationSearching(false);
      return;
    }
    setIsLocationSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=5`, {
          headers: { "User-Agent": "TaddleBoxApp/1.0" },
        });
        const uniqueItems = res.data
          .map((item: any) => ({
            name: item.display_name.split(",").slice(0, 3).join(",").trim(),
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          }))
          .filter(
            (v: any, i: number, a: any[]) =>
              a.findIndex((t) => t.name === v.name) === i,
          );
        setLocationResults(uniqueItems);
        setShowLocationDropdown(true);
      } catch (e) {
        console.log("Location search error");
      } finally {
        setIsLocationSearching(false);
      }
    }, 400); // reduced from 800ms for snappier feedback
    return () => clearTimeout(timer);
  }, [location, isTypingLocation]);

  // Location Detection
  const detectLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        alert("Permission to access location was denied");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        const city = place.city || place.subregion || place.region;
        const country = place.country;
        setLocation(`${city}, ${country}`);
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setLocationCoords(coords);
        locationCoordsRef.current = coords;
        setIsTypingLocation(false);
        setShowLocationDropdown(false);
      }
    } catch (error) {
      alert(
        "Could not fetch location. Ensure Location is enabled on your device.",
      );
    } finally {
      setLocationLoading(false);
    }
  };

  // Date Picker
  const onChangeDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "dismissed") {
      setShowDatePicker(false);
      return;
    }
    if (selectedDate) {
      setDobDate(selectedDate);
      const yyyy = selectedDate.getFullYear();
      const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const dd = String(selectedDate.getDate()).padStart(2, "0");
      setDateOfBirth(`${yyyy}-${mm}-${dd}`);

      if (Platform.OS === "ios") {
        // On iOS, let the user tap somewhere to close, or we can close on select
      }
    }
  };

  // College Live Search (Only for Student)
  useEffect(() => {
    if (occupation !== "Student" || organization.length < 3) {
      setCollegeResults([]);
      setShowCollegeDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(
          `http://universities.hipolabs.com/search?name=${encodeURIComponent(organization)}`,
        );
        const uniqueNames = Array.from(
          new Set(res.data.map((item: any) => item.name)),
        ).slice(0, 5);
        setCollegeResults(uniqueNames);
        if (uniqueNames.length > 0) {
          setShowCollegeDropdown(true);
        }
      } catch (e) {
        console.log("College search error");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [organization, occupation]);

  const selectCollege = (name: string) => {
    setOrganization(name);
    setShowCollegeDropdown(false);
  };

  const toggleInterest = (i: string) =>
    setInterests((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]));

  const validateStep0 = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    if (!username.trim()) errors.username = "Username is required";
    else if (usernameStatus === "taken")
      errors.username = "Please choose a different username";
    if (!email.trim() || !email.includes("@"))
      errors.email = "Valid email is required";
    if (!phone.trim()) errors.phone = "Phone number is required";
    if (!password || password.length < 8)
      errors.password = "Password must be at least 8 characters";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!gender) errors.gender = 'Gender is required';
    if (!dateOfBirth.trim()) errors.dateOfBirth = 'Date of Birth is required';
    if (!location.trim()) errors.location = 'Location is required';
    else if (!locationCoords)
      errors.location =
        "Please select a location from the suggestions or use auto-detect";

    if (occupation === "Student" && !organization.trim()) {
      errors.organization = "Institute or College is required";
    }
    if (occupation === "Working Professional" && !organization.trim()) {
      errors.organization = "Company or Organization is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    setFieldErrors({});
    if (step === 0) {
      if (!validateStep0()) return;
    } else if (step === 1) {
      if (!validateStep1()) return;
    } else if (step === 2) {
      if (interests.length < 3) {
        alert("Please select at least 3 interests to proceed.");
        return;
      }
    }

    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const signupData = {
        name: name.trim(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
        countryCode: countryCode.trim().startsWith("+")
          ? countryCode.trim()
          : "+" + countryCode.trim(),
        phone: phone.replace(/\D/g, ''), // Remove all non-digit characters (spaces, dashes, etc.)
        password,
        dateOfBirth: dateOfBirth.trim(),
        gender,
        location: location.trim(),
        latitude: locationCoords?.lat,
        longitude: locationCoords?.lng,
        occupation,
        organization: organization.trim(),
        interests,
        referralCode: referralCode.trim() || undefined,
        socialToken, // Pass this along so OTP screen/backend can use it
      };

      const res = await authService.sendOtp({
        email: signupData.email,
        countryCode: signupData.countryCode,
        phone: signupData.phone,
        socialToken,
      });
      const verificationToken =
        res.data?.verificationToken || res.verificationToken;

      // @ts-ignore
      navigation.navigate("OTP", { signupData, verificationToken });
    } catch (e: any) {
      console.log(
        "OTP Error response:",
        JSON.stringify(e.response?.data, null, 2),
      );
      const errors = e.response?.data?.errors;
      const errMsg = errors
        ? JSON.stringify(errors)
        : e.response?.data?.message || e.message;
      alert(errMsg || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#070714", "#0E0E24"]} style={styles.container}>
      <StatusBar style="light" />
      {/* On Android the window already resizes natively (adjustResize) and the
          ScrollView auto-scrolls the focused field into view — a height-based
          KeyboardAvoidingView fights that and leaves inputs hidden under the
          keyboard. iOS needs the manual "padding" lift; Android needs none. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : 'height'}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() =>
              step > 0 ? setStep((s) => s - 1) : navigation.goBack()
            }
            style={styles.back}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          {/* Progress steps */}
          <View style={styles.stepsRow}>
            {STEPS.map((s, i) => (
              <View key={i} style={styles.stepItem}>
                <View
                  style={[
                    styles.stepCircle,
                    i <= step && styles.stepCircleActive,
                  ]}
                >
                  {i < step ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Text style={[styles.stepNum, i === step && { color: '#fff' }]}>{i + 1}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    i <= step && styles.stepLabelActive,
                  ]}
                >
                  {s}
                </Text>
                {i < STEPS.length - 1 && (
                  <View
                    style={[styles.stepLine, i < step && styles.stepLineActive]}
                  />
                )}
              </View>
            ))}
          </View>

          {/* Step 0: Account */}
          {step === 0 && (
            <View>
              {/* Header */}
              <View style={{ marginBottom: 32 }}>
                <Image 
                  source={require('../../../TaddleBox_Logo.png')} 
                  style={{ width: 80, height: 80, borderRadius: 40, resizeMode: 'cover', alignSelf: 'flex-start', marginBottom: 12, marginLeft: -8 }} 
                />
                <Text style={styles.stepTitle}>Create your account 🚀</Text>
                <Text style={styles.stepSub}>
                  Let's get you started in 3 quick steps
                </Text>
              </View>
              <View style={styles.form}>
                <Input
                  label="Full Name"
                  icon="person-outline"
                  value={name}
                  onChangeText={setName}
                  placeholder="Arjun Kumar"
                  textContentType="name"
                  error={fieldErrors.name}
                />
                <Input
                  label="Email"
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="arjun@iitd.ac.in"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!socialToken}
                  textContentType="emailAddress"
                  autoComplete="email"
                  error={fieldErrors.email}
                />
                <View style={{ flexDirection: "row", gap: 8, zIndex: 30 }}>
                  <View style={{ flex: 0.35, zIndex: 30 }}>
                    <Input
                      label="Code"
                      icon="globe-outline"
                      value={countryCode}
                      rightIcon={
                        showCountryDropdown ? "chevron-up" : "chevron-down"
                      }
                      onPress={() => setShowCountryDropdown((prev) => !prev)}
                      onRightIconPress={() =>
                        setShowCountryDropdown((prev) => !prev)
                      }
                    />
                    {showCountryDropdown && (
                      <ScrollView
                        style={[
                          styles.dropdownContainer,
                          {
                            maxHeight: 200,
                            position: "absolute",
                            top: 75,
                            left: 0,
                            right: 0,
                          },
                        ]}
                        nestedScrollEnabled
                      >
                        {COUNTRY_CODES.map((item, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setCountryCode(item.code);
                              setShowCountryDropdown(false);
                            }}
                          >
                            <Text style={styles.dropdownText}>
                              {item.code} {item.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                  <View style={{ flex: 0.65, zIndex: 10 }}>
                    <Input
                      label="Phone Number"
                      icon="call-outline"
                      value={phone}
                      onChangeText={(text) =>
                        setPhone(text.replace(/[^0-9]/g, ""))
                      }
                      placeholder="98765 43210"
                      keyboardType="number-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      maxLength={15}
                      error={fieldErrors.phone}
                    />
                  </View>
                </View>
                <Input
                  label="Username"
                  icon="at-outline"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="arjunkumar_1"
                  autoCapitalize="none"
                  autoComplete="off"
                  error={fieldErrors.username || usernameError}
                  rightIcon={
                    usernameStatus === "loading"
                      ? "sync"
                      : usernameStatus === "available"
                        ? "checkmark-circle"
                        : usernameStatus === "taken"
                          ? "close-circle"
                          : undefined
                  }
                />
                <Input
                  label="Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 8 characters"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                  passwordRules="minlength: 8; required: lower; required: upper; required: digit; required: [-];"
                  error={fieldErrors.password}
                />
                <Input
                  label="Referral Code (Optional)"
                  icon="gift-outline"
                  value={referralCode}
                  onChangeText={(text) => setReferralCode(text.toUpperCase())}
                  placeholder="e.g. 8A2F9C4B — get 500 XP bonus"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                />
              </View>
            </View>
          )}

          {/* Step 1: Profile */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Tell us about you 👤</Text>
              <Text style={styles.stepSub}>
                Help your community know you better
              </Text>
              <View style={styles.form}>
                <View style={{ zIndex: 60 }}>
                  <Input 
                    label="Gender" 
                    icon="person-outline" 
                    value={gender ? GENDER_OPTIONS.find(g => g.value === gender)?.label : ''} 
                    placeholder="Select your gender"
                    rightIcon={showGenderDropdown ? 'chevron-up' : 'chevron-down'} 
                    onPress={() => setShowGenderDropdown(prev => !prev)}
                    onRightIconPress={() => setShowGenderDropdown(prev => !prev)}
                    error={fieldErrors.gender}
                  />
                  {showGenderDropdown && (
                    <View style={[styles.dropdownContainer, { position: 'absolute', top: 80, left: 0, right: 0, zIndex: 100 }]}>
                      {GENDER_OPTIONS.map((opt, idx) => (
                        <TouchableOpacity key={idx} style={styles.dropdownItem} onPress={() => {
                          setGender(opt.value);
                          setShowGenderDropdown(false);
                        }}>
                          <Text style={styles.dropdownText}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <View style={{ zIndex: 50 }}>
                  <Input
                    label="Date of Birth"
                    icon="calendar-outline"
                    value={dateOfBirth}
                    placeholder="YYYY-MM-DD"
                    error={fieldErrors.dateOfBirth}
                    onPress={() => setShowDatePicker(true)}
                  />
                  {showDatePicker && Platform.OS === "ios" ? (
                    <Modal visible={true} transparent animationType="slide">
                      <View
                        style={{
                          flex: 1,
                          justifyContent: "flex-end",
                          backgroundColor: "rgba(0,0,0,0.6)",
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: colors.bg.elevated,
                            paddingBottom: 40,
                            borderTopLeftRadius: 24,
                            borderTopRightRadius: 24,
                          }}
                        >
                          <View
                            style={[
                              styles.iosDatePickerHeader,
                              { borderBottomColor: colors.border },
                            ]}
                          >
                            <TouchableOpacity
                              onPress={() => setShowDatePicker(false)}
                            >
                              <Text
                                style={{
                                  color: colors.primaryLight,
                                  fontWeight: "bold",
                                  fontSize: 16,
                                }}
                              >
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <DateTimePicker
                            value={dobDate}
                            mode="date"
                            display="spinner"
                            themeVariant="dark"
                            textColor="#ffffff"
                            maximumDate={new Date()}
                            onChange={onChangeDate}
                            style={{ height: 200 }}
                          />
                        </View>
                      </View>
                    </Modal>
                  ) : showDatePicker && Platform.OS === "android" ? (
                    <DateTimePicker
                      value={dobDate}
                      mode="date"
                      display="default"
                      maximumDate={new Date()}
                      onChange={onChangeDate}
                    />
                  ) : null}
                </View>
                <View style={{ zIndex: 40 }}>
                  <Input
                    label="City / Location"
                    icon="location-outline"
                    value={location}
                    placeholder="e.g. Bangalore, India"
                    rightIcon={locationLoading ? "sync" : "locate"}
                    onRightIconPress={detectLocation}
                    error={fieldErrors.location}
                    onChangeText={(text) => {
                      setLocation(text);
                      setLocationCoords(null);
                      locationCoordsRef.current = null;
                      setIsTypingLocation(true);
                      setShowLocationDropdown(true);
                    }}
                    onFocus={() => {
                      setShowLocationDropdown(true);
                      if (!location.trim()) {
                        detectLocation();
                      }
                    }}
                    onBlur={() => setTimeout(() => {
                      setShowLocationDropdown(false);
                      if (!locationCoordsRef.current) {
                        setLocation('');
                      }
                    }, 250)}
                  />
                  {showLocationDropdown && location.length > 0 && (
                    <View style={[styles.dropdownContainer, { position: 'absolute', top: 80, left: 0, right: 0, zIndex: 100, maxHeight: 250 }]}>
                      <ScrollView keyboardShouldPersistTaps="handled">
                        <TouchableOpacity style={[styles.dropdownItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={() => {
                          detectLocation();
                          setShowLocationDropdown(false);
                        }}>
                          <Ionicons name="locate" size={16} color={colors.primaryLight} style={{ marginRight: 8 }} />
                          <Text style={[styles.dropdownText, { color: colors.primaryLight, fontWeight: '700' }]}>
                            Auto-detect my location
                          </Text>
                        </TouchableOpacity>
                        {location.length < 3 ? (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm }}>Type at least 3 letters to search...</Text>
                          </View>
                        ) : isLocationSearching ? (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm }}>Searching...</Text>
                          </View>
                        ) : locationResults.length === 0 ? (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm }}>No locations found for "{location}"</Text>
                          </View>
                        ) : (
                          locationResults.map((item, idx) => (
                            <TouchableOpacity key={idx} style={styles.dropdownItem} onPress={() => {
                              setIsTypingLocation(false);
                              setLocation(item.name);
                              const coords = { lat: item.lat, lng: item.lon };
                              setLocationCoords(coords);
                              locationCoordsRef.current = coords;
                              setShowLocationDropdown(false);
                            }}>
                              <Ionicons name="location-outline" size={16} color={colors.text.muted} style={{ marginRight: 8 }} />
                              <Text style={styles.dropdownText}>{item.name}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
                <View style={{ zIndex: 20 }}>
                  <Input
                    label="What best describes you?"
                    icon="briefcase-outline"
                    value={occupation}
                    rightIcon={
                      showOccupationDropdown ? "chevron-up" : "chevron-down"
                    }
                    onPress={() => setShowOccupationDropdown((prev) => !prev)}
                    onRightIconPress={() =>
                      setShowOccupationDropdown((prev) => !prev)
                    }
                  />
                  {showOccupationDropdown && (
                    <View style={styles.dropdownContainer}>
                      {OCCUPATION_OPTIONS.map((opt, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setOccupation(opt);
                            setShowOccupationDropdown(false);
                            setOrganization(""); // Reset organization when type changes
                          }}
                        >
                          <Text style={styles.dropdownText}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {occupation !== "Other" && (
                  <View style={{ zIndex: 10 }}>
                    <Input
                      label={
                        occupation === "Student"
                          ? "What is your school, college, or university?"
                          : occupation === "Working Professional"
                            ? "What company do you work for?"
                            : "Occupation / Title (Optional)"
                      }
                      icon={
                        occupation === "Student"
                          ? "school-outline"
                          : "business-outline"
                      }
                      value={organization}
                      onChangeText={(text) => {
                        setOrganization(text);
                        if (occupation === "Student" && text.length >= 3)
                          setShowCollegeDropdown(true);
                        else setShowCollegeDropdown(false);
                      }}
                      placeholder={
                        occupation === "Student"
                          ? "e.g. Stanford University"
                          : occupation === "Working Professional"
                            ? "e.g. Google"
                            : "e.g. Freelance Designer"
                      }
                      onFocus={() => {
                        if (
                          occupation === "Student" &&
                          collegeResults.length > 0
                        )
                          setShowCollegeDropdown(true);
                      }}
                      error={fieldErrors.organization}
                    />
                    {showCollegeDropdown &&
                      collegeResults.length > 0 &&
                      occupation === "Student" && (
                        <View style={styles.dropdownContainer}>
                          {collegeResults.map((item, idx) => (
                            <TouchableOpacity
                              key={idx}
                              style={styles.dropdownItem}
                              onPress={() => selectCollege(item as string)}
                            >
                              <Ionicons
                                name="school"
                                size={16}
                                color={colors.text.muted}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={styles.dropdownText}>
                                {item as string}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>What are you into? 🎯</Text>
              <Text style={styles.stepSub}>
                Pick at least 3 interests to personalize your feed
              </Text>
              <View style={styles.interestsGrid}>
                {INTEREST_OPTIONS.map((opt) => {
                  const selected = interests.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.interestChip,
                        selected && styles.interestChipSelected,
                      ]}
                      onPress={() => toggleInterest(opt)}
                    >
                      <Text
                        style={[
                          styles.interestText,
                          selected && styles.interestTextSelected,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.selectedCount}>
                {interests.length} selected
                {interests.length < 3
                  ? ` (${3 - interests.length} more to go)`
                  : " ✓"}
              </Text>
            </View>
          )}

          {/* CTA */}
          <Button
            label={step < 2 ? "Continue →" : "Create Account 🚀"}
            onPress={nextStep}
            variant="primary"
            fullWidth
            loading={loading}
            style={{ marginTop: 28 }}
          />

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.loginLink}>Log in →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 140 },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
    gap: 0,
  },
  stepItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepNum: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontWeight: "700",
  },
  stepLabel: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginLeft: 6,
    fontWeight: "600",
  },
  stepLabelActive: { color: colors.primaryLight },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 6,
  },
  stepLineActive: { backgroundColor: colors.primary },
  stepTitle: {
    fontSize: fontSizes.xxl,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 6,
  },
  stepSub: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    marginBottom: 24,
  },
  form: { gap: 2 },
  interestsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  interestChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderHover,
    backgroundColor: colors.bg.card,
  },
  interestChipSelected: {
    backgroundColor: "rgba(124,58,237,0.2)",
    borderColor: colors.primary,
  },
  interestText: {
    fontSize: fontSizes.sm,
    color: colors.text.secondary,
    fontWeight: "500",
  },
  interestTextSelected: { color: colors.primaryLight, fontWeight: "700" },
  selectedCount: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    marginTop: 12,
  },
  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  loginText: { fontSize: fontSizes.sm, color: colors.text.muted },
  loginLink: {
    fontSize: fontSizes.sm,
    color: colors.primaryLight,
    fontWeight: "700",
  },
  iosDatePicker: {
    backgroundColor: colors.bg.card,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  iosDatePickerHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownContainer: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    marginTop: -8,
    marginBottom: 16,
    overflow: "hidden",
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownText: {
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    flex: 1,
  },
});
