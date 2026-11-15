import { api } from '@/lib/api';
import type {
  AiConversation,
  Attachment,
  Call,
  CallType,
  Comment,
  Conversation,
  Education,
  Experience,
  FollowRequest,
  Meeting,
  Message,
  Notification,
  Post,
  PostVisibility,
  ReactionType,
  SharedAiConversation,
  User,
} from '@/types';

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const authService = {
  async register(input: {
    name: string;
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  }) {
    return api.post<{ user: User; emailVerificationSent: boolean }>('/auth/register', input);
  },
  async login(input: { email: string; password: string; rememberMe?: boolean }) {
    return api.post<{ user: User }>('/auth/login', input);
  },
  async logout() {
    return api.post<{ success: boolean }>('/auth/logout');
  },
  async me() {
    return api.get<{ user: User }>('/auth/me');
  },
  forgotPassword: (email: string) =>
    api.post<{ success: boolean; message: string; devResetToken?: string }>(
      '/auth/forgot-password',
      { email },
    ),
  resetPassword: (token: string, password: string, confirmPassword: string) =>
    api.post<{ success: boolean }>('/auth/reset-password', {
      token,
      password,
      confirmPassword,
    }),
  verifyEmail: (token: string) =>
    api.post<{ success: boolean }>('/auth/verify-email', { token }),
  resendVerification: () =>
    api.post<{ success: boolean; sent: boolean; autoVerified?: boolean }>(
      '/auth/resend-verification',
    ),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    api.post<{ success: boolean }>('/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword,
    }),
  oauthUrl: (provider: 'google' | 'facebook') => `${API_ORIGIN}/api/auth/oauth/${provider}`,
};

export const usersService = {
  getProfile: (username: string) => api.get<User>(`/users/${encodeURIComponent(username)}`),
  search: (q: string, take = 20) =>
    api.get<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q)}&take=${take}`),
  suggestions: () => api.get<{ users: User[] }>('/users/suggestions'),
  follow: (username: string) =>
    api.post<{ following: boolean; requested: boolean }>(
      `/users/${encodeURIComponent(username)}/follow`,
    ),
  followers: (username: string) =>
    api.get<{ users: User[] }>(`/users/${encodeURIComponent(username)}/followers`),
  following: (username: string) =>
    api.get<{ users: User[] }>(`/users/${encodeURIComponent(username)}/following`),
  updateProfile: (input: Record<string, unknown>) =>
    api.patch<User>('/users/me/profile', input),
  addExperience: (input: Record<string, unknown>) =>
    api.post<Experience>('/users/me/experiences', input),
  updateExperience: (id: string, input: Record<string, unknown>) =>
    api.patch<Experience>(`/users/me/experiences/${id}`, input),
  deleteExperience: (id: string) => api.delete(`/users/me/experiences/${id}`),
  addEducation: (input: Record<string, unknown>) =>
    api.post<Education>('/users/me/educations', input),
  updateEducation: (id: string, input: Record<string, unknown>) =>
    api.patch<Education>(`/users/me/educations/${id}`, input),
  deleteEducation: (id: string) => api.delete(`/users/me/educations/${id}`),
  followRequests: () => api.get<{ requests: FollowRequest[] }>('/users/me/follow-requests'),
  acceptFollowRequest: (id: string) =>
    api.post<{ success: boolean }>(`/users/me/follow-requests/${id}/accept`),
  rejectFollowRequest: (id: string) =>
    api.post<{ success: boolean }>(`/users/me/follow-requests/${id}/reject`),
  block: (username: string) =>
    api.post<{ blocked: boolean }>(`/users/${encodeURIComponent(username)}/block`),
  unblock: (username: string) =>
    api.delete<{ blocked: boolean }>(`/users/${encodeURIComponent(username)}/block`),
  blocked: () => api.get<{ users: User[] }>('/users/me/blocked'),
  report: (username: string, reason: string, details?: string) =>
    api.post<{ success: boolean }>(`/users/${encodeURIComponent(username)}/report`, {
      reason,
      details,
    }),
  deleteAccount: (password: string) =>
    api.delete<{ success: boolean }>('/users/me', { password }),
};

export const postsService = {
  feed: (params?: { username?: string; take?: number; skip?: number }) => {
    const qs = new URLSearchParams();
    if (params?.username) qs.set('username', params.username);
    if (params?.take) qs.set('take', String(params.take));
    if (params?.skip) qs.set('skip', String(params.skip));
    const query = qs.toString();
    return api.get<{ posts: Post[] }>(`/posts${query ? `?${query}` : ''}`);
  },
  search: (q: string) =>
    api.get<{ posts: Post[] }>(`/posts/search?q=${encodeURIComponent(q)}`),
  get: (id: string) => api.get<Post>(`/posts/${id}`),
  create: (input: {
    content: string;
    visibility?: PostVisibility;
    attachments?: Omit<Attachment, 'id'>[];
  }) => api.post<Post>('/posts', input),
  update: (
    id: string,
    input: {
      content?: string;
      visibility?: PostVisibility;
      attachments?: Omit<Attachment, 'id'>[];
    },
  ) => api.patch<Post>(`/posts/${id}`, input),
  remove: (id: string) => api.delete<{ success: boolean }>(`/posts/${id}`),
  react: (id: string, type: ReactionType) =>
    api.post<{
      reactions: Record<string, number>;
      reactionCount: number;
      myReaction: ReactionType | null;
    }>(`/posts/${id}/react`, { type }),
  reactors: (id: string) =>
    api.get<{ reactors: { type: ReactionType; user: User; createdAt: string }[] }>(
      `/posts/${id}/reactions`,
    ),
  repost: (id: string, content?: string) => api.post<Post>(`/posts/${id}/repost`, { content }),
  hide: (id: string) => api.post<{ success: boolean }>(`/posts/${id}/hide`),
  unhide: (id: string) => api.delete<{ success: boolean }>(`/posts/${id}/hide`),
  report: (id: string, reason: string, details?: string) =>
    api.post<{ success: boolean }>(`/posts/${id}/report`, { reason, details }),
  share: (id: string, input: { username?: string; conversationId?: string; message?: string }) =>
    api.post<{ conversationId: string; message: Message }>(`/posts/${id}/share`, input),
  comments: (id: string) => api.get<Comment[]>(`/posts/${id}/comments`),
  addComment: (id: string, input: { content: string; parentId?: string }) =>
    api.post<Comment>(`/posts/${id}/comments`, input),
  likeComment: (postId: string, commentId: string) =>
    api.post<{ liked: boolean; likeCount: number }>(
      `/posts/${postId}/comments/${commentId}/like`,
    ),
  deleteComment: (postId: string, commentId: string) =>
    api.delete<{ success: boolean }>(`/posts/${postId}/comments/${commentId}`),
};

export const conversationsService = {
  list: (params?: { archived?: boolean; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.archived) qs.set('archived', '1');
    if (params?.q) qs.set('q', params.q);
    const query = qs.toString();
    return api.get<{ conversations: Conversation[] }>(
      `/conversations${query ? `?${query}` : ''}`,
    );
  },
  create: (input: { username?: string; userId?: string }) =>
    api.post<{ conversation: Conversation; created: boolean }>('/conversations', input),
  get: (id: string) => api.get<Conversation>(`/conversations/${id}`),
  messages: (id: string, q?: string) =>
    api.get<{ messages: Message[] }>(
      `/conversations/${id}/messages${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),
  send: (
    id: string,
    input: { content?: string; replyToId?: string; attachments?: Attachment[] },
  ) => api.post<Message>(`/conversations/${id}/messages`, input),
  read: (id: string) => api.post<{ success: boolean; readAt: string }>(`/conversations/${id}/read`),
  update: (id: string, input: { archived?: boolean; muted?: boolean }) =>
    api.patch<Conversation>(`/conversations/${id}`, input),
  remove: (id: string) => api.delete<{ success: boolean }>(`/conversations/${id}`),
  editMessage: (messageId: string, content: string) =>
    api.patch<Message>(`/conversations/messages/${messageId}`, { content }),
  deleteMessage: (messageId: string) =>
    api.delete<Message>(`/conversations/messages/${messageId}`),
  reactMessage: (messageId: string, emoji: string) =>
    api.post<Message>(`/conversations/messages/${messageId}/react`, { emoji }),
};

export const notificationsService = {
  list: () => api.get<Notification[]>('/notifications'),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ success: boolean }>('/notifications/read-all'),
};

export const aiService = {
  listConversations: (q?: string) =>
    api.get<AiConversation[]>(
      `/ai/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),
  createConversation: (title?: string) =>
    api.post<AiConversation>('/ai/conversations', { title }),
  getConversation: (id: string) => api.get<AiConversation>(`/ai/conversations/${id}`),
  renameConversation: (id: string, title: string) =>
    api.patch<AiConversation>(`/ai/conversations/${id}`, { title }),
  deleteConversation: (id: string) => api.delete<{ success: boolean }>(`/ai/conversations/${id}`),
  sendMessage: (
    id: string,
    input: { content?: string; attachments?: Attachment[] },
  ) =>
    api.post<{ userMessage: unknown; assistantMessage: unknown; conversationId: string }>(
      `/ai/conversations/${id}/messages`,
      input,
    ),
  regenerate: (id: string) =>
    api.post<{ assistantMessage: unknown; conversationId: string }>(
      `/ai/conversations/${id}/regenerate`,
    ),
  share: (id: string) =>
    api.post<{ token: string; path: string }>(`/ai/conversations/${id}/share`),
  unshare: (id: string) => api.delete<{ success: boolean }>(`/ai/conversations/${id}/share`),
  getShared: (token: string) => api.get<SharedAiConversation>(`/ai/shared/${token}`),
};

export const uploadService = {
  async avatar(file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string }>('/upload/avatar', form, true);
  },
  async file(file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.post<Attachment>('/upload/file', form, true);
  },
};

export const callsService = {
  start: (input: { calleeUsername?: string; calleeId?: string; type: CallType }) =>
    api.post<Call>('/calls', input),
  history: () => api.get<Call[]>('/calls/history'),
  get: (id: string) => api.get<Call>(`/calls/${id}`),
  accept: (id: string) => api.patch<Call>(`/calls/${id}/accept`),
  reject: (id: string) => api.patch<Call>(`/calls/${id}/reject`),
  end: (id: string) => api.patch<Call>(`/calls/${id}/end`),
  createMeeting: (input: {
    title: string;
    description?: string;
    scheduledAt?: string;
    participantUsernames?: string[];
  }) => api.post<Meeting>('/meetings', input),
  meetings: () => api.get<Meeting[]>('/meetings'),
  meeting: (roomCode: string) => api.get<Meeting>(`/meetings/${roomCode}`),
  joinMeeting: (roomCode: string) => api.post<Meeting>(`/meetings/${roomCode}/join`),
  leaveMeeting: (roomCode: string) =>
    api.post<{ success: boolean }>(`/meetings/${roomCode}/leave`),
  endMeeting: (roomCode: string) => api.post<Meeting>(`/meetings/${roomCode}/end`),
};
