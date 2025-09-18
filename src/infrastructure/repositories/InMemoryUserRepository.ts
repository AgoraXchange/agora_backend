import { injectable } from 'inversify';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User, UserRole } from '../../domain/entities/User';
import { logger } from '../logging/Logger';

@injectable()
export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();

  constructor() {
    this.seedDefaultAdmin();
  }

  private seedDefaultAdmin(): void {
    // Create default admin user for development
    // Password: admin123
    // This is a pre-computed bcrypt hash for "admin123" with salt rounds 10
    const defaultAdminPasswordHash = '$2b$10$rOEle8h9qFbHkVjHJLkFZODmD7XnCPbTJwX3aVZJJcOOyE5.Ghu1m';

    const defaultAdmin = new User(
      'admin-1',
      'admin',
      defaultAdminPasswordHash,
      UserRole.ADMIN,
      undefined, // apiKey
      new Date(), // createdAt
      undefined, // lastLoginAt
      'admin@agora.local', // email
      true, // active
      [], // apiKeys
      new Date() // updatedAt
    );

    this.users.set(defaultAdmin.id, defaultAdmin);
    logger.info('Default admin user seeded', { userId: defaultAdmin.id, username: defaultAdmin.username });
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.hasApiKey(apiKey)) {
        user.updateLastApiKeyUsage(apiKey);
        return user;
      }
    }
    return null;
  }

  async save(user: User): Promise<void> {
    // Check for duplicate username
    const existingByUsername = await this.findByUsername(user.username);
    if (existingByUsername && existingByUsername.id !== user.id) {
      throw new Error(`User with username '${user.username}' already exists`);
    }

    // Check for duplicate email
    if (user.email) {
      for (const existingUser of this.users.values()) {
        if (existingUser.email === user.email && existingUser.id !== user.id) {
          throw new Error(`User with email '${user.email}' already exists`);
        }
      }
    }

    this.users.set(user.id, user);
    logger.info('User saved', { userId: user.id, username: user.username });
  }

  async update(user: User): Promise<void> {
    if (!this.users.has(user.id)) {
      throw new Error(`User with id ${user.id} not found`);
    }

    // Check for duplicate username
    const existingByUsername = await this.findByUsername(user.username);
    if (existingByUsername && existingByUsername.id !== user.id) {
      throw new Error(`User with username '${user.username}' already exists`);
    }

    // Check for duplicate email
    if (user.email) {
      for (const existingUser of this.users.values()) {
        if (existingUser.email === user.email && existingUser.id !== user.id) {
          throw new Error(`User with email '${user.email}' already exists`);
        }
      }
    }

    this.users.set(user.id, user);
    logger.info('User updated', { userId: user.id });
  }

  async delete(id: string): Promise<void> {
    if (!this.users.has(id)) {
      throw new Error(`User with id ${id} not found`);
    }

    this.users.delete(id);
    logger.info('User deleted', { userId: id });
  }

  async findAll(options: {
    page?: number;
    limit?: number;
    role?: string;
  } = {}): Promise<{
    users: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    let users = Array.from(this.users.values());

    // Filter by role if specified
    if (options.role) {
      users = users.filter(user => user.role === options.role);
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = users.length;
    const paginatedUsers = users.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      users: paginatedUsers,
      total,
      page,
      totalPages
    };
  }

  async count(): Promise<number> {
    return this.users.size;
  }
}