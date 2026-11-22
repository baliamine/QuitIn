export type UserRole = 'JOBSEEKER' | 'COMPANY';
export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
export type JobStatus = 'OPEN' | 'CLOSED';
export type ApplicationStatus = 'PENDING' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export interface JobCompany {
  id: string;
  username: string;
  profile: {
    avatarUrl: string | null;
    headline: string | null;
    company: string | null;
    location: string | null;
  } | null;
}

export interface Job {
  id: string;
  companyId?: string;
  company: JobCompany;
  title: string;
  description: string;
  location: string;
  type: JobType;
  salaryMin: number | null;
  salaryMax: number | null;
  status: JobStatus;
  createdAt: string;
  updatedAt?: string;
  _count?: { applications: number };
  applications?: { id: string; status: ApplicationStatus }[];
  myApplication?: { id: string; status: ApplicationStatus } | null;
}

export interface JobApplication {
  id: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  createdAt: string;
  job?: Job;
  applicant?: User;
}

export type ProfileVisibility = 'PUBLIC' | 'PRIVATE';
export type MessagingPermission = 'EVERYONE' | 'FOLLOWERS';
export type PostVisibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
export type ReactionType =
  | 'LIKE'
  | 'CELEBRATE'
  | 'SUPPORT'
  | 'LOVE'
  | 'INSIGHTFUL'
  | 'FUNNY';
export type AttachmentType = 'IMAGE' | 'DOCUMENT';

export interface Attachment {
  id?: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  type: AttachmentType;
  caption?: string | null;
  createdAt?: string;
}

export interface Profile {
  id?: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  website?: string | null;
  company?: string | null;
  industry?: string | null;
  companySize?: string | null;
  foundedYear?: string | null;
  visibility?: ProfileVisibility;
  messagingPermission?: MessagingPermission;
  skills?: Skill[];
  experiences?: Experience[];
  educations?: Education[];
}

export interface Skill {
  id: string;
  name: string;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current: boolean;
}

export interface Education {
  id: string;
  school: string;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface User {
  id: string;
  email?: string;
  pendingEmail?: string | null;
  username: string;
  role?: UserRole;
  name?: string;
  emailVerifiedAt?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string;
  profile: Profile | null;
  _count?: {
    posts: number;
    followers: number;
    following: number;
  };
  isFollowing?: boolean;
  isRequested?: boolean;
  isBlockedByMe?: boolean;
  hasBlockedMe?: boolean;
  canMessage?: boolean;
  isSelf?: boolean;
}

/** Minimal author shape returned by posts, messages and comments. */
export interface PostAuthor {
  id: string;
  username: string;
  lastActiveAt?: string | null;
  profile: {
    avatarUrl: string | null;
    headline: string | null;
    visibility?: ProfileVisibility;
  } | null;
}

export interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  visibility: PostVisibility;
  repostOfId: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  author: PostAuthor;
  attachments?: Attachment[];
  reactions: Partial<Record<ReactionType, number>>;
  reactionCount: number;
  myReaction: ReactionType | null;
  _count: { likes: number; comments: number };
  repostOf?: Post | null;
  /** Legacy field kept for backwards compatibility. */
  likedByMe?: boolean;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  parentId?: string | null;
  author: PostAuthor;
  likedByMe: boolean;
  likeCount: number;
  replies?: Comment[];
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  edited?: boolean;
  editedAt?: string | null;
  deleted?: boolean;
  pinned?: boolean;
  pinnedAt?: string | null;
  sender: PostAuthor;
  attachments?: Attachment[];
  reactions?: Record<string, { count: number; userIds: string[] }>;
  replyTo?: {
    id: string;
    content: string;
    deleted?: boolean;
    sender: { id: string; username: string };
  } | null;
}

export interface Conversation {
  id: string;
  updatedAt: string;
  participants: PostAuthor[];
  otherParticipants: PostAuthor[];
  lastMessage: Message | null;
  unreadCount?: number;
  archived?: boolean;
  muted?: boolean;
}

export type NotificationType =
  | 'LIKE'
  | 'COMMENT'
  | 'FOLLOW'
  | 'MESSAGE'
  | 'WELCOME'
  | 'REPOST'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED'
  | 'CALL'
  | 'MEETING'
  | 'JOB_APPLICATION'
  | 'JOB_APPLICATION_UPDATE'
  | 'JOB_APPLICATION_ACCEPTED'
  | 'JOB_APPLICATION_REJECTED'
  | 'INTERVIEW_INVITATION'
  | 'JOB_OFFER';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  entityId: string | null;
  read: boolean;
  createdAt: string;
  actor: PostAuthor | null;
}

export interface FollowRequest {
  id: string;
  createdAt: string;
  user: User;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachments?: Attachment[];
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  shareEnabled?: boolean;
  shareToken?: string | null;
  messages: AiMessage[];
}

export interface SharedAiConversation {
  id: string;
  title: string;
  createdAt: string;
  messages: AiMessage[];
  author: {
    username: string;
    profile: { avatarUrl: string | null; headline: string | null } | null;
  };
}

export type CallType = 'AUDIO' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ACCEPTED' | 'REJECTED' | 'ENDED' | 'MISSED';

export interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallStatus;
  startedAt?: string;
  endedAt?: string | null;
  createdAt: string;
  caller?: PostAuthor;
  callee?: PostAuthor;
}

export type MeetingStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';

export interface Meeting {
  id: string;
  roomCode: string;
  title: string;
  description?: string | null;
  status: MeetingStatus;
  hostId: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  host?: PostAuthor;
  participants?: {
    id: string;
    userId: string;
    joinedAt: string | null;
    leftAt: string | null;
    user: PostAuthor;
  }[];
}
