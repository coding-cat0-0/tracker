import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from "../services/authservice";

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [FormsModule, MatSnackBarModule,MatIconModule,],
  templateUrl: './signin.component.html',
  styleUrl: './signin.component.css'
})
export class SigninComponent {
username = '';
password = '';
showPassword=false;

constructor(private snackBar: MatSnackBar, private http : HttpClient,
private router: Router,  private authService : AuthService) {}

togglePassword() {
    this.showPassword = !this.showPassword;
  }
  openPopup(message: string) {  
     console.log("POPUP TRIGGERED:", message);
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: 'neon-snackbar'
    });
  }

onSubmit() {
  const username = this.username.trim();
  const password = this.password.trim();
  const usernameRegex = /^[a-z0-9_.]+$/;
  const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d!@#$%^&_*-]{4,}$/;

  if(!this.username || !this.password){
    return this.openPopup('Please fill in all fields.');
  }

  if(!usernameRegex.test(this.username)){
    return this.openPopup('Username can only contain lowercase letters, numbers, dots, and underscores.');

  }
  if(!passwordRegex.test(this.password)){
    return this.openPopup('Password must be at least 4 characters long and include uppercase, lowercase, and numbers.');

  }
  this.http.post('http://localhost:9000/auth/signin',{
  
    username : this.username,
    password : this.password
    }).subscribe({
     next : (response: any) => {
      const token = response.access_token;
       if(token){

        this.authService.setToken(token);
        console.log("Token saved", token)
        this.openPopup(response.message);

       } else{
        console.warn('No token generated');
       }
     },

      error : (error) => {
        console.log('Error response:', error.error);
        this.openPopup(error.error.detail);
      }
    })
  }
onClick(){
    this.router.navigate(['/signup']);
}  
}
