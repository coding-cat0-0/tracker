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
    // Check if user is authenticated
    if (!this.auth.isAuthenticated()) {
      this.errorMessage = 'You must be logged in to view screenshots';
      return;
    }

    // Role-based initialization
    if (this.auth.isAdmin()) {
      // Admin can see all employees and their screenshots
      this.loadEmployees();
      this.loadAllEmployeesScreenshots();
    } else if (this.auth.isEmployee()) {
      // Employee can only see their own screenshots (default: today)
      this.loadEmployeeScreenshots();
    }
  }

  /**
   * Admin only: Load all employees for the dropdown filter
   */
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

  /**
   * Admin only: Load screenshots for all employees (default view)
   * NO employee_id parameter needed - backend returns all screenshots
   */
  loadAllEmployeesScreenshots() {
    this.isLoading = true;
    this.errorMessage = null;
    this.selectedEmployeeId = null;

    // Call /get_screenshots WITHOUT employee_id parameter for all employees
    this.http.get<Screenshot[]>('http://localhost:9000/admin/get_screenshots').subscribe({
      next: (res) => {
        this.screenshots = this.filterScreenshotsByDate(res);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching screenshots:', err);
        this.errorMessage = 'Failed to load screenshots';
        this.isLoading = false;
      }
    });
  }

  /**
   * Admin only: Filter by selected employee
   * Passes employee_id parameter to get specific employee's screenshots
   */
  loadScreenshotsByEmployee(employeeId: number) {
    this.isLoading = true;
    this.errorMessage = null;

    // Call /get_screenshots WITH employee_id parameter
    this.http.get<Screenshot[]>(
      `http://localhost:9000/admin/get_screenshots?employee_id=${employeeId}`
    ).subscribe({
      next: (res) => {
        this.screenshots = this.filterScreenshotsByDate(res);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching screenshots:', err);
        this.errorMessage = 'Failed to load screenshots';
        this.isLoading = false;
      }
    });
  }

  /**
   * Employee only: Load their own screenshots
   * Uses /get_employee_screenshots endpoint with their user ID
   */
  loadEmployeeScreenshots() {
    this.isLoading = true;
    this.errorMessage = null;

    // Employee uses /get_employee_screenshots endpoint for current day
    this.http.get<Screenshot[]>(
      'http://localhost:9000/employee/get_employee_screenshots'
    ).subscribe({
      next: (res) => {
        this.screenshots = this.filterScreenshotsByDate(res);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching your screenshots:', err);
        this.errorMessage = 'Failed to load your screenshots';
        this.isLoading = false;
      }
    });
  }

  /**
   * Employee only: Load their screenshots for past 7 days
   */
  loadEmployeeScreenshotsWeek() {
    this.isLoading = true;
    this.errorMessage = null;

    // Employee uses /get_employee_screenshots_week endpoint for 7 days
    this.http.get<Screenshot[]>(
      'http://localhost:9000/employee/get_employee_screenshots_week'
    ).subscribe({
      next: (res) => {
        this.screenshots = res;  // Don't filter - already filtered by backend
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching your screenshots:', err);
        this.errorMessage = 'Failed to load your screenshots';
        this.isLoading = false;
      }
    });
  }

  /**
   * Filter screenshots to show only today's screenshots
   */
  filterScreenshotsByDate(screenshots: Screenshot[]): Screenshot[] {
    const today = new Date().toISOString().split('T')[0];
    return screenshots.filter((ss) => ss.timestamp.split('T')[0] === today);
  }

  /**
   * Called when admin changes the employee filter dropdown
   */
  onEmployeeChange() {
    if (this.selectedEmployeeId === null) {
      // "All Employees" selected
      this.loadAllEmployeesScreenshots();
    } else {
      // Specific employee selected
      this.loadScreenshotsByEmployee(this.selectedEmployeeId);
    }
  }

  /**
   * Called when employee changes the date range dropdown
   */
  onDateRangeChange() {
    if (this.dateRange === 'today') {
      this.loadEmployeeScreenshots();
    } else {
      this.loadEmployeeScreenshotsWeek();
    }
  }

  /**
   * View full screenshot image in modal
   */
  onClick(ssId: number) {
    this.http.get(
      `http://localhost:9000/admin/view_screenshot?screenshot_id=${ssId}`,
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


