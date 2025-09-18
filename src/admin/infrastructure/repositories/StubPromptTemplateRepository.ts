import { injectable } from 'inversify';
import { PromptTemplate } from '../../domain/entities/PromptTemplate';
import { IPromptTemplateRepository, PromptTemplateFilter, PromptTemplatePagination, PromptTemplateQueryResult } from '../../domain/repositories/IPromptTemplateRepository';

@injectable()
export class StubPromptTemplateRepository implements IPromptTemplateRepository {
  private throwError(): never {
    throw new Error('Admin features require MongoDB. Set USE_MONGODB=true in .env to enable.');
  }

  async findById(id: string): Promise<PromptTemplate | null> {
    this.throwError();
  }

  async findByName(name: string): Promise<PromptTemplate | null> {
    this.throwError();
  }

  async findAll(filter?: PromptTemplateFilter, pagination?: PromptTemplatePagination): Promise<PromptTemplateQueryResult> {
    this.throwError();
  }

  async save(template: PromptTemplate): Promise<void> {
    this.throwError();
  }

  async update(template: PromptTemplate): Promise<void> {
    this.throwError();
  }

  async delete(id: string): Promise<void> {
    this.throwError();
  }

  async count(filter?: PromptTemplateFilter): Promise<number> {
    this.throwError();
  }

  async findByCategory(category: string): Promise<PromptTemplate[]> {
    this.throwError();
  }

  async findByStatus(status: string): Promise<PromptTemplate[]> {
    this.throwError();
  }

  async findActiveByCategory(category: string, language: string): Promise<PromptTemplate | null> {
    this.throwError();
  }

  async findMany(filter?: PromptTemplateFilter, pagination?: PromptTemplatePagination): Promise<PromptTemplateQueryResult> {
    this.throwError();
  }

  async findVersions(templateId: string): Promise<PromptTemplate | null> {
    this.throwError();
  }

  async getUsageStats(templateIds?: string[]): Promise<Array<{
    templateId: string;
    name: string;
    category: any;
    totalUsage: number;
    successRate: number;
    averageResponseTime: number;
    lastUsed?: Date;
  }>> {
    this.throwError();
  }

  async findTemplatesForPerformanceUpdate(category?: any): Promise<PromptTemplate[]> {
    this.throwError();
  }

  async updatePerformanceMetrics(
    templateId: string,
    version: string,
    successRate?: number,
    responseTime?: number,
    incrementUsage?: boolean
  ): Promise<void> {
    this.throwError();
  }

  async findByTag(tag: string): Promise<PromptTemplate[]> {
    this.throwError();
  }

  async findSimilarNames(name: string, excludeId?: string): Promise<PromptTemplate[]> {
    this.throwError();
  }

  async archiveOldVersions(templateId: string, keepVersions: number): Promise<void> {
    this.throwError();
  }

  async exportTemplates(filter?: PromptTemplateFilter): Promise<string> {
    this.throwError();
  }

  async importTemplates(templatesJson: string, importedBy: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    this.throwError();
  }

  async updateUsageStats(id: string, responseTime: number, success: boolean): Promise<void> {
    this.throwError();
  }

  async seedInitialTemplates(): Promise<void> {
    this.throwError();
  }
}