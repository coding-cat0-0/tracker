import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/authservice';

interface Screenshot {
  id: number;
  employee_id: number;
  timesheet_id: number;
  filepath: string;
  timestamp: string;
}

interface Employee {
  id: number;
  name: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-screenshots',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './screenshots.component.html',
  styleUrl: './screenshots.component.css'
})
export class ScreenshotsComponent implements OnInit {
  screenshots: Screenshot[] = [];
  employees: Employee[] = [];
  selectedEmployeeId: number | null = null;
  dateRange: 'today' | 'week' = 'today';  // Dropdown for employees
  fullImageUrl: string | null = null;
  isLoading = false;
  errorMessage: string | null = null;

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {

    if (!this.auth.isAuthenticated()) {
      this.errorMessage = 'You must be logged in to view screenshots';
      return;
    }


    setTimeout(() => {    if (this.auth.isAdmin()) {
          this.loadEmployees();
          this.loadAllEmployeesScreenshots();
        } else if (this.auth.isEmployee()) {
          this.loadEmployeeScreenshots();
        }}, 0)
  }


  loadEmployees() {
    this.http.get<Employee[]>('http://localhost:9000/admin/get_all_employees').subscribe({
      next: (res) => {
        this.employees = res;
      },
      error: (err) => {
        console.error('Error fetching employees:', err);
        this.errorMessage = 'Failed to load employees';
      }
    });
  }


  loadAllEmployeesScreenshots() {
    this.isLoading = true;
    this.errorMessage = null;
    this.selectedEmployeeId = null;

    this.http.get<{screenshots: Screenshot[]}>('http://localhost:9000/admin/get_screenshots').subscribe({
      next: (res) => {
        this.screenshots = this.filterScreenshotsByDate(res.screenshots);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching screenshots:', err);
        this.errorMessage = 'Failed to load screenshots';
        this.isLoading = false;
      }
    });
  }


  loadScreenshotsByEmployee(employeeId: number) {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get<{screenshots: Screenshot[]}>(
      `http://localhost:9000/admin/get_screenshots?employee_id=${employeeId}`
    ).subscribe({
      next: (res) => {
        this.screenshots = this.filterScreenshotsByDate(res.screenshots);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching screenshots:', err);
        this.errorMessage = 'Failed to load screenshots';
        this.isLoading = false;
      }
    });
  }


  loadEmployeeScreenshots() {
    this.isLoading = true;
    this.errorMessage = null;
    console.log('Token before request:', this.auth.getToken());
    this.http.get<{screenshots: Screenshot[]}>(
      'http://localhost:9000/employee/get_screenshots'
    ).subscribe({
      next: (res) => {
        this.screenshots = this.filterScreenshotsByDate(res.screenshots);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching your screenshots:', err);
        this.errorMessage = 'Failed to load your screenshots';
        this.isLoading = false;
      }
    });
  }


  loadEmployeeScreenshotsWeek() {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get<{screenshots: Screenshot[]}>(
      'http://localhost:9000/employee/get_employee_screenshots_week'
    ).subscribe({
      next: (res) => {
        this.screenshots = res.screenshots;  
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching your screenshots:', err);
        this.errorMessage = 'Failed to load your screenshots';
        this.isLoading = false;
      }
    });
  }


  filterScreenshotsByDate(screenshots: Screenshot[]): Screenshot[] {
    const today = new Date().toISOString().split('T')[0];
    return screenshots.filter((ss) => ss.timestamp.split('T')[0] === today);
  }


  onEmployeeChange() {
    if (this.selectedEmployeeId === null) {
      this.loadAllEmployeesScreenshots();
    } else {
      this.loadScreenshotsByEmployee(this.selectedEmployeeId);
    }
  }

  onDateRangeChange() {
    if (this.dateRange === 'today') {
      this.loadEmployeeScreenshots();
    } else {
      this.loadEmployeeScreenshotsWeek();
    }
  }


  onClick(ssId: number) {
    this.http.get(
      `http://localhost:9000/employee/screenshot?screenshot_id=${ssId}`,
      { responseType: 'blob' }
    ).subscribe({
      next: (blob) => {
        const imageUrl = URL.createObjectURL(blob);
        this.fullImageUrl = imageUrl;
      },
      error: (err) => {
        console.error('Error loading screenshot:', err);
        this.errorMessage = 'Failed to load screenshot';
      }
    });
  }

  closePreview() {
    this.fullImageUrl = null;
  }
}


