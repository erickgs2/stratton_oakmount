import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { UsersComponent } from './users.component';
import { UserService } from '../core/services/user.service';
import { ManagedUser } from '../core/models/user.model';

describe('UsersComponent', () => {
  let component: UsersComponent;
  let fixture: ComponentFixture<UsersComponent>;
  let userServiceStub: {
    list: jasmine.Spy; create: jasmine.Spy; update: jasmine.Spy; resetPassword: jasmine.Spy; delete: jasmine.Spy;
  };

  const USERS: ManagedUser[] = [
    { id: 'u1', email: 'admin@example.com', canEditConfig: true, canManualTrade: true, createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  beforeEach(async () => {
    userServiceStub = {
      list: jasmine.createSpy('list').and.returnValue(of(USERS)),
      create: jasmine.createSpy('create').and.returnValue(of(USERS[0])),
      update: jasmine.createSpy('update').and.returnValue(of(USERS[0])),
      resetPassword: jasmine.createSpy('resetPassword').and.returnValue(of(undefined)),
      delete: jasmine.createSpy('delete').and.returnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [{ provide: UserService, useValue: userServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
  });

  it('loads users on init', () => {
    fixture.detectChanges();
    expect(userServiceStub.list).toHaveBeenCalled();
    expect(component.users.length).toBe(1);
  });

  it('creates a user via the service and reloads the list', () => {
    fixture.detectChanges();
    component.newUser = { email: 'new@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false };
    component.createUser();
    expect(userServiceStub.create).toHaveBeenCalledWith(component.newUser);
    expect(userServiceStub.list).toHaveBeenCalledTimes(2);
  });

  it('surfaces a backend error message on create failure', () => {
    userServiceStub.create.and.returnValue(
      throwError(() => ({ error: { error: 'a user with this email already exists' } })),
    );
    fixture.detectChanges();
    component.newUser = { email: 'dup@example.com', password: 'longenough', canEditConfig: false, canManualTrade: false };
    component.createUser();
    expect(component.errorMessage).toBe('a user with this email already exists');
  });

  it('deletes a user via the service and reloads the list', () => {
    fixture.detectChanges();
    component.deleteUser('u1');
    expect(userServiceStub.delete).toHaveBeenCalledWith('u1');
    expect(userServiceStub.list).toHaveBeenCalledTimes(2);
  });
});
