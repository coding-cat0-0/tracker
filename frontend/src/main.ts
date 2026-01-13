import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { AuthInterceptor } from './app/interceptors/authinterceptor';

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    ...(appConfig.providers ?? []),
    provideHttpClient(
      withInterceptors([AuthInterceptor]),
      withFetch()
    )
  ]
}).catch(err => console.error(err));