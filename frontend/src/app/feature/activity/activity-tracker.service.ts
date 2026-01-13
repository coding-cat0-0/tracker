import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { AuthService } from '../../services/authservice';

interface UsageRecord {
  app: string;
  duration: number;
  idle_duration: number;
  timestamp: string;
}

interface ActiveTimesheetResponse {
  id: number;
  status: string;
  end_time: string | null;
  start_time: string;
}

interface ActiveTimesheetListResponse {
  timesheets?: ActiveTimesheetResponse[] | null;
}

@Injectable({ providedIn: 'root' })
export class ActivityTrackerService {
  private initialized = false;

  private isTrackingSubject = new BehaviorSubject<boolean>(false);
  readonly isTracking$ = this.isTrackingSubject.asObservable();

  private elapsedSecondsSubject = new BehaviorSubject<number>(0);
  readonly elapsedSeconds$ = this.elapsedSecondsSubject.asObservable();

  private isIdleSubject = new BehaviorSubject<boolean>(false);
  readonly isIdle$ = this.isIdleSubject.asObservable();

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private auth: AuthService
  ) {}

  init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    void this.restoreTrackingState();
  }

  async startTracking(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.snackBar.open('Please sign in first', 'Close', { duration: 2000 });
      return;
    }

    if (this.isTrackingSubject.getValue()) {
      return;
    }

    if (!isTauri()) {
      this.snackBar.open('Tracking works only in the desktop app', 'Close', {
        duration: 3000
      });
      return;
    }

    try {
      await firstValueFrom(
        this.http.post('http://localhost:9000/employee/start_timesheet', {}, {
          withCredentials: true
        })
      );

      await invoke('start_tracking');

      this.isTrackingSubject.next(true);
      this.elapsedSecondsSubject.next(0);

      this.startElapsedTimer();
      this.startPolling();
      this.startAutoSync();
    } catch (error: any) {
      const message = error?.error?.detail || 'Failed to start tracking';
      this.snackBar.open(message, 'Close', { duration: 3000 });
      this.isTrackingSubject.next(false);
    }
  }

  async stopTracking(): Promise<void> {
    if (!this.isTrackingSubject.getValue()) {
      return;
    }

    try {
      await invoke('stop_tracking');
      await firstValueFrom(
        this.http.put('http://localhost:9000/employee/stop_tracking', {}, {
          withCredentials: true
        })
      );
    } finally {
      this.isTrackingSubject.next(false);
      this.isIdleSubject.next(false);
      this.stopElapsedTimer();
      this.stopPolling();
      this.stopAutoSync();
    }
  }

  private async restoreTrackingState(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<ActiveTimesheetListResponse>(
          'http://localhost:9000/employee/get_employee_current_timesheet',
          { withCredentials: true }
        )
      );

      const active =
        response?.timesheets?.find(
          (sheet) =>
            (sheet.status || '').toLowerCase() === 'active' && !sheet.end_time
        ) ?? null;

      if (!active) {
        return;
      }

      this.isTrackingSubject.next(true);

      const approxElapsed = this.calculateElapsedSeconds(active.start_time);
      this.elapsedSecondsSubject.next(approxElapsed);

      if (isTauri()) {
        const elapsedSeconds = Math.max(0, Math.floor(approxElapsed));

        try {
          await invoke('resume_tracking', { elapsed: elapsedSeconds });
        } catch (error) {
          console.warn('Failed to resume native tracker:', error);
        }

        try {
          const rustElapsed = await invoke<number>('get_elapsed');
          if (
            typeof rustElapsed === 'number' &&
            rustElapsed >= elapsedSeconds
          ) {
            this.elapsedSecondsSubject.next(rustElapsed);
          }
        } catch (error) {
          console.warn('Could not restore elapsed time:', error);
        }
      }

      this.startElapsedTimer();
      this.startPolling();
      this.startAutoSync();
    } catch (error: any) {
      if (error?.status === 404) {
        console.log('No active timesheet to restore');
        return;
      }
      console.error('Failed to restore tracking state:', error);
    }
  }

  private calculateElapsedSeconds(startTime: string | null | undefined): number {
      if (!startTime) {
      return this.elapsedSecondsSubject.getValue();
    }

    const trimmed = startTime.trim();
    if (!trimmed) {
      return this.elapsedSecondsSubject.getValue();
    }

    const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(isoLike);
    const normalized = hasZone ? isoLike : `${isoLike}Z`;
    const parsed = Date.parse(normalized);

    if (Number.isNaN(parsed)) {
      return this.elapsedSecondsSubject.getValue();
    }

    const diffMs = Date.now() - parsed;
    return diffMs > 0 ? Math.floor(diffMs / 1000) : 0;
  }

  private startElapsedTimer(): void {
    if (this.timerInterval) {
      return;
    }

    this.timerInterval = setInterval(async () => {
      const current = this.elapsedSecondsSubject.getValue();
      const nextValue = current + 1;
      this.elapsedSecondsSubject.next(nextValue);

      if (nextValue % 10 === 0) {
        try {
          const rustElapsed = await invoke<number>('get_elapsed');

          if (typeof rustElapsed === 'number' && rustElapsed >= nextValue + 2) {
            this.elapsedSecondsSubject.next(rustElapsed);
          }
        } catch (error) {
          // Ignore sync errors and keep local timer running
        }
      }
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (!this.timerInterval) {
      return;
    }

    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  private startPolling(): void {
    if (this.pollingInterval) {
      return;
    }

    this.pollingInterval = setInterval(async () => {
      try {
        const usage = await invoke<UsageRecord | null>('tick_usage');
        if (usage) {
          this.isIdleSubject.next(usage.idle_duration > 0);
          this.sendUsage(usage);
        }
      } catch (error: any) {
        if (!error?.message?.includes('no_data')) {
          console.error('Polling error:', error);
        }
      }
    }, 1000);
  }

  private stopPolling(): void {
    if (!this.pollingInterval) {
      return;
    }

    clearInterval(this.pollingInterval);
    this.pollingInterval = null;
  }

  private startAutoSync(): void {
    if (this.syncInterval) {
      return;
    }

    this.syncInterval = setInterval(() => {
      this.http
        .post('http://localhost:9000/employee/sync', {}, { withCredentials: true })
        .subscribe({
        next: () => console.log('Auto-sync successful'),
        error: (error) => console.error('Auto-sync error:', error)
        });
    }, 120000);
  }

  private stopAutoSync(): void {
    if (!this.syncInterval) {
      return;
    }

    clearInterval(this.syncInterval);
    this.syncInterval = null;
  }

  private sendUsage(usage: UsageRecord): void {
    this.http
      .post('http://localhost:9000/employee/event_buffering', usage, {
        withCredentials: true
      })
      .subscribe({
        next: () => console.log('Usage buffered:', usage.app),
        error: (error) => console.error('Failed to buffer usage:', error)
      });
  }
}
