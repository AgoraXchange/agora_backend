export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  SCHEDULED = 'scheduled'
}

export enum PostCategory {
  ANNOUNCEMENT = 'announcement',
  NEWS = 'news',
  TUTORIAL = 'tutorial',
  GUIDE = 'guide',
  UPDATE = 'update',
  RESEARCH = 'research'
}

export interface PostMetadata {
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  socialImage?: string;
  canonicalUrl?: string;
  readingTime?: number; // in minutes
  featured?: boolean;
}

export interface PostRevision {
  version: number;
  title: string;
  content: string;
  summary?: string;
  modifiedBy: string;
  modifiedAt: Date;
  changeLog?: string;
}

export class Post {
  private _revisions: PostRevision[];
  private _tags: Set<string>;

  constructor(
    public readonly id: string,
    public title: string,
    public content: string,
    public summary: string,
    public status: PostStatus,
    public category: PostCategory,
    public readonly authorId: string,
    public readonly authorName: string,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    public publishedAt?: Date,
    public scheduledAt?: Date,
    tags: string[] = [],
    public relatedContractId?: string,
    public viewCount: number = 0,
    public likeCount: number = 0,
    public metadata: PostMetadata = {},
    revisions: PostRevision[] = [],
    public allowComments: boolean = true,
    public pinned: boolean = false
  ) {
    this._tags = new Set(tags);
    this._revisions = revisions;
    this.validateTitle();
    this.validateContent();
    this.initializeRevisions();
  }

  private validateTitle(): void {
    if (!this.title || this.title.trim().length === 0) {
      throw new Error('Post title cannot be empty');
    }
    if (this.title.length > 200) {
      throw new Error('Post title cannot exceed 200 characters');
    }
  }

  private validateContent(): void {
    if (!this.content || this.content.trim().length === 0) {
      throw new Error('Post content cannot be empty');
    }
    if (this.content.length > 50000) {
      throw new Error('Post content cannot exceed 50,000 characters');
    }
  }

  private initializeRevisions(): void {
    if (this._revisions.length === 0) {
      this._revisions.push({
        version: 1,
        title: this.title,
        content: this.content,
        summary: this.summary,
        modifiedBy: this.authorId,
        modifiedAt: this.createdAt,
        changeLog: 'Initial version'
      });
    }
  }

  get tags(): string[] {
    return Array.from(this._tags);
  }

  get revisions(): readonly PostRevision[] {
    return this._revisions;
  }

  get currentVersion(): number {
    return Math.max(...this._revisions.map(r => r.version));
  }

  get isPublished(): boolean {
    return this.status === PostStatus.PUBLISHED &&
           (!this.publishedAt || this.publishedAt <= new Date());
  }

  get isScheduled(): boolean {
    return this.status === PostStatus.SCHEDULED &&
           !!this.scheduledAt &&
           this.scheduledAt > new Date();
  }

  get slug(): string {
    return this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }

  get estimatedReadingTime(): number {
    if (this.metadata.readingTime) {
      return this.metadata.readingTime;
    }

    // Estimate based on average reading speed of 200 words per minute
    const wordCount = this.content.split(/\s+/).length;
    return Math.ceil(wordCount / 200);
  }

  updateContent(
    title: string,
    content: string,
    summary: string,
    modifiedBy: string,
    changeLog?: string
  ): void {
    this.title = title;
    this.content = content;
    this.summary = summary;
    this.updatedAt = new Date();

    this.validateTitle();
    this.validateContent();

    // Create new revision
    const newVersion = this.currentVersion + 1;
    this._revisions.push({
      version: newVersion,
      title,
      content,
      summary,
      modifiedBy,
      modifiedAt: this.updatedAt,
      changeLog: changeLog || `Updated to version ${newVersion}`
    });
  }

  updateStatus(status: PostStatus, modifiedBy: string): void {
    const oldStatus = this.status;
    this.status = status;
    this.updatedAt = new Date();

    if (status === PostStatus.PUBLISHED && oldStatus !== PostStatus.PUBLISHED) {
      this.publishedAt = new Date();
    }

    if (status === PostStatus.SCHEDULED) {
      // Keep existing scheduledAt if already set
      if (!this.scheduledAt) {
        throw new Error('Scheduled date must be set when status is SCHEDULED');
      }
    }
  }

  schedulePublication(scheduledAt: Date): void {
    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled date must be in the future');
    }

    this.scheduledAt = scheduledAt;
    this.status = PostStatus.SCHEDULED;
    this.updatedAt = new Date();
  }

  publish(): void {
    this.status = PostStatus.PUBLISHED;
    this.publishedAt = new Date();
    this.updatedAt = new Date();
    this.scheduledAt = undefined; // Clear scheduled date
  }

  archive(): void {
    this.status = PostStatus.ARCHIVED;
    this.updatedAt = new Date();
  }

  addTag(tag: string): void {
    if (tag && tag.trim().length > 0) {
      this._tags.add(tag.trim().toLowerCase());
      this.updatedAt = new Date();
    }
  }

  removeTag(tag: string): void {
    this._tags.delete(tag.trim().toLowerCase());
    this.updatedAt = new Date();
  }

  setTags(tags: string[]): void {
    this._tags.clear();
    tags.forEach(tag => this.addTag(tag));
  }

  incrementViewCount(): void {
    this.viewCount++;
  }

  incrementLikeCount(): void {
    this.likeCount++;
  }

  decrementLikeCount(): void {
    if (this.likeCount > 0) {
      this.likeCount--;
    }
  }

  updateMetadata(metadata: Partial<PostMetadata>): void {
    this.metadata = { ...this.metadata, ...metadata };

    // Auto-calculate reading time if not provided
    if (!metadata.readingTime) {
      this.metadata.readingTime = this.estimatedReadingTime;
    }

    this.updatedAt = new Date();
  }

  pin(): void {
    this.pinned = true;
    this.updatedAt = new Date();
  }

  unpin(): void {
    this.pinned = false;
    this.updatedAt = new Date();
  }

  toggleComments(): void {
    this.allowComments = !this.allowComments;
    this.updatedAt = new Date();
  }

  revertToRevision(version: number): void {
    const revision = this._revisions.find(r => r.version === version);
    if (!revision) {
      throw new Error(`Revision ${version} not found`);
    }

    this.title = revision.title;
    this.content = revision.content;
    this.summary = revision.summary || '';
    this.updatedAt = new Date();

    // Create new revision for the revert
    const newVersion = this.currentVersion + 1;
    this._revisions.push({
      version: newVersion,
      title: revision.title,
      content: revision.content,
      summary: revision.summary,
      modifiedBy: revision.modifiedBy,
      modifiedAt: this.updatedAt,
      changeLog: `Reverted to version ${version}`
    });
  }

  canDelete(): boolean {
    return this.status === PostStatus.DRAFT || this.viewCount === 0;
  }

  toJSON(): object {
    return {
      id: this.id,
      title: this.title,
      content: this.content,
      summary: this.summary,
      status: this.status,
      category: this.category,
      authorId: this.authorId,
      authorName: this.authorName,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      publishedAt: this.publishedAt,
      scheduledAt: this.scheduledAt,
      tags: this.tags,
      relatedContractId: this.relatedContractId,
      viewCount: this.viewCount,
      likeCount: this.likeCount,
      metadata: this.metadata,
      currentVersion: this.currentVersion,
      revisionsCount: this._revisions.length,
      allowComments: this.allowComments,
      pinned: this.pinned,
      slug: this.slug,
      isPublished: this.isPublished,
      isScheduled: this.isScheduled,
      estimatedReadingTime: this.estimatedReadingTime
    };
  }

  static create(
    id: string,
    title: string,
    content: string,
    summary: string,
    category: PostCategory,
    authorId: string,
    authorName: string,
    tags: string[] = []
  ): Post {
    return new Post(
      id,
      title,
      content,
      summary,
      PostStatus.DRAFT,
      category,
      authorId,
      authorName,
      new Date(),
      new Date(),
      undefined,
      undefined,
      tags
    );
  }
}