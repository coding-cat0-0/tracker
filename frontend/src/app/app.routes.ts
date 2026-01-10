import { Routes } from '@angular/router';
import { SignupComponent } from './signup/signup.component';
import { SigninComponent } from './signin/signin.component';
import { HomeComponent } from './home/home.component';
import { ActivityComponent } from './feature/activity/activity.component';
import { TimesheetsComponent } from './feature/timesheets/timesheets.component';
import { ReportsComponent } from './feature/reports/reports.component';
import { ProjectsComponent } from './feature/projects/projects.component';


export const routes: Routes = [
    {path: '', redirectTo:'/home', pathMatch:'full' },
    {path:'home', component:HomeComponent},
    {path:'signin', component:SigninComponent},
    {path:'signup', component:SignupComponent},
    {path:'tracking', component:ActivityComponent},
    {path:'timesheets', component:TimesheetsComponent},
    {path:'applications',component:ReportsComponent},
    {path:'projects', component:ProjectsComponent},

];

