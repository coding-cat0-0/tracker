import { Component, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/authservice';
import { ActivityTrackerService } from './activity-tracker.service';

@Component({
  selector: 'app-activity',
  templateUrl: './activity.component.html',
  styleUrls: ['./activity.component.scss']
})
export class ActivityComponent implements OnInit {

 isTracking = false;
elapsedSeconds = 0;
isIdle = false;
 
constructor(
  public auth: AuthService,
  private tracker: ActivityTrackerService
) {
  this.tracker.isTracking$
    .pipe(takeUntilDestroyed())
    .subscribe((tracking) => (this.isTracking = tracking));

  this.tracker.elapsedSeconds$
    .pipe(takeUntilDestroyed())
    .subscribe((elapsed) => (this.elapsedSeconds = elapsed));

  this.tracker.isIdle$
    .pipe(takeUntilDestroyed())
    .subscribe((idle) => (this.isIdle = idle));
}

ngOnInit(): void {
  this.tracker.init();
}
 
startTracking(): void {
  void this.tracker.startTracking();
}

stopTracking(): void {
  void this.tracker.stopTracking();
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
}