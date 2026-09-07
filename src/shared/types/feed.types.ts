export interface Story {
  id: string;
  user: string;
  avatar: string;
  seen: boolean;
  isOwn?: boolean;
}

export interface OnboardingSlide {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: [string, string];
}