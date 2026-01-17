import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/authservice';
import { ActivatedRoute } from '@angular/router';
interface Screenshot {
  id: number;
  image_url: string;
  timestamp: string;
  Appname: string[];
  safeURL: string;
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
  imports: [CommonModule, FormsModule],
  templateUrl: './screenshots.component.html',
  styleUrl: './screenshots.component.css'
})
export class ScreenshotsComponent implements OnInit {
  screenshots: Screenshot[] = [];
  employees: Employee[] = [];
  selectedEmployeeId: number | null = null;
  // Removed dateRange: filtering now handled by sidebar via query param
  fullImageUrl: string | null = null;
  selectedScreenshot: Screenshot | null = null;
  isLoading = false;
  errorMessage: string | null = null;

  constructor(private http: HttpClient, public auth: AuthService, private route: ActivatedRoute) {}

  ngOnInit() {
    if (!this.auth.isAuthenticated()) {
      this.errorMessage = 'You must be logged in to view screenshots';
      return;
    }

    this.route.queryParams.subscribe(params => {
      // Sidebar sets 'view' param: 'current' or 'weekly'
      const view = params['view'] || 'current';
      if (this.auth.isAdmin()) {
        this.loadEmployees();
        this.loadAllEmployeesScreenshots();
      } else if (this.auth.isEmployee()) {
        if (view === 'weekly') {
          this.loadEmployeeScreenshotsWeek();
        } else {
          this.loadEmployeeScreenshots();
        }
      }
    });
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
        this.screenshots = res.screenshots;
        this.isLoading = false;
        this.loadThumbnails();     
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
        this.screenshots = res.screenshots;
        this.isLoading = false;
        this.loadThumbnails();
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
        this.screenshots = res.screenshots;
        this.isLoading = false;
        this.loadThumbnails();
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
        this.loadThumbnails();
      },
      error: (err) => {
        console.error('Error fetching your screenshots:', err);
        this.errorMessage = 'Failed to load your screenshots';
        this.isLoading = false;

      }
    });
  }

  onEmployeeChange() {
    if (this.selectedEmployeeId === null) {
      this.loadAllEmployeesScreenshots();
    } else {
      this.loadScreenshotsByEmployee(this.selectedEmployeeId);
    }
  }

  // Removed onDateRangeChange: filtering now handled by sidebar


  onClick(ssId: number) {
    const screenshot = this.screenshots.find(ss => ss.id === ssId);
    if (!screenshot) {
      this.errorMessage = 'Screenshot not found';
      return;
    }
    this.selectedScreenshot = screenshot; // Set selected screenshot for modal details

    if (screenshot.safeURL) {
      this.fullImageUrl = screenshot.safeURL;
    } else {
      this.http.get(screenshot.image_url, { responseType: 'blob' }).subscribe({
        next: (blob) => {
          this.fullImageUrl = URL.createObjectURL(blob);
        },
        error: (err) => {
          console.error('Error loading screenshot:', err);
          this.errorMessage = 'Failed to load screenshot';
        }
      });
    }
  }

  loadThumbnails(){
    this.screenshots.forEach(ss => {
      this.http.get(ss.image_url,
        { responseType: 'blob' }
      ).subscribe({
        next: (blob) => {
          ss.safeURL = URL.createObjectURL(blob);
        },
        error: (err) => {
          console.error(`Error loading thumbnail of image: ${ss.id}`, err);
          ss.safeURL = 'assets/placeholder.png';
        }
      });
    });

  }

  closePreview() {
    this.fullImageUrl = null;
    this.selectedScreenshot = null;
  }
}


