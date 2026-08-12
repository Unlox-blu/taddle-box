import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect, Path, Circle } from 'react-native-svg';

// ── The 57-Step Path Breakdown ────────────────────────────────────────────────
// Reference-style dark info page: an icon + title header, then a three-column
// table (Path Step Number | Board Section | Description) that walks a Ludo
// coin from its starting square to the center home across the 57 steps.
// The palette is the reference's own charcoal — the page deliberately ignores
// the app theme so it renders exactly like the design.

// Bold accent used inside description sentences (declared before ROWS so the
// module-level data can reference it without touching the StyleSheet).
const BOLD: { color: string; fontWeight: '800' } = {
  color: '#FFFFFF',
  fontWeight: '800',
};

const ROWS: {
  step: string;
  section: string;
  description: React.ReactNode;
}[] = [
  {
    step: 'Step 1',
    section: 'The Starting Square',
    description: 'The designated colored square where your coin first lands after you roll a 6.',
  },
  {
    step: 'Steps 2 to 51',
    section: 'The Outer Track',
    description: (
      <>
        The <Text style={BOLD}>50 squares</Text> of the shared perimeter track
        where your token travels clockwise around the entire board.
      </>
    ),
  },
  {
    step: 'Step 51',
    section: 'The Turn-In Square',
    description: 'The final white square on the outer perimeter, located directly beneath your color\'s home runway.',
  },
  {
    step: 'Steps 52 to 56',
    section: 'The Home Column',
    description: (
      <>
        The <Text style={BOLD}>5 colored safe squares</Text> leading up the ramp
        toward the center. No other player can enter this zone.
      </>
    ),
  },
  {
    step: 'Step 57',
    section: 'The Center Home',
    description: (
      <>
        The final destination triangle. You must roll an <Text style={BOLD}>exact number</Text> to land here perfectly.
      </>
    ),
  },
];

// Small square map tile — blue terrain with a green landmass and a white
// route line, matching the reference header icon.
function MapIcon({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Defs>
        <SvgGrad id="mapBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#56A4F8" />
          <Stop offset="1" stopColor="#1B5FD0" />
        </SvgGrad>
      </Defs>
      <Rect x={1} y={1} width={42} height={42} rx={9} fill="url(#mapBg)" />
      {/* Green landmass */}
      <Path
        d="M7 31 L14 22 L20 28 L27 19 L37 25 L37 37 L7 37 Z"
        fill="#3ECF6E"
      />
      <Path
        d="M20 28 L27 19 L37 25"
        fill="none"
        stroke="#2BA84A"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Route line + destination dot */}
      <Path
        d="M7 31 L14 22 L20 28 L27 19"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={27} cy={19} r={2.6} fill="#FFE066" />
    </Svg>
  );
}

export default function LudoPathScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.root}>
      {/* Top bar — back navigation only */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color="#E8E8EE" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Header: icon + title */}
        <View style={styles.titleRow}>
          <MapIcon />
          <Text style={styles.title}>The 57-Step Path Breakdown</Text>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.colStep, styles.headerText]}>Path Step Number</Text>
            <Text style={[styles.cell, styles.colSection, styles.headerText]}>Board Section</Text>
            <Text style={[styles.cell, styles.colDesc, styles.headerText]}>Description</Text>
          </View>

          {ROWS.map((r, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cell, styles.colStep, styles.stepText]}>{r.step}</Text>
              <Text style={[styles.cell, styles.colSection, styles.sectionText]}>{r.section}</Text>
              <Text style={[styles.cell, styles.colDesc, styles.descText]}>{r.description}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1E1E24',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A33',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 24,
  },
  title: {
    flex: 1,
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 27,
  },
  table: {
    backgroundColor: '#26262E',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A45',
  },
  headerRow: {
    backgroundColor: '#2F2F3A',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#4A4A58',
  },
  cell: {
    fontSize: 13,
    lineHeight: 19,
  },
  colStep: {
    width: 96,
    paddingRight: 10,
  },
  colSection: {
    flex: 1,
    paddingRight: 10,
  },
  colDesc: {
    flex: 1.9,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B9B9C4',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepText: {
    color: '#F2F2F5',
    fontWeight: '700',
  },
  sectionText: {
    color: '#F2F2F5',
    fontWeight: '600',
  },
  descText: {
    color: '#C9C9D2',
  },
});
