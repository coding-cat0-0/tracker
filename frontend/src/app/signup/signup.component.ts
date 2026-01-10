import { Component } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatSnackBar,MatSnackBarModule } from '@angular/material/snack-bar';
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule,MatSnackBarModule],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css'
})
export class SignupComponent {
name='';
username='';
email='';
password='';
showPassword=false;
constructor(private http: HttpClient, private router: Router, private snackBar : MatSnackBar){}
togglePassword() {
  this.showPassword = !this.showPassword;
}
OnPopup(message:string){
  this.snackBar.open(message,'Close',{
    duration:3000,
    horizontalPosition:'center',
    verticalPosition:'top',
    panelClass:['snackbar']
  });
}
onSubmit(){
    const usernameRegex = /^[a-z0-9_.]+$/;
    const emailRegex = /\w+@(\w+\.)?\w+\.(com)$/i;
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d!@#$%^&_*-]{4,}$/;
  
  if(!this.name || !this.username || !this.email || !this.password){
    return this.OnPopup('All fields are required!');
  }
  if(!usernameRegex.test(this.username)){
    return this.OnPopup('Username can only contain lowercase letters, numbers, dots, and underscores!');
  }
  if(!emailRegex.test(this.email)||!passwordRegex.test(this.password)){
    return this.OnPopup('Invalid email or password format!');
  }
  this.http.post('http://localhost:9000/auth/signup',{
    name:this.name,
    username:this.username,
    email:this.email,
    password:this.password
  }).subscribe({
    next:(response:any)=>{
      this.OnPopup('Signup successful!');
      this.router.navigate(['/signin']);}
    ,
    error: (error) => {
      console.log('Error response:', error.error); 
      this.OnPopup(error.error.detail);
      }
    }
  );
}
}




