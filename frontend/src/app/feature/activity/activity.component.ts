import { Component, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { isTauri,invoke } from '@tauri-apps/api/core';
import { AuthService } from '../../services/authservice';

interface UsageRecord {
  app: string;
  duration: number;
  idle_duration: number;
  timestamp: string;
}

@Component({
  selector: 'app-activity',
  templateUrl: './activity.component.html',
  styleUrls: ['./activity.component.scss']
})
export class ActivityComponent implements OnDestroy {

 isTracking = false;
elapsedSeconds = 0;
isIdle = false;

private pollingInterval: ReturnType<typeof setInterval> | null = null;
private timerInterval: ReturnType<typeof setInterval> | null = null;
private syncInterval: ReturnType<typeof setInterval> | null = null;

constructor(
  private http: HttpClient,
  private snackBar: MatSnackBar,
  public auth: AuthService
) {
  this.restoreTrackingState();
}


private async restoreTrackingState() {
  try {

    const response = await this.http
      .get<any>('http://localhost:9000/employee/get_employee_timesheet')
      .toPromise();

    if (response && response.timesheets && response.timesheets.length > 0) {
      const timesheet = response.timesheets[0];
      
      const isActive = (timesheet.status || '').toLowerCase() === 'active';
      if (isActive && !timesheet.end_time) {
        console.log('⚡ Restoring active tracking session...');
        this.isTracking = true;
        
        try {
          const elapsed = await invoke<number>('get_elapsed');
          this.elapsedSeconds = elapsed;
          console.log('Restored elapsed time:', elapsed, 'seconds');
        } catch (e) {
          console.warn('Could not restore elapsed time:', e);
        }

        this.startElapsedTimer();
        this.startPolling();
        this.startAutoSync();
        
        console.log(' Tracking session restored');
      }
    }
  } catch (error: any) {
    console.log('No active timesheet to restore');
  }
}

async startTracking() {
  if (!this.auth.isAuthenticated()) {
    this.snackBar.open('Please sign in first', 'Close', { duration: 2000 });
    return;
  }

  if (this.isTracking) return;

  if (!isTauri()) {
    this.snackBar.open(
      'Tracking works only in the desktop app',
      'Close',
      { duration: 3000 }
    );
    return;
  }

  try {
    await this.http
      .post('http://localhost:9000/employee/start_timesheet', {})
      .toPromise();

    console.log('Starting Rust tracker...');
    await invoke('start_tracking');
    console.log('Rust tracker started successfully');

    this.isTracking = true;
    this.elapsedSeconds = 0;

    this.startElapsedTimer();
    this.startPolling();
    this.startAutoSync();

  } catch (error: any) {
    console.error('Failed to start tracking:', error);
    console.error('Error response:', error.error);
    const message = error.error?.detail || 'Failed to start tracking';
    this.snackBar.open(message, 'Close', { duration: 3000 });
    this.isTracking = false;
  }
}

async stopTracking() {
  if (!this.isTracking) return;

  try {
    // Stop Rust side
    await invoke('stop_tracking');

    // Finalize everything on backend
    await this.http
      .put('http://localhost:9000/employee/stop_tracking', {})
      .toPromise();

  } finally {
    this.isTracking = false;
    this.isIdle = false;
    this.stopElapsedTimer();
    this.stopPolling();
    this.stopAutoSync();
  }
}


private startElapsedTimer() {
  if (this.timerInterval) return;

  this.timerInterval = setInterval(() => {
    this.elapsedSeconds++;
  }, 1000);
}

private stopElapsedTimer() {
  if (!this.timerInterval) return;

  clearInterval(this.timerInterval);
  this.timerInterval = null;
}


private startPolling() {
  if (this.pollingInterval) return;

  this.pollingInterval = setInterval(async () => {
    try {
      const usage = await invoke<UsageRecord | null>('tick_usage');
      
      // Only process if usage data is available
      // null is normal - means no new data available yet
      if (usage) {
        // Check if user is idle (idle_duration > 0 means user has been idle for 2+ minutes)
        this.isIdle = usage.idle_duration > 0;
        this.sendUsage(usage);
      }
      // If usage is null, just wait for next polling cycle - don't log as error
    } catch (error: any) {
      // Only log actual errors, not null returns
      if (error && error.message && !error.message.includes('no_data')) {
        console.error('Polling error:', error);
      }
    }
  }, 1000);
}

private stopPolling() {
  if (!this.pollingInterval) return;

  clearInterval(this.pollingInterval);
  this.pollingInterval = null;
}


private startAutoSync() {
  if (this.syncInterval) return;

  this.syncInterval = setInterval(() => {
    this.http
      .post('http://localhost:9000/employee/sync', {})
      .subscribe({
        next: () => {
          console.log('✅ Auto-sync successful');
        },
        error: (error) => {
          console.error('Auto-sync error:', error);
        }
      });
  }, 120000); // 2 minutes
}

private stopAutoSync() {
  if (!this.syncInterval) return;

  clearInterval(this.syncInterval);
  this.syncInterval = null;
}



private sendUsage(usage: UsageRecord) {
  this.http
    .post('http://localhost:9000/employee/event_buffering', usage)
    .subscribe({
      next: () => {
        console.log('📊 Usage buffered:', usage.app);
      },
      error: (error) => {
        console.error('Failed to buffer usage:', error);
      }
    });
}



formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return (
    hrs.toString().padStart(2, '0') + ':' +
    mins.toString().padStart(2, '0') + ':' +
    secs.toString().padStart(2, '0')
  );
}

ngOnDestroy(): void {
  // IMPORTANT: Do NOT stop tracking when navigating away!
  // User may go to Timesheets to view current tracking status.
  // Only stop if explicitly clicked the stop button.
  
  // The intervals and state are preserved so they can resume if user comes back
  console.log('Activity component destroyed, but tracking continues in background...');
}
}