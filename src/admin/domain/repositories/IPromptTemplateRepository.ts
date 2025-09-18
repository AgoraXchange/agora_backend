import { PromptTemplate, PromptCategory, PromptLanguage, PromptStatus } from '../entities/PromptTemplate';

export interface PromptTemplateFilter {
  category?: PromptCategory;
  language?: PromptLanguage;
  status?: PromptStatus;
  search?: string; // Search in name or description
  createdBy?: string;
  tags?: string[];
}

export interface PromptTemplatePagination {
  page: number;
  limit: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'usageCount';
  sortOrder?: 'asc' | 'desc';
}

export interface PromptTemplateQueryResult {
  templates: PromptTemplate[];
  total: number;
  page: number;
  totalPages: number;
}

export interface IPromptTemplateRepository {
  /**
   * Find prompt template by ID
   */
  findById(id: string): Promise<PromptTemplate | null>;

  /**
   * Find prompt templates with filtering and pagination
   */
  findMany(
    filter?: PromptTemplateFilter,
    pagination?: PromptTemplatePagination
  ): Promise<PromptTemplateQueryResult>;

  /**
   * Find active prompt template by category and language
   */
  findActiveByCategory(
    category: PromptCategory,
    language: PromptLanguage
  ): Promise<PromptTemplate | null>;

  /**
   * Find all versions of a prompt template
   */
  findVersions(templateId: string): Promise<PromptTemplate | null>;

  /**
   * Create a new prompt template
   */
  save(template: PromptTemplate): Promise<void>;

  /**
   * Update existing prompt template
   */
  update(template: PromptTemplate): Promise<void>;

  /**
   * Delete prompt template
   */
  delete(id: string): Promise<void>;

  /**
   * Get usage statistics for templates
   */
  getUsageStats(templateIds?: string[]): Promise<Array<{
    templateId: string;
    name: string;
    category: PromptCategory;
    totalUsage: number;
    successRate: number;
    averageResponseTime: number;
    lastUsed?: Date;
  }>>;

  /**
   * Find templates that need performance updates
   */
  findTemplatesForPerformanceUpdate(
    category?: PromptCategory
  ): Promise<PromptTemplate[]>;

  /**
   * Update performance metrics for a template version
   */
  updatePerformanceMetrics(
    templateId: string,
    version: string,
    successRate?: number,
    responseTime?: number,
    incrementUsage?: boolean
  ): Promise<void>;

  /**
   * Get total count of templates
   */
  count(filter?: PromptTemplateFilter): Promise<number>;

  /**
   * Find templates by tag
   */
  findByTag(tag: string): Promise<PromptTemplate[]>;

  /**
   * Find duplicate or similar template names
   */
  findSimilarNames(name: string, excludeId?: string): Promise<PromptTemplate[]>;

  /**
   * Archive old versions (keep only latest N versions)
   */
  archiveOldVersions(templateId: string, keepVersions: number): Promise<void>;

  /**
   * Export templates for backup
   */
  exportTemplates(filter?: PromptTemplateFilter): Promise<string>; // JSON string

  /**
   * Import templates from backup
   */
  importTemplates(templatesJson: string, importedBy: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }>;
}