import { Injectable, Inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { invoke } from '@tauri-apps/api/core';

interface TokenPayload {
  sub: string;
  username: string;
  role: string;
  id: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private ACCESS_TOKEN = 'token';

  isAuthenticated = signal(false);
  isReady = signal(false);
  userRole = signal<string | null>(null);
  userId = signal<number | null>(null);
  username = signal<string | null>(null);

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem(this.ACCESS_TOKEN);
      if (token) {
        this.isAuthenticated.set(true);
        this.decodeToken(token);
        invoke('set_auth_token', { token });
      }
    }
    this.isReady.set(true);
  }

  setToken(token: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    localStorage.setItem(this.ACCESS_TOKEN, token);
    this.isAuthenticated.set(true);
    this.decodeToken(token);

    invoke('set_auth_token', { token });
  }

  getToken(): string | null {
    return isPlatformBrowser(this.platformId)
      ? localStorage.getItem(this.ACCESS_TOKEN)
      : null;
  }

  private decodeToken(token: string): void {
    try {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) return;

      // Decode the payload (second part)
      const decoded = JSON.parse(atob(parts[1])) as TokenPayload;
      console.log('Decoded JWT payload:', decoded);
      this.userRole.set(decoded.role);
      this.userId.set(decoded.id);
      // Username is stored in 'sub' field
      this.username.set(decoded.sub);
      console.log('Set username signal to:', decoded.sub);
    } catch (error) {
      console.error('Error decoding token:', error);
    }
  }

  isAdmin(): boolean {
    return this.userRole() === 'admin';
  }

  isEmployee(): boolean {
    return this.userRole() === 'employee';
  }

  logout() {
    if (!isPlatformBrowser(this.platformId)) return;

    localStorage.removeItem(this.ACCESS_TOKEN);
    this.isAuthenticated.set(false);
    this.userRole.set(null);
    this.userId.set(null);
    this.username.set(null);

    invoke('clear_auth_token');
  }
}