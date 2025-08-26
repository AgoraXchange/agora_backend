import { apiClient } from './client';
import { API_CONFIG, API_ENDPOINTS } from '@/config/api.config';
import type { LoginRequest, AuthResponse, ApiResponse } from '@/types/api';

class AuthService {
  async login(credentials: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    console.log('🔐 Attempting login with:', credentials);
    const response = await apiClient.post<AuthResponse>(API_ENDPOINTS.LOGIN, credentials);
    
    if (response.success && response.data?.accessToken) {
      localStorage.setItem(API_CONFIG.AUTH_TOKEN_KEY, response.data.accessToken);
      // Store refresh token separately if needed
      if (response.data.refreshToken) {
        localStorage.setItem(`${API_CONFIG.AUTH_TOKEN_KEY}_refresh`, response.data.refreshToken);
      }
    }
    
    return response;
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post(API_ENDPOINTS.LOGOUT);
    } catch (error) {
      console.warn('Logout API call failed, clearing local storage anyway');
    } finally {
      localStorage.removeItem(API_CONFIG.AUTH_TOKEN_KEY);
      localStorage.removeItem(`${API_CONFIG.AUTH_TOKEN_KEY}_refresh`);
    }
  }

  async refreshToken(): Promise<ApiResponse<AuthResponse>> {
    const refreshToken = localStorage.getItem(`${API_CONFIG.AUTH_TOKEN_KEY}_refresh`);
    const response = await apiClient.post<AuthResponse>(API_ENDPOINTS.REFRESH, { refreshToken });
    
    if (response.success && response.data?.accessToken) {
      localStorage.setItem(API_CONFIG.AUTH_TOKEN_KEY, response.data.accessToken);
      if (response.data.refreshToken) {
        localStorage.setItem(`${API_CONFIG.AUTH_TOKEN_KEY}_refresh`, response.data.refreshToken);
      }
    }
    
    return response;
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem(API_CONFIG.AUTH_TOKEN_KEY);
    return !!token;
  }

  getToken(): string | null {
    return localStorage.getItem(API_CONFIG.AUTH_TOKEN_KEY);
  }

  // For testing purposes - create a demo login
  async loginDemo(): Promise<ApiResponse<AuthResponse>> {
    if (API_CONFIG.MOCK_MODE) {
      // Mock successful login
      const mockResponse: AuthResponse = {
        accessToken: 'demo-jwt-token-' + Date.now(),
        refreshToken: 'demo-refresh-token-' + Date.now(),
        user: {
          id: 'demo-user',
          username: 'demo',
          role: 'ADMIN'
        }
      };
      
      localStorage.setItem(API_CONFIG.AUTH_TOKEN_KEY, mockResponse.accessToken);
      localStorage.setItem(`${API_CONFIG.AUTH_TOKEN_KEY}_refresh`, mockResponse.refreshToken);
      
      return {
        success: true,
        data: mockResponse
      };
    }

    // Try to login with demo credentials (using the hardcoded admin user)
    return this.login({
      username: 'admin',
      password: 'admin123'
    });
  }
}

export const authService = new AuthService();