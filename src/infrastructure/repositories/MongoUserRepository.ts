import { injectable, inject } from 'inversify';
import { Collection } from 'mongodb';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User, UserRole, ApiKey } from '../../domain/entities/User';
import { MongoDBConnection } from '../database/MongoDBConnection';
import { logger } from '../logging/Logger';

interface UserDocument {
  _id: string;
  username: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  apiKeys: ApiKey[];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  active: boolean;
}

@injectable()
export class MongoUserRepository implements IUserRepository {
  private collection: Collection<UserDocument>;

  constructor(
    @inject('MongoDBConnection') private dbConnection: MongoDBConnection
  ) {
    this.collection = this.dbConnection.getDb().collection<UserDocument>('users');
    this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    try {
      await this.collection.createIndexes([
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, sparse: true, unique: true },
        { key: { 'apiKeys.key': 1 }, sparse: true },
        { key: { role: 1 } },
        { key: { active: 1 } },
        { key: { createdAt: 1 } }
      ]);
    } catch (error) {
      logger.warn('Failed to create indexes for users collection', { error });
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const doc = await this.collection.findOne({ _id: id });
      return doc ? this.documentToUser(doc) : null;
    } catch (error) {
      logger.error('Failed to find user by id', { id, error });
      throw error;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const doc = await this.collection.findOne({ username });
      return doc ? this.documentToUser(doc) : null;
    } catch (error) {
      logger.error('Failed to find user by username', { username, error });
      throw error;
    }
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    try {
      const doc = await this.collection.findOne({
        'apiKeys.key': apiKey,
        'apiKeys.active': true
      });

      if (doc) {
        const user = this.documentToUser(doc);
        // Update last used timestamp for the API key
        user.updateLastApiKeyUsage(apiKey);
        await this.update(user);
        return user;
      }

      return null;
    } catch (error) {
      logger.error('Failed to find user by API key', { error });
      throw error;
    }
  }

  async save(user: User): Promise<void> {
    try {
      const doc = this.userToDocument(user);
      await this.collection.insertOne(doc);
      logger.info('User created', { userId: user.id, username: user.username });
    } catch (error) {
      logger.error('Failed to save user', { userId: user.id, error });
      throw error;
    }
  }

  async update(user: User): Promise<void> {
    try {
      const doc = this.userToDocument(user);
      const { _id, ...updateDoc } = doc;
      updateDoc.updatedAt = new Date();

      const result = await this.collection.updateOne(
        { _id: user.id },
        { $set: updateDoc }
      );

      if (result.matchedCount === 0) {
        throw new Error(`User with id ${user.id} not found`);
      }

      logger.info('User updated', { userId: user.id });
    } catch (error) {
      logger.error('Failed to update user', { userId: user.id, error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await this.collection.deleteOne({ _id: id });

      if (result.deletedCount === 0) {
        throw new Error(`User with id ${id} not found`);
      }

      logger.info('User deleted', { userId: id });
    } catch (error) {
      logger.error('Failed to delete user', { userId: id, error });
      throw error;
    }
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
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (options.role) {
        filter.role = options.role;
      }

      const [docs, total] = await Promise.all([
        this.collection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.collection.countDocuments(filter)
      ]);

      const users = docs.map(doc => this.documentToUser(doc));
      const totalPages = Math.ceil(total / limit);

      return { users, total, page, totalPages };
    } catch (error) {
      logger.error('Failed to find all users', { options, error });
      throw error;
    }
  }

  async count(): Promise<number> {
    try {
      return await this.collection.countDocuments();
    } catch (error) {
      logger.error('Failed to count users', { error });
      throw error;
    }
  }

  private documentToUser(doc: UserDocument): User {
    return new User(
      doc._id,
      doc.username,
      doc.passwordHash,
      doc.role,
      doc.email,
      doc.apiKeys,
      doc.createdAt,
      doc.updatedAt,
      doc.lastLoginAt,
      doc.active
    );
  }

  private userToDocument(user: User): UserDocument {
    return {
      _id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      apiKeys: user.apiKeys,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      active: user.active
    };
  }
}