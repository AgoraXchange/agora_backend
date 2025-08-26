import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService } from '@/services/api/auth.service';
import type { AuthResponse } from '@/types/api';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginDemo: () => Promise<boolean>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const existingToken = authService.getToken();
    if (existingToken) {
      setToken(existingToken);
      // In a real app, you might want to validate the token with the server
      // For now, we'll assume it's valid and create a mock user
      setUser({
        id: 'current-user',
        email: 'user@example.com',
        role: 'ADMIN'
      });
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await authService.login({ username, password });
      
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.accessToken);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const loginDemo = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await authService.loginDemo();
      
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.accessToken);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Demo login failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setToken(null);
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const response = await authService.refreshToken();
      
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.accessToken);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      return false;
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    loginDemo,
    logout,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}