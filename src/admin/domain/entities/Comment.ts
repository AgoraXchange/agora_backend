export enum CommentSupportingSide {
  ARGUMENT_A = 'ARGUMENT_A',
  ARGUMENT_B = 'ARGUMENT_B',
  NEUTRAL = 'NEUTRAL',
  UNKNOWN = 'UNKNOWN'
}

export enum CommentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SPAM = 'spam',
  HIDDEN = 'hidden'
}

export enum CommentType {
  DEBATE = 'debate',    // For contract/debate comments
  POST = 'post',        // For blog post comments
  GENERAL = 'general'   // For general comments
}

export interface CommentFlag {
  id: string;
  flaggedBy: string;
  reason: string;
  description?: string;
  flaggedAt: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  action?: 'dismissed' | 'warning' | 'removed' | 'banned';
}

export interface CommentEdit {
  version: number;
  content: string;
  editedBy: string;
  editedAt: Date;
  reason?: string;
}

export interface AdminNote {
  id: string;
  note: string;
  addedBy: string;
  addedAt: Date;
  isInternal: boolean; // Internal notes visible only to admins
}

export class Comment {
  private _flags: CommentFlag[];
  private _edits: CommentEdit[];
  private _adminNotes: AdminNote[];

  constructor(
    public readonly id: string,
    public readonly parentId: string, // contractId, postId, etc.
    public readonly parentType: CommentType,
    public readonly author: string,
    public content: string,
    public readonly authorName?: string,
    public readonly timestamp: Date = new Date(),
    public supportingSide?: CommentSupportingSide,
    public readonly replyTo?: string,
    public upvotes: number = 0,
    public downvotes: number = 0,
    public status: CommentStatus = CommentStatus.PENDING,
    flags: CommentFlag[] = [],
    edits: CommentEdit[] = [],
    adminNotes: AdminNote[] = [],
    public moderatedBy?: string,
    public moderatedAt?: Date,
    public isEdited: boolean = false,
    public isSpam: boolean = false,
    public metadata: Record<string, any> = {}
  ) {
    this._flags = flags;
    this._edits = edits;
    this._adminNotes = adminNotes;
    this.validateContent();
    this.initializeEdits();
  }

  private validateContent(): void {
    if (!this.content || this.content.trim().length === 0) {
      throw new Error('Comment content cannot be empty');
    }
    if (this.content.length > 2000) {
      throw new Error('Comment content cannot exceed 2000 characters');
    }
  }

  private initializeEdits(): void {
    if (this._edits.length === 0) {
      this._edits.push({
        version: 1,
        content: this.content,
        editedBy: this.author,
        editedAt: this.timestamp,
        reason: 'Original comment'
      });
    }
  }

  get netVotes(): number {
    return this.upvotes - this.downvotes;
  }

  get engagementScore(): number {
    const totalVotes = this.upvotes + this.downvotes;
    const netVoteRatio = totalVotes > 0 ? this.netVotes / totalVotes : 0;
    return totalVotes * (0.5 + 0.5 * netVoteRatio);
  }

  get flags(): readonly CommentFlag[] {
    return this._flags;
  }

  get edits(): readonly CommentEdit[] {
    return this._edits;
  }

  get adminNotes(): readonly AdminNote[] {
    return this._adminNotes;
  }

  get currentVersion(): number {
    return Math.max(...this._edits.map(e => e.version));
  }

  get isReply(): boolean {
    return !!this.replyTo;
  }

  get isInfluential(): boolean {
    return this.netVotes > 10 || this.engagementScore > 20;
  }

  get isFlagged(): boolean {
    return this._flags.some(f => !f.resolved);
  }

  get isModerated(): boolean {
    return !!this.moderatedBy && !!this.moderatedAt;
  }

  get flagCount(): number {
    return this._flags.filter(f => !f.resolved).length;
  }

  // Voting methods
  upvote(): void {
    this.upvotes++;
  }

  downvote(): void {
    this.downvotes++;
  }

  removeUpvote(): void {
    if (this.upvotes > 0) {
      this.upvotes--;
    }
  }

  removeDownvote(): void {
    if (this.downvotes > 0) {
      this.downvotes--;
    }
  }

  // Content management
  editContent(newContent: string, editedBy: string, reason?: string): void {
    this.validateContent();

    const newVersion = this.currentVersion + 1;
    this._edits.push({
      version: newVersion,
      content: newContent,
      editedBy,
      editedAt: new Date(),
      reason
    });

    this.content = newContent;
    this.isEdited = true;
  }

  setSupportingSide(side: CommentSupportingSide): void {
    this.supportingSide = side;
  }

  // Moderation methods
  approve(moderatedBy: string): void {
    this.status = CommentStatus.APPROVED;
    this.moderatedBy = moderatedBy;
    this.moderatedAt = new Date();
  }

  reject(moderatedBy: string): void {
    this.status = CommentStatus.REJECTED;
    this.moderatedBy = moderatedBy;
    this.moderatedAt = new Date();
  }

  markAsSpam(moderatedBy: string): void {
    this.status = CommentStatus.SPAM;
    this.isSpam = true;
    this.moderatedBy = moderatedBy;
    this.moderatedAt = new Date();
  }

  hide(moderatedBy: string): void {
    this.status = CommentStatus.HIDDEN;
    this.moderatedBy = moderatedBy;
    this.moderatedAt = new Date();
  }

  restore(moderatedBy: string): void {
    this.status = CommentStatus.APPROVED;
    this.isSpam = false;
    this.moderatedBy = moderatedBy;
    this.moderatedAt = new Date();
  }

  // Flag management
  addFlag(flaggedBy: string, reason: string, description?: string): string {
    const flagId = `flag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this._flags.push({
      id: flagId,
      flaggedBy,
      reason,
      description,
      flaggedAt: new Date(),
      resolved: false
    });

    return flagId;
  }

  resolveFlag(flagId: string, resolvedBy: string, action?: CommentFlag['action']): void {
    const flag = this._flags.find(f => f.id === flagId);
    if (!flag) {
      throw new Error(`Flag ${flagId} not found`);
    }

    flag.resolved = true;
    flag.resolvedBy = resolvedBy;
    flag.resolvedAt = new Date();
    flag.action = action;
  }

  resolveAllFlags(resolvedBy: string, action?: CommentFlag['action']): void {
    this._flags
      .filter(f => !f.resolved)
      .forEach(flag => {
        flag.resolved = true;
        flag.resolvedBy = resolvedBy;
        flag.resolvedAt = new Date();
        flag.action = action;
      });
  }

  // Admin notes
  addAdminNote(note: string, addedBy: string, isInternal: boolean = true): string {
    const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this._adminNotes.push({
      id: noteId,
      note,
      addedBy,
      addedAt: new Date(),
      isInternal
    });

    return noteId;
  }

  removeAdminNote(noteId: string): void {
    const index = this._adminNotes.findIndex(n => n.id === noteId);
    if (index === -1) {
      throw new Error(`Admin note ${noteId} not found`);
    }

    this._adminNotes.splice(index, 1);
  }

  // Utility methods
  revertToVersion(version: number): void {
    const edit = this._edits.find(e => e.version === version);
    if (!edit) {
      throw new Error(`Version ${version} not found`);
    }

    this.content = edit.content;
    this.isEdited = true;

    // Add new edit entry for the revert
    const newVersion = this.currentVersion + 1;
    this._edits.push({
      version: newVersion,
      content: edit.content,
      editedBy: edit.editedBy,
      editedAt: new Date(),
      reason: `Reverted to version ${version}`
    });
  }

  canDelete(): boolean {
    return this.status === CommentStatus.PENDING ||
           this.status === CommentStatus.REJECTED ||
           (this.upvotes === 0 && this.downvotes === 0);
  }

  getPublicView(): object {
    // Return sanitized view for public API (excludes admin-only fields)
    return {
      id: this.id,
      parentId: this.parentId,
      parentType: this.parentType,
      author: this.author,
      authorName: this.authorName,
      content: this.status === CommentStatus.APPROVED ? this.content : '[Content hidden]',
      timestamp: this.timestamp,
      supportingSide: this.supportingSide,
      replyTo: this.replyTo,
      upvotes: this.upvotes,
      downvotes: this.downvotes,
      netVotes: this.netVotes,
      engagementScore: this.engagementScore,
      isReply: this.isReply,
      isEdited: this.isEdited,
      currentVersion: this.currentVersion
    };
  }

  toJSON(): object {
    return {
      id: this.id,
      parentId: this.parentId,
      parentType: this.parentType,
      author: this.author,
      authorName: this.authorName,
      content: this.content,
      timestamp: this.timestamp,
      supportingSide: this.supportingSide,
      replyTo: this.replyTo,
      upvotes: this.upvotes,
      downvotes: this.downvotes,
      netVotes: this.netVotes,
      engagementScore: this.engagementScore,
      status: this.status,
      flagCount: this.flagCount,
      isFlagged: this.isFlagged,
      isModerated: this.isModerated,
      moderatedBy: this.moderatedBy,
      moderatedAt: this.moderatedAt,
      isEdited: this.isEdited,
      isSpam: this.isSpam,
      currentVersion: this.currentVersion,
      editsCount: this._edits.length,
      flagsCount: this._flags.length,
      adminNotesCount: this._adminNotes.length,
      isReply: this.isReply,
      isInfluential: this.isInfluential,
      metadata: this.metadata
    };
  }

  static create(
    id: string,
    parentId: string,
    parentType: CommentType,
    author: string,
    content: string,
    authorName?: string,
    replyTo?: string
  ): Comment {
    return new Comment(
      id,
      parentId,
      parentType,
      author,
      authorName,
      content,
      new Date(),
      CommentSupportingSide.UNKNOWN,
      replyTo
    );
  }

  static fromDebateComment(debateComment: any): Comment {
    return new Comment(
      debateComment.id,
      debateComment.contractId,
      CommentType.DEBATE,
      debateComment.author,
      undefined, // authorName not in original
      debateComment.content,
      debateComment.timestamp,
      debateComment.supportingSide,
      debateComment.replyTo,
      debateComment.upvotes,
      debateComment.downvotes,
      CommentStatus.APPROVED // Assume existing comments are approved
    );
  }
}