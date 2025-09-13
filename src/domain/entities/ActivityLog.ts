export enum ActivityAction {
  // Authentication
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // User Management
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  USER_ACTIVATE = 'USER_ACTIVATE',
  USER_DEACTIVATE = 'USER_DEACTIVATE',

  // API Key Management
  API_KEY_CREATE = 'API_KEY_CREATE',
  API_KEY_DELETE = 'API_KEY_DELETE',
  API_KEY_USE = 'API_KEY_USE',

  // Contract Management
  CONTRACT_CREATE = 'CONTRACT_CREATE',
  CONTRACT_UPDATE = 'CONTRACT_UPDATE',
  CONTRACT_DELETE = 'CONTRACT_DELETE',
  CONTRACT_DECIDE_WINNER = 'CONTRACT_DECIDE_WINNER',
  CONTRACT_MANUAL_DECISION = 'CONTRACT_MANUAL_DECISION',

  // AI Committee
  AGENT_CONFIG_UPDATE = 'AGENT_CONFIG_UPDATE',
  AGENT_WEIGHT_UPDATE = 'AGENT_WEIGHT_UPDATE',
  COMMITTEE_CONFIG_UPDATE = 'COMMITTEE_CONFIG_UPDATE',

  // System Configuration
  SYSTEM_CONFIG_UPDATE = 'SYSTEM_CONFIG_UPDATE',
  BACKUP_CREATE = 'BACKUP_CREATE',
  BACKUP_RESTORE = 'BACKUP_RESTORE',

  // Monitoring
  HEALTH_CHECK = 'HEALTH_CHECK',
  REPORT_EXPORT = 'REPORT_EXPORT'
}

export interface ActivityMetadata {
  [key: string]: any;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  success?: boolean;
  error?: string;
}

export class ActivityLog {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly username: string,
    public readonly action: ActivityAction,
    public readonly resource: string,
    public readonly resourceId: string,
    public readonly metadata: ActivityMetadata,
    public readonly ip: string,
    public readonly userAgent: string,
    public readonly timestamp: Date = new Date()
  ) {}

  isSuccessful(): boolean {
    return this.metadata.success !== false;
  }

  isCriticalAction(): boolean {
    const criticalActions = [
      ActivityAction.USER_DELETE,
      ActivityAction.CONTRACT_DELETE,
      ActivityAction.SYSTEM_CONFIG_UPDATE,
      ActivityAction.BACKUP_RESTORE
    ];
    return criticalActions.includes(this.action);
  }

  static create(
    userId: string,
    username: string,
    action: ActivityAction,
    resource: string,
    resourceId: string,
    metadata: ActivityMetadata,
    ip: string,
    userAgent: string
  ): ActivityLog {
    return new ActivityLog(
      `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      username,
      action,
      resource,
      resourceId,
      metadata,
      ip,
      userAgent
    );
  }
}