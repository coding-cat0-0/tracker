import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/authservice';

export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (req.url.includes('/auth/')) {
    return next(req);
  }

  const token = auth.getToken();
  console.log('AuthInterceptor - Token:', token ? 'EXISTS' : 'NULL');
  console.log('AuthInterceptor - URL:', req.url);
  
  if (!token) {
    console.warn('No token found, sending request without auth');
    return next(req);
  }

  console.log('AuthInterceptor - Adding Bearer token');
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    })
  );
};