import { AuthService } from '../../services/authservice';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

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

interface TimesheetResponse {
  timesheets?: Timesheet[] | null;
}

interface Employee {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
}

interface IdlePeriod {
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

@Component({
  selector: 'app-timesheets',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  userName: string = '';
  totalTime: string = '00:00:00';
  idleTime: string = '00:00:00';
  totalTimeSeconds: number = 0;
  idleTimeSeconds: number = 0;
  idlePeriods: IdlePeriod[] = [];

  constructor(private http: HttpClient, public auth: AuthService, private route: ActivatedRoute) {}

  ngOnDestroy() {
  }


  ngOnInit() {
    if (!this.auth.isAuthenticated()) {
      this.errorMessage = 'You must be logged in to view timesheets';
      return;
    }

    this.route.queryParams.subscribe(params => {
      const view = params['view'];
      if (view === 'weekly') {
        this.setDateRange('week');
      } else {
        this.setDateRange('today');
      }
    });

    setTimeout(() => {
      if (this.auth.isAdmin()) {
        this.loadEmployees().then(() => {
          this.userName = this.getUserName() || 'Employee';
          this.loadAllEmployeesTimesheets();
        });
      } else if (this.auth.isEmployee()) {
        this.userName = this.auth.username() || 'Employee';
        this.loadEmployeeTimesheets();
      }
    }, 0);
  }


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
          ? 'http://localhost:9000/employee/get_employee_current_timesheet'
          : 'http://localhost:9000/employee/get_employee_timesheet_week';
    } else {
            this.isRefreshing = false;
      this.errorMessage = 'Invalid user role';
      return;
    }

    this.http.get<TimesheetResponse>(endpoint).subscribe({
      next: (res) => {
        this.timesheets = res.timesheets || [];

        if (this.auth.isAdmin()) {
          this.timesheets = this.filterTimesheetsByDate(this.timesheets);
        } else {
          this.calculateTimeTotals();
        }
        
        this.isRefreshing = false;
        console.log('Timesheets refreshed successfully');
      },
      error: (error) => {
        console.error('Error refreshing timesheets:', error);
        this.isRefreshing = false;
        this.errorMessage = 'Failed to refresh timesheets';
      }
    });
  }


  private calculateTimeTotals() {
    if (!Array.isArray(this.timesheets)) {
      this.timesheets = [];
    }
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
    this.calculateIdlePeriods();
  }


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

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  formatTimeWithAMPM(timeString: string | null): string {
    if (!timeString) return '-';
    
    // Extract HH:MM from datetime string (format: YYYY-MM-DD HH:MM:SS)
    const timePart = timeString.slice(11, 16);
    const [hours, minutes] = timePart.split(':').map(Number);
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12; // Convert to 12-hour format
    
    return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

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


  loadAllEmployeesTimesheets() {
    this.isLoading = true;
    this.errorMessage = null;
    this.selectedEmployeeId = null;

    this.http.get<TimesheetResponse>('http://localhost:9000/admin/get_all_timesheets').subscribe({
      next: (res) => {
        this.timesheets = this.filterTimesheetsByDate(res.timesheets||[]);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching timesheets:', error);
        this.errorMessage = 'Failed to load timesheets';
        this.isLoading = false;
      }
    });
  }

 
  loadEmployeeTimesheetsAdmin(employeeId: number) {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get<TimesheetResponse>(
      `http://localhost:9000/admin/get_user_timesheet?employee_id=${employeeId}`
    ).subscribe({
      next: (res) => {
        this.timesheets = this.filterTimesheetsByDate(res.timesheets||[]);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching timesheets for selected employee:', error);
        this.errorMessage = 'Failed to load timesheets for the selected employee';
        this.isLoading = false;
      }
    });
  }


  loadEmployeeTimesheets(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    return new Promise((resolve) => {
      this.http.get<TimesheetResponse>(
        'http://localhost:9000/employee/get_employee_current_timesheet'
      ).subscribe({
        next: (res) => {
          this.timesheets = res.timesheets || [];
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


  loadEmployeeTimesheetsWeek() {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get<TimesheetResponse>(
      'http://localhost:9000/employee/get_employee_timesheet_week'
    ).subscribe({
      next: (res) => {
        this.timesheets = res.timesheets || [];
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



  filterTimesheetsByDate(timesheets: Timesheet[]): Timesheet[] {
    const today = new Date().toISOString().split('T')[0];
    return timesheets.filter((t) => t.work_date === today);
  }


  onEmployeeChange() {
    if (this.selectedEmployeeId === null) {
      this.loadAllEmployeesTimesheets();
    } else {
      this.loadEmployeeTimesheetsAdmin(this.selectedEmployeeId);
    }
  }

  setDateRange(range: 'today' | 'week') {
    this.dateRange = range;

    if (range === 'today') {
      this.loadEmployeeTimesheets();
    } else {
      this.loadEmployeeTimesheetsWeek();
    }
  }

  getUserName(): string {
    const userId = this.auth.userId();
    if (!userId) return 'Employee';
    console.log('Fetching username for user ID:', userId);
    console.log('Employee list:', this.employees);
    const employee = this.employees.find(e => e.id === userId);
    console.log('Found employee:', employee);
    return employee ? employee.username : 'Employee';
  }

  getFormattedDate(): string {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    return `${month}-${day}-${year}`;
  }


  getDayOfWeek(): string {
    const today = new Date();
    return today.toLocaleDateString('en-US', { weekday: 'long' });
  }

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