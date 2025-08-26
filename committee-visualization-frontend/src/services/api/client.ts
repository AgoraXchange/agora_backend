import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { API_CONFIG, HTTP_STATUS } from '@/config/api.config';
import type { ApiResponse } from '@/types/api';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem(API_CONFIG.AUTH_TOKEN_KEY);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        if (API_CONFIG.DEBUG) {
          console.log('🚀 API Request:', {
            method: config.method?.toUpperCase(),
            url: config.url,
            data: config.data,
          });
        }
        
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        if (API_CONFIG.DEBUG) {
          console.log('✅ API Response:', {
            status: response.status,
            url: response.config.url,
            data: response.data,
          });
        }
        return response;
      },
      (error) => {
        console.error('❌ Response Error:', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          data: error.response?.data,
        });

        // Handle token expiration
        if (error.response?.status === HTTP_STATUS.UNAUTHORIZED) {
          localStorage.removeItem(API_CONFIG.AUTH_TOKEN_KEY);
          window.location.href = '/login';
        }

        return Promise.reject(error);
      }
    );
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.get<ApiResponse<T>>(url, config);
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.post<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.put<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.delete<ApiResponse<T>>(url, config);
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  private handleError(error: any): ApiResponse<any> {
    if (error.response?.data) {
      return error.response.data;
    }
    
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
      code: 'NETWORK_ERROR'
    };
  }

  // Method for SSE connections
  public createEventSource(url: string): EventSource {
    const token = localStorage.getItem(API_CONFIG.AUTH_TOKEN_KEY);
    const fullUrl = `${API_CONFIG.BASE_URL}${url}`;
    
    // Note: EventSource doesn't support custom headers directly
    // For auth, we might need to pass token as query parameter or use WebSocket
    const eventSource = new EventSource(fullUrl);
    
    if (API_CONFIG.DEBUG) {
      console.log('🔌 EventSource created for:', fullUrl);
    }
    
    return eventSource;
  }
}

export const apiClient = new ApiClient();