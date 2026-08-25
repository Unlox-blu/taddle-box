import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../types';

// App-wide navigation ref so non-component code (notification banners, deep
// links, push response handlers) can navigate without being inside the tree.
// Kept in a separate file to prevent require cycles.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
