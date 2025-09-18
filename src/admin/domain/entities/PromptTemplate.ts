export enum PromptCategory {
  PROPOSER = 'proposer',
  JUROR = 'juror',
  INVESTIGATOR = 'investigator',
  SYNTHESIZER = 'synthesizer',
  JUDGE = 'judge'
}

export enum PromptLanguage {
  EN = 'en',
  KO = 'ko'
}

export enum PromptStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived'
}

export interface PromptMetadata {
  temperature: number;
  maxTokens: number;
  topP?: number;
  model?: string;
  version: string;
  tags?: string[];
  description?: string;
}

export interface PromptContent {
  systemPrompt: string;
  userPromptTemplate: string;
  variables?: string[]; // Available template variables like {CONTRACT_ID}, {PARTY_A_NAME}
}

export interface PromptVersion {
  version: string;
  content: PromptContent;
  metadata: PromptMetadata;
  createdAt: Date;
  createdBy: string;
  changeLog?: string;
  performanceMetrics?: {
    successRate: number;
    averageResponseTime: number;
    usageCount: number;
  };
}

export class PromptTemplate {
  private _versions: PromptVersion[];

  constructor(
    public readonly id: string,
    public name: string,
    public category: PromptCategory,
    public language: PromptLanguage,
    public status: PromptStatus,
    public currentVersion: string,
    public readonly createdBy: string,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    versions: PromptVersion[] = [],
    public metadata: Record<string, any> = {}
  ) {
    this._versions = versions;
    this.validateName();
  }

  private validateName(): void {
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Template name cannot be empty');
    }
    if (this.name.length > 100) {
      throw new Error('Template name cannot exceed 100 characters');
    }
  }

  get versions(): readonly PromptVersion[] {
    return this._versions;
  }

  get currentVersionData(): PromptVersion | undefined {
    return this._versions.find(v => v.version === this.currentVersion);
  }

  get isActive(): boolean {
    return this.status === PromptStatus.ACTIVE;
  }

  get latestVersion(): string {
    if (this._versions.length === 0) return '1.0.0';

    // Sort versions by semantic version
    const sorted = this._versions
      .map(v => v.version)
      .sort((a, b) => this.compareVersions(b, a));

    return sorted[0];
  }

  addVersion(
    content: PromptContent,
    metadata: PromptMetadata,
    createdBy: string,
    changeLog?: string
  ): void {
    const newVersion: PromptVersion = {
      version: metadata.version,
      content,
      metadata,
      createdAt: new Date(),
      createdBy,
      changeLog,
      performanceMetrics: {
        successRate: 0,
        averageResponseTime: 0,
        usageCount: 0
      }
    };

    // Validate version doesn't already exist
    if (this._versions.some(v => v.version === metadata.version)) {
      throw new Error(`Version ${metadata.version} already exists`);
    }

    this._versions.push(newVersion);
    this.updatedAt = new Date();
  }

  setCurrentVersion(version: string): void {
    if (!this._versions.some(v => v.version === version)) {
      throw new Error(`Version ${version} does not exist`);
    }
    this.currentVersion = version;
    this.updatedAt = new Date();
  }

  updateStatus(status: PromptStatus): void {
    this.status = status;
    this.updatedAt = new Date();
  }

  updateName(name: string): void {
    this.name = name;
    this.validateName();
    this.updatedAt = new Date();
  }

  // Getter for template property (from current version)
  get template(): string | undefined {
    return this.currentVersionData?.content.userPromptTemplate;
  }

  // Getter for version property
  get version(): string {
    return this.currentVersion;
  }

  // Getter for variables property
  get variables(): string[] | undefined {
    return this.currentVersionData?.content.variables;
  }

  // Getter for description property
  get description(): string | undefined {
    return this.currentVersionData?.metadata.description;
  }

  // Getter for tags property
  get tags(): string[] | undefined {
    return this.currentVersionData?.metadata.tags;
  }

  updateTemplate(template: string, variables?: string[], version?: string): void {
    if (!this.currentVersionData) {
      throw new Error('Cannot update template without current version');
    }

    if (version && version !== this.currentVersion) {
      // Create new version with updated template
      const newMetadata = { ...this.currentVersionData.metadata, version };
      const newContent = {
        ...this.currentVersionData.content,
        userPromptTemplate: template,
        variables: variables || this.currentVersionData.content.variables
      };
      this.addVersion(newContent, newMetadata, this.createdBy, 'Template updated');
      this.setCurrentVersion(version);
    } else {
      // Update current version in place
      this.currentVersionData.content.userPromptTemplate = template;
      if (variables) {
        this.currentVersionData.content.variables = variables;
      }
      this.updatedAt = new Date();
    }
  }

  updateDescription(description: string): void {
    if (this.currentVersionData?.metadata) {
      this.currentVersionData.metadata.description = description;
      this.updatedAt = new Date();
    }
  }

  updateTags(tags: string[]): void {
    if (this.currentVersionData?.metadata) {
      this.currentVersionData.metadata.tags = tags;
      this.updatedAt = new Date();
    }
  }

  addNote(note: string): void {
    if (this.currentVersionData) {
      this.currentVersionData.changeLog = note;
      this.updatedAt = new Date();
    }
  }

  touch(): void {
    this.updatedAt = new Date();
  }

  activate(): void {
    this.status = PromptStatus.ACTIVE;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.status = PromptStatus.ARCHIVED;
    this.updatedAt = new Date();
  }

  updatePerformanceMetrics(
    version: string,
    successRate?: number,
    responseTime?: number,
    incrementUsage = false
  ): void {
    const versionData = this._versions.find(v => v.version === version);
    if (!versionData?.performanceMetrics) return;

    if (successRate !== undefined) {
      versionData.performanceMetrics.successRate = successRate;
    }

    if (responseTime !== undefined) {
      const current = versionData.performanceMetrics.averageResponseTime;
      const count = versionData.performanceMetrics.usageCount;
      versionData.performanceMetrics.averageResponseTime =
        count > 0 ? (current * count + responseTime) / (count + 1) : responseTime;
    }

    if (incrementUsage) {
      versionData.performanceMetrics.usageCount++;
    }
  }

  getVersionHistory(): PromptVersion[] {
    return this._versions
      .slice()
      .sort((a, b) => this.compareVersions(b.version, a.version));
  }

  canDelete(): boolean {
    return this.status === PromptStatus.DRAFT ||
           this._versions.every(v => !v.performanceMetrics || v.performanceMetrics.usageCount === 0);
  }

  duplicate(newName: string, createdBy: string): PromptTemplate {
    const current = this.currentVersionData;
    if (!current) {
      throw new Error('Cannot duplicate template without current version');
    }

    const duplicate = new PromptTemplate(
      `${this.id}_copy_${Date.now()}`,
      newName,
      this.category,
      this.language,
      PromptStatus.DRAFT,
      '1.0.0',
      createdBy
    );

    duplicate.addVersion(
      { ...current.content },
      { ...current.metadata, version: '1.0.0' },
      createdBy,
      `Duplicated from ${this.name} v${current.version}`
    );

    return duplicate;
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      language: this.language,
      status: this.status,
      currentVersion: this.currentVersion,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      versionsCount: this._versions.length,
      latestVersion: this.latestVersion,
      isActive: this.isActive,
      currentVersionData: this.currentVersionData,
      metadata: this.metadata
    };
  }

  static create(
    id: string,
    name: string,
    category: PromptCategory,
    language: PromptLanguage,
    content: PromptContent,
    metadata: PromptMetadata,
    createdBy: string
  ): PromptTemplate {
    const template = new PromptTemplate(
      id,
      name,
      category,
      language,
      PromptStatus.DRAFT,
      metadata.version,
      createdBy
    );

    template.addVersion(content, metadata, createdBy, 'Initial version');
    return template;
  }
}