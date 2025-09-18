import { inject, injectable } from 'inversify';
import {
  IPromptTemplateRepository,
  PromptTemplateFilter,
  PromptTemplatePagination,
  PromptTemplateQueryResult
} from '../../domain/repositories/IPromptTemplateRepository';
import { PromptTemplate, PromptCategory, PromptLanguage, PromptStatus } from '../../domain/entities/PromptTemplate';
import { TYPES } from '../../../types';

export interface CreatePromptTemplateRequest {
  name: string;
  category: PromptCategory;
  language: PromptLanguage;
  template: string;
  variables: string[];
  description?: string;
  tags?: string[];
  createdBy: string;
}

export interface UpdatePromptTemplateRequest {
  id: string;
  name?: string;
  template?: string;
  variables?: string[];
  description?: string;
  status?: PromptStatus;
  tags?: string[];
  notes?: string;
}

export interface PromptTemplateUsageRequest {
  templateId: string;
  version: string;
  successRate?: number;
  responseTime?: number;
  incrementUsage?: boolean;
}

@injectable()
export class PromptTemplateUseCases {
  constructor(
    @inject(TYPES.IPromptTemplateRepository)
    private promptTemplateRepository: IPromptTemplateRepository
  ) {}

  async createPromptTemplate(request: CreatePromptTemplateRequest): Promise<PromptTemplate> {
    // Generate unique ID
    const id = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check for similar names to avoid duplicates
    const similarTemplates = await this.promptTemplateRepository.findSimilarNames(request.name);
    if (similarTemplates.length > 0) {
      throw new Error(`A template with similar name already exists: ${similarTemplates[0].name}`);
    }

    const template = new PromptTemplate(
      id,
      request.name,
      request.category,
      request.language,
      PromptStatus.DRAFT,
      '1.0.0',
      request.createdBy
    );

    // Add initial version with content
    template.addVersion(
      {
        systemPrompt: '',
        userPromptTemplate: request.template,
        variables: request.variables
      },
      {
        temperature: 0.7,
        maxTokens: 4000,
        version: '1.0.0',
        description: request.description,
        tags: request.tags || []
      },
      request.createdBy,
      'Created via admin interface'
    );

    await this.promptTemplateRepository.save(template);
    return template;
  }

  async getPromptTemplate(id: string): Promise<PromptTemplate | null> {
    return this.promptTemplateRepository.findById(id);
  }

  async updatePromptTemplate(request: UpdatePromptTemplateRequest): Promise<PromptTemplate> {
    const template = await this.promptTemplateRepository.findById(request.id);
    if (!template) {
      throw new Error(`Prompt template ${request.id} not found`);
    }

    // Create new version if template or variables changed
    if (request.template && request.template !== template.template) {
      const newVersion = this.incrementVersion(template.version);
      template.updateTemplate(request.template, request.variables || template.variables, newVersion);
    }

    if (request.name) template.updateName(request.name);
    if (request.description !== undefined) template.updateDescription(request.description);
    if (request.status) template.updateStatus(request.status);
    if (request.tags) template.updateTags(request.tags);
    if (request.notes) template.addNote(request.notes);

    template.touch();
    await this.promptTemplateRepository.update(template);
    return template;
  }

  async deletePromptTemplate(id: string): Promise<void> {
    const template = await this.promptTemplateRepository.findById(id);
    if (!template) {
      throw new Error(`Prompt template ${id} not found`);
    }

    if (template.isActive) {
      throw new Error('Cannot delete an active template. Deactivate it first.');
    }

    await this.promptTemplateRepository.delete(id);
  }

  async getPromptTemplates(
    filter?: PromptTemplateFilter,
    pagination?: PromptTemplatePagination
  ): Promise<PromptTemplateQueryResult> {
    return this.promptTemplateRepository.findMany(filter, pagination);
  }

  async getActiveTemplate(
    category: PromptCategory,
    language: PromptLanguage
  ): Promise<PromptTemplate | null> {
    return this.promptTemplateRepository.findActiveByCategory(category, language);
  }

  async activateTemplate(id: string): Promise<PromptTemplate> {
    const template = await this.promptTemplateRepository.findById(id);
    if (!template) {
      throw new Error(`Prompt template ${id} not found`);
    }

    if (template.status !== PromptStatus.ACTIVE) {
      throw new Error('Template must be in ACTIVE status to be activated');
    }

    // Deactivate other templates in the same category and language
    const existingActive = await this.promptTemplateRepository.findActiveByCategory(
      template.category,
      template.language
    );

    if (existingActive && existingActive.id !== id) {
      existingActive.deactivate();
      await this.promptTemplateRepository.update(existingActive);
    }

    template.activate();
    template.touch();
    await this.promptTemplateRepository.update(template);
    return template;
  }

  async deactivateTemplate(id: string): Promise<PromptTemplate> {
    const template = await this.promptTemplateRepository.findById(id);
    if (!template) {
      throw new Error(`Prompt template ${id} not found`);
    }

    template.deactivate();
    template.touch();
    await this.promptTemplateRepository.update(template);
    return template;
  }

  async recordUsage(request: PromptTemplateUsageRequest): Promise<void> {
    await this.promptTemplateRepository.updatePerformanceMetrics(
      request.templateId,
      request.version,
      request.successRate,
      request.responseTime,
      request.incrementUsage
    );
  }

  async getUsageStats(templateIds?: string[]): Promise<Array<{
    templateId: string;
    name: string;
    category: PromptCategory;
    totalUsage: number;
    successRate: number;
    averageResponseTime: number;
    lastUsed?: Date;
  }>> {
    return this.promptTemplateRepository.getUsageStats(templateIds);
  }

  async findTemplatesNeedingUpdate(category?: PromptCategory): Promise<PromptTemplate[]> {
    return this.promptTemplateRepository.findTemplatesForPerformanceUpdate(category);
  }

  async duplicateTemplate(id: string, name: string, createdBy: string): Promise<PromptTemplate> {
    const original = await this.promptTemplateRepository.findById(id);
    if (!original) {
      throw new Error(`Prompt template ${id} not found`);
    }

    const newId = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const duplicate = new PromptTemplate(
      newId,
      name,
      original.category,
      original.language,
      PromptStatus.DRAFT,
      '1.0.0',
      createdBy
    );

    // Add version with original content
    if (original.template) {
      duplicate.addVersion(
        {
          systemPrompt: '',
          userPromptTemplate: original.template,
          variables: original.variables
        },
        {
          temperature: 0.7,
          maxTokens: 4000,
          version: '1.0.0',
          description: original.description ? `${original.description} (Copy)` : undefined,
          tags: original.tags
        },
        createdBy,
        `Duplicated from ${original.name} (${original.id})`
      );
    }

    await this.promptTemplateRepository.save(duplicate);
    return duplicate;
  }

  async searchTemplates(
    query: string,
    filter?: PromptTemplateFilter,
    pagination?: PromptTemplatePagination
  ): Promise<PromptTemplateQueryResult> {
    const searchFilter = { ...filter, search: query };
    return this.promptTemplateRepository.findMany(searchFilter, pagination);
  }

  async exportTemplates(filter?: PromptTemplateFilter): Promise<string> {
    return this.promptTemplateRepository.exportTemplates(filter);
  }

  async importTemplates(templatesJson: string, importedBy: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    return this.promptTemplateRepository.importTemplates(templatesJson, importedBy);
  }

  async archiveOldVersions(templateId: string, keepVersions: number = 5): Promise<void> {
    return this.promptTemplateRepository.archiveOldVersions(templateId, keepVersions);
  }

  async getTemplatesByTag(tag: string): Promise<PromptTemplate[]> {
    return this.promptTemplateRepository.findByTag(tag);
  }

  async bulkUpdateStatus(
    templateIds: string[],
    status: PromptStatus
  ): Promise<{ updated: number; errors: string[] }> {
    const result = { updated: 0, errors: [] as string[] };

    for (const id of templateIds) {
      try {
        const template = await this.promptTemplateRepository.findById(id);
        if (!template) {
          result.errors.push(`Template ${id} not found`);
          continue;
        }

        template.updateStatus(status);
        template.touch();
        await this.promptTemplateRepository.update(template);
        result.updated++;
      } catch (error) {
        result.errors.push(`Template ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  async validateTemplate(id: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const template = await this.promptTemplateRepository.findById(id);
    if (!template) {
      return {
        isValid: false,
        errors: [`Template ${id} not found`],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate template syntax
    try {
      const variablePattern = /\{\{(\w+)\}\}/g;
      const foundVariables = new Set<string>();
      let match;

      while ((match = variablePattern.exec(template.template)) !== null) {
        foundVariables.add(match[1]);
      }

      // Check if all declared variables are used
      for (const variable of template.variables) {
        if (!foundVariables.has(variable)) {
          warnings.push(`Variable '${variable}' is declared but not used in template`);
        }
      }

      // Check if all used variables are declared
      for (const variable of foundVariables) {
        if (!template.variables.includes(variable)) {
          errors.push(`Variable '${variable}' is used but not declared`);
        }
      }

      // Check template length
      if (template.template.length > 10000) {
        warnings.push('Template is very long (>10000 characters)');
      }

      if (template.template.length < 10) {
        warnings.push('Template is very short (<10 characters)');
      }

    } catch (error) {
      errors.push(`Template validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private incrementVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
}