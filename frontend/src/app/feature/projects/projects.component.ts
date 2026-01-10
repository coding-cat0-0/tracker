import { AuthService } from '../../services/authservice';
import { Component, OnInit} from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Projects {
  id: number;
  name: string;
  status: string;
}

interface Employee {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
}

interface ProjectEmployee {
  project_id: number;
  employee_id: number;
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css'
})
export class ProjectsComponent implements OnInit {
  projects: Projects[] = [];
  employees: Employee[] = [];
  assignedEmployees: Employee[] = [];
  unassignedEmployees: Employee[] = [];
  isLoading = false;
  selectedProjectId: number | null = null;
  selectedEmployeeId: number | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  selectedStatus: string = 'active';
  projectName: string = '';
  selectedEmployeesForAssignment: number[] = [];
  selectedEmployeesForCreation: number[] = [];
  showEmployeesList = false;
  showAddEmployeeDropdown = false;
  showCreateProjectModal = false;
  showEmployeeSelectionModal = false;

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.loadEmployees();
      this.loadProjects();
    } else if (this.auth.isEmployee()) {
      this.viewAssignedProjects();
    }
  }

  // ===== ADMIN FUNCTIONS =====

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

  loadProjects() {
    this.isLoading = true;
    this.http.get<Projects[]>('http://localhost:9000/admin/view_projects').subscribe({
      next: (res) => {
        this.projects = res;  
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching projects:', error);
        this.errorMessage = 'Failed to load projects';
        this.isLoading = false;
      }
    });
  }

  createProject() {
    if (!this.projectName.trim()) {
      this.errorMessage = 'Project name cannot be empty';
      return;
    }
    this.isLoading = true;
    this.http.post('http://localhost:9000/admin/create_project', {
      name: this.projectName,
      emp_id: this.selectedEmployeesForCreation
    }).subscribe({
      next: (res) => {
        console.log('✅ Project created successfully', res);
        this.projectName = '';
        this.selectedEmployeesForCreation = [];
        this.errorMessage = null;
        this.successMessage = 'Project created successfully!';
        this.showCreateProjectModal = false;
        this.loadProjects();
        this.isLoading = false;
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (error) => {
        console.error('Error creating project:', error);
        this.errorMessage = 'Failed to create project';
        this.isLoading = false;
      } 
    });
  }

  /**
   * Toggle create project modal
   */
  toggleCreateProjectModal() {
    this.showCreateProjectModal = !this.showCreateProjectModal;
    if (!this.showCreateProjectModal) {
      this.showEmployeeSelectionModal = false;
      this.projectName = '';
      this.selectedEmployeesForCreation = [];
      this.errorMessage = null;
    }
  }

  /**
   * Toggle employee selection modal during project creation
   */
  toggleEmployeeSelectionModal() {
    this.showEmployeeSelectionModal = !this.showEmployeeSelectionModal;
  }

  /**
   * Add/remove employee from creation selection
   */
  toggleEmployeeForCreation(employeeId: number) {
    const index = this.selectedEmployeesForCreation.indexOf(employeeId);
    if (index > -1) {
      this.selectedEmployeesForCreation.splice(index, 1);
    } else {
      this.selectedEmployeesForCreation.push(employeeId);
    }
  }

  /**
   * Check if employee is selected for creation
   */
  isEmployeeSelectedForCreation(employeeId: number): boolean {
    return this.selectedEmployeesForCreation.includes(employeeId);
  }

  /**
   * Get employee username by ID (for display in chips)
   */
  getEmployeeUsername(employeeId: number): string {
    const employee = this.employees.find(e => e.id === employeeId);
    return employee ? employee.username : 'Unknown';
  }

  deleteProject() {
    if (!this.selectedProjectId) {
      this.errorMessage = 'Please select a project to delete';
      return;
    }
    if (confirm('Are you sure you want to delete this project?')) {
      this.http.delete(`http://localhost:9000/admin/delete_project?p_id=${this.selectedProjectId}`).subscribe({      
        next: (res) => {
          console.log('✅ Project deleted successfully', res);
          this.selectedProjectId = null;
          this.loadProjects();
          this.errorMessage = null;
        },
        error: (error) => {
          console.error('Error deleting project:', error);
          this.errorMessage = 'Failed to delete project';
        }
      });
    }
  }

  removeEmployeeFromProject() {
    if (!this.selectedProjectId || !this.selectedEmployeeId) {
      this.errorMessage = 'Please select both project and employee';
      return;
    }
    if (confirm('Are you sure you want to remove this employee from the project?')) {
      this.http.delete(`http://localhost:9000/admin/remove_employee?p_id=${this.selectedProjectId}&emp_id=${this.selectedEmployeeId}`).subscribe({  
        next: (res) => {
          console.log('✅ Employee removed from project successfully', res);
          this.selectedEmployeeId = null;
          this.getEmployeesByProject();
          this.errorMessage = null;
        },
        error: (error) => {
          console.error('Error removing employee from project:', error);
          this.errorMessage = 'Failed to remove employee from project';
        }
      });
    }
  }

  getAssignedEmployees() {
    this.isLoading = true;
    this.http.get<Employee[]>(`http://localhost:9000/admin/view_assigned_employees`).subscribe({
      next: (res) => {
        this.assignedEmployees = res;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching assigned employees:', error);
        this.errorMessage = 'Failed to load assigned employees';
        this.isLoading = false;
      } 
    });
  }

  /**
   * Get employees assigned to a specific project
   * Called when admin clicks on a project
   */
  getEmployeesByProject() {
    if (!this.selectedProjectId) {
      this.errorMessage = 'Please select a project';
      return;
    }
    this.isLoading = true;
    this.http.get<Employee[]>(`http://localhost:9000/admin/get_employees_by_project?p_id=${this.selectedProjectId}`).subscribe({
      next: (res) => {
        this.assignedEmployees = res;
        this.showEmployeesList = true;
        this.getUnassignedEmployees();
        this.errorMessage = null;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching project employees:', error);
        this.errorMessage = 'Failed to load project employees';
        this.isLoading = false;
      }
    });
  }

  /**
   * Get employees NOT assigned to a specific project
   * Used for the add employee dropdown
   */
  getUnassignedEmployees() {
    if (!this.selectedProjectId) {
      return;
    }
    this.http.get<Employee[]>(`http://localhost:9000/admin/get_unassigned_employees?p_id=${this.selectedProjectId}`).subscribe({
      next: (res) => {
        this.unassignedEmployees = res;
      },
      error: (error) => {
        console.error('Error fetching unassigned employees:', error);
        this.unassignedEmployees = [];
      }
    });
  }

  /**
   * Add single employee to project
   */
  addEmployeeToProject(employeeId: number) {
    if (!this.selectedProjectId) {
      this.errorMessage = 'Please select a project';
      return;
    }
    this.http.put('http://localhost:9000/admin/assign_projects', {
      p_id: this.selectedProjectId,
      emp_ids: [employeeId]
    }).subscribe({
      next: (res) => {
        console.log('✅ Employee added to project successfully', res);
        this.successMessage = 'Employee added successfully';
        this.getEmployeesByProject();
        this.errorMessage = null;
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (error) => {
        console.error('Error adding employee:', error);
        this.errorMessage = 'Failed to add employee to project';
      }
    });
  }

  assignEmployeesToProject() {
    if (!this.selectedProjectId || this.selectedEmployeesForAssignment.length === 0) {
      this.errorMessage = 'Please select a project and at least one employee';
      return;
    }
    this.isLoading = true;
    this.http.put('http://localhost:9000/admin/assign_projects', {
      p_id: this.selectedProjectId,
      emp_ids: this.selectedEmployeesForAssignment
    }).subscribe({
      next: (res) => {
        console.log('✅ Employees assigned to project successfully', res);
        this.selectedEmployeesForAssignment = [];
        this.getAssignedEmployees();
        this.errorMessage = null;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error assigning employees:', error);
        this.errorMessage = 'Failed to assign employees to project';
        this.isLoading = false;
      }
    });
  }

  // ===== EMPLOYEE FUNCTIONS =====

  updateProjectStatus() {
    if (!this.selectedProjectId || !this.selectedStatus) {
      this.errorMessage = 'Please select a project and status';
      return;
    }
    this.isLoading = true;
    this.http.put('http://localhost:9000/employee/update_project_status', {
      p_id: this.selectedProjectId,
      status: this.selectedStatus
    }).subscribe({
      next: (res) => {
        console.log('✅ Project status updated successfully', res);
        this.selectedProjectId = null;
        this.selectedStatus = 'active';
        this.viewAssignedProjects();
        this.errorMessage = null;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error updating project status:', error);
        this.errorMessage = 'Failed to update project status';
        this.isLoading = false;
      }
    });
  }

  viewAssignedProjects() {
    this.isLoading = true;
    this.http.get<Projects[]>('http://localhost:9000/employee/assigned_projects').subscribe({
      next: (res) => {
        this.projects = res;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching assigned projects:', error);
        this.errorMessage = 'Failed to load assigned projects';
        this.isLoading = false;
      }
    });
  }

  /**
   * Get employees assigned to a project (employee view)
   */
  getProjectEmployeesAsEmployee() {
    if (!this.selectedProjectId) {
      this.errorMessage = 'Please select a project';
      return;
    }
    this.isLoading = true;
    this.http.get<Employee[]>(`http://localhost:9000/employee/get_employees_by_project?p_id=${this.selectedProjectId}`).subscribe({
      next: (res) => {
        this.assignedEmployees = res;
        this.showEmployeesList = true;
        this.errorMessage = null;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching project employees:', error);
        this.errorMessage = 'Failed to load project employees';
        this.isLoading = false;
      }
    });
  }

  /**
   * Close the employees list and go back to projects
   */
  closeEmployeesList() {
    this.showEmployeesList = false;
    this.showAddEmployeeDropdown = false;
    this.selectedProjectId = null;
    this.selectedEmployeeId = null;
  }
}