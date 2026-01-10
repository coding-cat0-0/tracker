import { AuthService } from '../../services/authservice';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Timesheet {
  id: number;
  employee_id: number;
  work_date: string;
  start_time: string;
  end_time: string | null;
  status: string;
  total_seconds: number | null;
  idle_seconds: number | null;
}

interface AppUsageRecord {
  id: number;
  timesheet_id: number;
  employee_id: number;
  app: string;
  duration: number;
  timestamp: string;
  role: string;
}

interface TimesheetResponse {
  timesheets: Timesheet[];
  app_usages_map: { [key: number]: AppUsageRecord[] };
  idle_times: Array<{ timesheet_id: number; idle_seconds: number }>;
}

interface Employee {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
}

interface AppUsage {
  app_name: string;
  total_duration: number;
  last_active: string;
}

interface IdlePeriod {
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

@Component({
  selector: 'app-timesheets',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './timesheets.component.html',
  styleUrl: './timesheets.component.css'
})
export class TimesheetsComponent implements OnInit, OnDestroy {
  timesheets: Timesheet[] = [];
  employees: Employee[] = [];
  selectedEmployeeId: number | null = null;
  dateRange: 'today' | 'week' = 'today';
  isLoading = false;
  isRefreshing = false;
  errorMessage: string | null = null;

  // For storing app usages mapped by timesheet ID
  appUsagesMap: { [timesheet_id: number]: AppUsageRecord[] } = {};

  // Employee-specific properties
  userName: string = '';
  totalTime: string = '00:00:00';
  idleTime: string = '00:00:00';
  totalTimeSeconds: number = 0;
  idleTimeSeconds: number = 0;
  appUsages: AppUsage[] = [];
  idlePeriods: IdlePeriod[] = [];

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnDestroy() {
    // Nothing to clean up - no intervals
  }

  ngOnInit() {
    // Check if user is authenticated
    if (!this.auth.isAuthenticated()) {
      this.errorMessage = 'You must be logged in to view timesheets';
      return;
    }

    if (this.auth.isAdmin()) {
      // Admin: Load employees list first (to populate dropdown), then set username and load timesheets
      this.loadEmployees().then(() => {
        this.userName = this.getUserName() || 'Employee';
        this.loadAllEmployeesTimesheets();
      });
    } else if (this.auth.isEmployee()) {
      console.log('Employee mode - Auth username:', this.auth.username());
      this.userName = this.auth.username() || 'Employee';
      console.log('Set userName to:', this.userName);
      this.loadEmployeeTimesheets();
    }
  }

  /**
   * Refresh button: Fetch fresh data from the API based on role
   */
  refreshTimesheets() {
    this.isRefreshing = true;
    let endpoint: string;

    if (this.auth.isAdmin()) {

      if (this.selectedEmployeeId === null) {

        endpoint = 'http://localhost:9000/admin/get_all_timesheets';
      } else {
        endpoint = `http://localhost:9000/admin/get_user_timesheet?employee_id=${this.selectedEmployeeId}`;
      }
    } else if (this.auth.isEmployee()) {
    
      endpoint =
        this.dateRange === 'today'
          ? 'http://localhost:9000/employee/get_employee_timesheet'
          : 'http://localhost:9000/employee/get_employee_timesheet_week';
    } else {
      // No valid role
      this.isRefreshing = false;
      this.errorMessage = 'Invalid user role';
      return;
    }

    // Fetch fresh data from the determined endpoint
    this.http.get<TimesheetResponse>(endpoint).subscribe({
      next: (res) => {
        this.timesheets = res.timesheets;
        this.appUsagesMap = res.app_usages_map;
        
        // Admin: Filter by today, Employee: Calculate totals
        if (this.auth.isAdmin()) {
          this.timesheets = this.filterTimesheetsByDate(this.timesheets);
        } else {
          this.calculateTimeTotals();
        }
        
        this.isRefreshing = false;
        console.log('✅ Timesheets refreshed successfully');
      },
      error: (error) => {
        console.error('Error refreshing timesheets:', error);
        this.isRefreshing = false;
        this.errorMessage = 'Failed to refresh timesheets';
      }
    });
  }

  /**
   * Calculate total time and idle time from timesheets
   */
  private calculateTimeTotals() {
    let totalSeconds = 0;
    let idleSeconds = 0;

    this.timesheets.forEach((ts) => {
      let duration = ts.total_seconds || 0;
      const isActive = (ts.status || '').toLowerCase() === 'active';
      
      if (duration === 0 && isActive && ts.start_time && !ts.end_time) {
        const startTime = new Date(ts.start_time).getTime();
        const now = new Date().getTime();
        duration = Math.floor((now - startTime) / 1000);
      }
      
      totalSeconds += duration;
      
      if (ts.idle_seconds) {
        idleSeconds += ts.idle_seconds;
      }
    });

    this.totalTimeSeconds = totalSeconds;
    this.idleTimeSeconds = idleSeconds;
    this.totalTime = this.formatSeconds(totalSeconds);
    this.idleTime = this.formatSeconds(idleSeconds);

    this.calculateAppUsage();
    this.calculateIdlePeriods();
  }

  /**
   * Format seconds to HH:MM:SS format
   */
  formatSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return (
      hours.toString().padStart(2, '0') +
      ':' +
      minutes.toString().padStart(2, '0') +
      ':' +
      secs.toString().padStart(2, '0')
    );
  }

  /**
   * Get app usages for a specific timesheet ID
   */
  getAppUsagesForTimesheet(timesheetId: number): AppUsageRecord[] {
    return this.appUsagesMap[timesheetId] || [];
  }

  /**
   * Calculate app usage breakdown from timesheets
   */
  private calculateAppUsage() {
    const appMap: { [key: string]: AppUsage } = {};

    // Aggregate all app usages from all timesheets
    Object.values(this.appUsagesMap).forEach(usages => {
      usages.forEach(usage => {
        const appName = usage.app || 'Unknown';

        if (!appMap[appName]) {
          appMap[appName] = {
            app_name: appName,
            total_duration: 0,
            last_active: usage.timestamp
          };
        }

        appMap[appName].total_duration += usage.duration || 0;
        
        // Update last_active if this record is newer
        if (usage.timestamp > appMap[appName].last_active) {
          appMap[appName].last_active = usage.timestamp;
        }
      });
    });

    // Convert map to array and sort by total duration
    this.appUsages = Object.values(appMap).sort(
      (a, b) => b.total_duration - a.total_duration
    );
  }

  /**
   * Calculate idle periods from timesheets
   */
  private calculateIdlePeriods() {
    this.idlePeriods = [];

    this.timesheets.forEach((ts) => {
      if (ts.idle_seconds && ts.idle_seconds > 0) {
        const startTime = new Date(ts.start_time);
        const idleMinutes = Math.floor(ts.idle_seconds / 60);
        const endTime = new Date(startTime.getTime() + ts.idle_seconds * 1000);

        this.idlePeriods.push({
          start_time: this.formatTime(startTime),
          end_time: this.formatTime(endTime),
          duration_minutes: idleMinutes
        });
      }
    });
  }

  /**
   * Format time to HH:MM format
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  /**
   * Admin only: Load all employees for the dropdown filter
   */
  loadEmployees(): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<Employee[]>('http://localhost:9000/admin/get_all_employees').subscribe({
        next: (res) => {
          this.employees = res;
          resolve();
        },
        error: (error) => {
          console.error('Error fetching employees:', error);
          this.errorMessage = 'Failed to load employees';
          resolve();
        }
      });
    });
  }

  /**
   * Admin only: Load timesheets for all employees (default view)
   * NO employee_id parameter needed - backend returns all timesheets
   */
  loadAllEmployeesTimesheets() {
    this.isLoading = true;
    this.errorMessage = null;
    this.selectedEmployeeId = null;

    // Call /get_all_timesheets WITHOUT employee_id parameter
    this.http.get<TimesheetResponse>('http://localhost:9000/admin/get_all_timesheets').subscribe({
      next: (res) => {
        this.timesheets = this.filterTimesheetsByDate(res.timesheets);
        this.appUsagesMap = res.app_usages_map;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching timesheets:', error);
        this.errorMessage = 'Failed to load timesheets';
        this.isLoading = false;
      }
    });
  }

  /**
   * Admin only: Filter by selected employee
   * Passes employee_id parameter to get specific employee's timesheets
   */
  loadEmployeeTimesheetsAdmin(employeeId: number) {
    this.isLoading = true;
    this.errorMessage = null;

    // Call /get_user_timesheet WITH employee_id parameter
    this.http.get<TimesheetResponse>(
      `http://localhost:9000/admin/get_user_timesheet?employee_id=${employeeId}`
    ).subscribe({
      next: (res) => {
        this.timesheets = this.filterTimesheetsByDate(res.timesheets);
        this.appUsagesMap = res.app_usages_map;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching timesheets for selected employee:', error);
        this.errorMessage = 'Failed to load timesheets for the selected employee';
        this.isLoading = false;
      }
    });
  }

  /**
   * Employee only: Load their own timesheets for current day
   */
  loadEmployeeTimesheets(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    return new Promise((resolve) => {
      // Employee uses /get_employee_timesheet endpoint for current day
      this.http.get<TimesheetResponse>(
        'http://localhost:9000/employee/get_employee_timesheet'
      ).subscribe({
        next: (res) => {
          this.timesheets = res.timesheets;
          this.appUsagesMap = res.app_usages_map;
          this.calculateTimeTotals();
          this.isLoading = false;
          resolve();
        },
        error: (error) => {
          console.error('Error fetching your timesheets:', error);
          this.errorMessage = 'No timesheets for today';
          this.isLoading = false;
          resolve();
        }
      });
    });
  }

  /**
   * Employee only: Load their timesheets for past 7 days
   */
  loadEmployeeTimesheetsWeek() {
    this.isLoading = true;
    this.errorMessage = null;

    // Employee uses /get_employee_timesheet_week endpoint for 7 days
    this.http.get<TimesheetResponse>(
      'http://localhost:9000/employee/get_employee_timesheet_week'
    ).subscribe({
      next: (res) => {
        this.timesheets = res.timesheets;
        this.appUsagesMap = res.app_usages_map;
        this.calculateTimeTotals();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching your timesheets:', error);
        this.errorMessage = 'No timesheets found for the past 7 days';
        this.isLoading = false;
      }
    });
  }

  /**
   * Filter timesheets to show only today's timesheets
   */
  filterTimesheetsByDate(timesheets: Timesheet[]): Timesheet[] {
    const today = new Date().toISOString().split('T')[0];
    return timesheets.filter((t) => t.work_date === today);
  }

  /**
   * Called when admin changes the employee filter dropdown
   */
  onEmployeeChange() {
    if (this.selectedEmployeeId === null) {
      // "All Employees" selected
      this.loadAllEmployeesTimesheets();
    } else {
      // Specific employee selected
      this.loadEmployeeTimesheetsAdmin(this.selectedEmployeeId);
    }
  }

  /**
   * Called when employee changes the date range via sidebar
   */
  setDateRange(range: 'today' | 'week') {
    this.dateRange = range;

    if (range === 'today') {
      this.loadEmployeeTimesheets();
    } else {
      this.loadEmployeeTimesheetsWeek();
    }
  }

  /**
   * Get username for current logged-in user
   */
  getUserName(): string {
    const userId = this.auth.userId();
    if (!userId) return 'Employee';
    console.log('Fetching username for user ID:', userId);
    console.log('Employee list:', this.employees);
    const employee = this.employees.find(e => e.id === userId);
    console.log('Found employee:', employee);
    return employee ? employee.username : 'Employee';
  }

  /**
   * Get current date formatted (MM-DD-YYYY)
   */
  getFormattedDate(): string {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    return `${month}-${day}-${year}`;
  }

  /**
   * Get day of week
   */
  getDayOfWeek(): string {
    const today = new Date();
    return today.toLocaleDateString('en-US', { weekday: 'long' });
  }

  /**
   * Get current date formatted
   */
  getCurrentDate(): string {
    const today = new Date();
    return today.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
}