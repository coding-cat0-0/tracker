import { AuthService } from '../../services/authservice';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Applications {
  id: number;
  employee_id: number;
  reason: string;
  body: string;
  status: string;
  created_at: string;
}

interface Employee {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent implements OnInit {
  applications: Applications[] = [];
  filteredApplications: Applications[] = [];
  employees: Employee[] = [];
  selectedEmployeeId: number | null = null;
  selectedStatus: string = 'pending';
  errorMessage: string | null = null;
  isLoading = false;
  reason: string = '';
  body: string = '';
  showApplicationForm: boolean = false;
  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.loadEmployees();
      this.loadAllEmployeesApplications();
    } else if (this.auth.isEmployee()) {
      this.viewApplications();
    }
  }

  loadEmployees() {
    this.http.get<Employee[]>('http://localhost:9000/admin/get_all_employees').subscribe({
      next: (res) => {
        this.employees = res;
      },
      error: (error) => {
        console.error('Error fetching employees:', error);
        this.errorMessage = 'Failed to load employees';
      }
    });
  }

  loadAllEmployeesApplications() {
    this.isLoading = true;
    this.errorMessage = null;
    this.selectedEmployeeId = null;

    this.http.get<Applications[]>('http://localhost:9000/admin/view_applications').subscribe({
      next: (res) => {
        this.applications = res;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching applications:', error);
        this.errorMessage = 'Failed to load applications';
        this.isLoading = false;
      }
    });
  }

  loadEmployeeApplications() {
    this.isLoading = true;
    this.errorMessage = null;

    this.http.get<Applications[]>(
      `http://localhost:9000/admin/get_applications?employee_id=${this.selectedEmployeeId}`
    ).subscribe({
      next: (res) => {
        this.applications = res;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching applications for employee:', error);
        this.errorMessage = 'No applications submitted by this employee';
        this.isLoading = false;
      }
    });
  }

  onEmployeeChange() {
    if (this.selectedEmployeeId !== null) {
      this.loadEmployeeApplications();
    } else {
      this.loadAllEmployeesApplications();
    }
  }

  acceptApplication(applicationId: number) {
    this.http.put('http://localhost:9000/admin/review_application', {
      app_id: applicationId,
      status: 'accepted'
    }).subscribe({
      next: (res) => {
        console.log('✅ Application approved successfully', res);
        this.reloadApplications();
      },
      error: (error) => {
        console.error('Error approving application:', error);
        this.errorMessage = 'Failed to approve application';
      }
    });
  }

  rejectApplication(applicationId: number) {
    this.http.put('http://localhost:9000/admin/review_application', {
      app_id: applicationId,
      status: 'rejected'
    }).subscribe({
      next: (res) => {
        console.log('✅ Application rejected successfully', res);
        this.reloadApplications();
      },
      error: (error) => {
        console.error('Error rejecting application:', error);
        this.errorMessage = 'Failed to reject application';
      }
    });
  }

  /**
   * Smart reload - reloads applications based on current view
   * If viewing ALL applications, reload all
   * If viewing specific employee, reload that employee's applications
   */
  private reloadApplications() {
    if (this.selectedEmployeeId === null) {
      this.loadAllEmployeesApplications();
    } else {
      this.loadEmployeeApplications();
    }
  }

  submitApplication() {
    if (!this.reason.trim()) {
      this.errorMessage = 'Please select a reason';
      return;
    }

    // If reason is 'other', body is mandatory
    if (this.reason === 'other' && !this.body.trim()) {
      this.errorMessage = 'Please provide details for "Other" reason';
      return;
    }

    // For casual and sick, body is optional but if provided must not be empty
    if (this.body && this.body.trim().length === 0) {
      this.errorMessage = 'Please provide a valid description or leave it empty';
      return;
    }

    this.isLoading = true;
    this.http.post('http://localhost:9000/employee/apply_for_leave', {
      reason: this.reason,
      body: this.body
    }).subscribe({
      next: (res: any) => {
        console.log(' Application submitted successfully', res);
        this.reason = '';
        this.body = '';
        this.errorMessage = null;
        this.isLoading = false;
        this.viewApplications();  // Refresh to show newly submitted application
      },
      error: (error: any) => {
        console.error('Error submitting application:', error);
        this.errorMessage = 'Failed to submit application';
        this.isLoading = false;
      }
    });
  }

  viewApplications() {
    this.isLoading = true;
    this.http.get<Applications[]>(`http://localhost:9000/employee/see_your_applications?status=${this.selectedStatus}`).subscribe({
      next: (res) => {
        this.applications = res;
        this.filteredApplications = res;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching applications:', error);
        this.errorMessage = 'Failed to load your applications';
        this.isLoading = false;
      }
    });
  }

  /**
   * Filters applications based on selected status (for employee view)
   */
  filterApplicationsByStatus() {
    this.viewApplications();
  }

  /**
   * Deletes a pending application
   */
  deleteApplication(applicationId: number) {
    if (confirm('Are you sure you want to delete this application?')) {
      this.http.delete(`http://localhost:9000/employee/delete_application?app_id=${applicationId}`).subscribe({
        next: (res) => {
          console.log('Application deleted successfully', res);
          this.viewApplications();  // Refresh the list
        },
        error: (error) => {
          console.error('Error deleting application:', error);
          this.errorMessage = 'Failed to delete application';
        }
      });
    }
  }

  /**
   * Gets employee username by ID
   */
  getEmployeeName(employeeId: number): string {
    const employee = this.employees.find(e => e.id === employeeId);
    return employee ? employee.username : 'Unknown User';
  }
}