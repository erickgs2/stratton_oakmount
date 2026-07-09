import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserService, CreateUserPayload } from '../core/services/user.service';
import { ManagedUser } from '../core/models/user.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatCardModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
  users: ManagedUser[] = [];
  displayedColumns = ['email', 'canEditConfig', 'canManualTrade', 'createdAt', 'actions'];
  errorMessage = '';

  newUser: CreateUserPayload = { email: '', password: '', canEditConfig: false, canManualTrade: false };
  resetPasswordValue = '';
  resetPasswordTargetId: string | null = null;

  @ViewChild('createUserDialogTpl') createUserDialogTpl!: TemplateRef<unknown>;
  @ViewChild('resetPasswordDialogTpl') resetPasswordDialogTpl!: TemplateRef<unknown>;

  constructor(private userService: UserService, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.userService.list().subscribe(users => (this.users = users));
  }

  openCreateDialog(): void {
    this.errorMessage = '';
    this.newUser = { email: '', password: '', canEditConfig: false, canManualTrade: false };
    this.dialog.open(this.createUserDialogTpl, { width: '90vw', maxWidth: '420px' });
  }

  createUser(): void {
    this.userService.create(this.newUser).subscribe({
      next: () => {
        this.dialog.closeAll();
        this.loadUsers();
      },
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to create user';
      },
    });
  }

  togglePermission(user: ManagedUser, permission: 'canEditConfig' | 'canManualTrade'): void {
    this.userService.update(user.id, { [permission]: !user[permission] }).subscribe({
      next: () => this.loadUsers(),
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to update user';
      },
    });
  }

  openResetPasswordDialog(userId: string): void {
    this.errorMessage = '';
    this.resetPasswordValue = '';
    this.resetPasswordTargetId = userId;
    this.dialog.open(this.resetPasswordDialogTpl, { width: '90vw', maxWidth: '360px' });
  }

  submitResetPassword(): void {
    if (!this.resetPasswordTargetId) return;
    this.userService.resetPassword(this.resetPasswordTargetId, this.resetPasswordValue).subscribe({
      next: () => this.dialog.closeAll(),
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to reset password';
      },
    });
  }

  deleteUser(id: string): void {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    this.userService.delete(id).subscribe({
      next: () => this.loadUsers(),
      error: err => {
        this.errorMessage = err?.error?.error ?? 'Failed to delete user';
      },
    });
  }
}
