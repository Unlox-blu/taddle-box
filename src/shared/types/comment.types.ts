export interface Comment {
  id: string;
  postId: string;
  author: { id: string; name: string; handle: string; avatar: string };
  text: string;
  likes: number;
  isLiked: boolean;
  createdAt: string;
  replies?: number;
}