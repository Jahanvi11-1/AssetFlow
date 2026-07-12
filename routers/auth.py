from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
import models
import schemas

router = APIRouter(prefix="", tags=["Authentication & Directory"])

SECRET_KEY = "assetflow-super-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 43200  # 30 days for easy local testing

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login-form")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> models.Employee:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(
        select(models.Employee).where(models.Employee.email == token_data.email)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

async def get_admin_user(user: models.Employee = Depends(get_current_user)) -> models.Employee:
    if user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation restricted to ADMIN users only"
        )
    return user

def verify_manager_or_admin(user: models.Employee):
    if user.role not in ["ADMIN", "ASSET_MANAGER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation restricted to ADMIN or ASSET_MANAGER roles"
        )

# ==========================================
# Authentication & Employee Endpoints
# ==========================================

@router.post("/auth/register", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def register(employee: schemas.EmployeeCreate, db: AsyncSession = Depends(get_db)):
    # Check if email already exists
    existing = await db.execute(
        select(models.Employee).where(models.Employee.email == employee.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if department exists if provided
    if employee.department_id:
        dept_check = await db.execute(
            select(models.Department).where(models.Department.id == employee.department_id)
        )
        if not dept_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Department with ID {employee.department_id} not found"
            )
            
    # Forcing EMPLOYEE role by default
    hashed_pwd = get_password_hash(employee.password)
    db_employee = models.Employee(
        name=employee.name,
        email=employee.email,
        password_hash=hashed_pwd,
        department_id=employee.department_id,
        role="EMPLOYEE",
        status="ACTIVE"
    )
    
    db.add(db_employee)
    await db.commit()
    await db.refresh(db_employee)
    return db_employee


@router.post("/auth/login", response_model=schemas.Token)
async def login(credentials: schemas.LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Employee).where(models.Employee.email == credentials.email)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    if user.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee account is inactive"
        )
    
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "id": user.id}
    )
    return {"access_token": access_token, "token_type": "bearer"}


from fastapi.security import OAuth2PasswordRequestForm
@router.post("/auth/login-form", response_model=schemas.Token, include_in_schema=False)
async def login_form(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Employee).where(models.Employee.email == form_data.username)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "id": user.id}
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/auth/me", response_model=schemas.EmployeeResponse)
async def get_me(current_user: models.Employee = Depends(get_current_user)):
    return current_user


@router.get("/employees", response_model=List[schemas.EmployeeResponse])
async def list_employees(db: AsyncSession = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    result = await db.execute(select(models.Employee))
    return result.scalars().all()


@router.post("/employees", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    employee: schemas.EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    admin: models.Employee = Depends(get_admin_user)
):
    # Check duplicate email
    existing = await db.execute(
        select(models.Employee).where(models.Employee.email == employee.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check department if provided
    if employee.department_id:
        dept_check = await db.execute(
            select(models.Department).where(models.Department.id == employee.department_id)
        )
        if not dept_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Department with ID {employee.department_id} not found"
            )
            
    # Map role input to database values (STAFF -> EMPLOYEE, MANAGER -> ASSET_MANAGER)
    db_role = employee.role
    if db_role == "STAFF":
        db_role = "EMPLOYEE"
    elif db_role == "MANAGER":
        db_role = "ASSET_MANAGER"
        
    if db_role not in ["ADMIN", "ASSET_MANAGER", "DEPARTMENT_HEAD", "EMPLOYEE"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role value"
        )
        
    hashed_pwd = get_password_hash(employee.password)
    db_employee = models.Employee(
        name=employee.name,
        email=employee.email,
        password_hash=hashed_pwd,
        department_id=employee.department_id,
        role=db_role,
        status="ACTIVE"
    )
    
    db.add(db_employee)
    await db.commit()
    await db.refresh(db_employee)
    
    # Log audit event
    audit_log = models.SystemAuditLog(
        employee_id=admin.id,
        action="CREATE_EMPLOYEE",
        entity_name="Employee",
        entity_id=db_employee.id,
        new_values=schemas.EmployeeResponse.model_validate(db_employee).model_dump(mode="json")
    )
    db.add(audit_log)
    await db.commit()
    
    return db_employee


@router.put("/employees/{id}/role", response_model=schemas.EmployeeResponse)
async def update_employee_role(
    id: int, 
    role: str, 
    db: AsyncSession = Depends(get_db), 
    admin: models.Employee = Depends(get_admin_user)
):
    if role not in ["ADMIN", "ASSET_MANAGER", "DEPARTMENT_HEAD", "EMPLOYEE"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role value"
        )
    
    result = await db.execute(
        select(models.Employee).where(models.Employee.id == id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    # Audit logging
    old_role = employee.role
    employee.role = role
    await db.commit()
    await db.refresh(employee)
    
    # Log audit event
    audit_log = models.SystemAuditLog(
        employee_id=admin.id,
        action="PROMOTE_EMPLOYEE",
        entity_name="Employee",
        entity_id=employee.id,
        old_values={"role": old_role},
        new_values={"role": role}
    )
    db.add(audit_log)
    await db.commit()
    
    return employee

# ==========================================
# Department Setup & Management (Admin Only)
# ==========================================

@router.get("/departments", response_model=List[schemas.DepartmentResponse])
async def list_departments(db: AsyncSession = Depends(get_db), current_user: models.Employee = Depends(get_current_user)):
    result = await db.execute(select(models.Department))
    return result.scalars().all()


@router.post("/departments", response_model=schemas.DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    dept: schemas.DepartmentCreate, 
    db: AsyncSession = Depends(get_db), 
    admin: models.Employee = Depends(get_admin_user)
):
    # Check if department name already exists
    existing = await db.execute(
        select(models.Department).where(models.Department.name == dept.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department name already exists"
        )
    
    # Parent department check
    if dept.parent_department_id:
        parent_check = await db.execute(
            select(models.Department).where(models.Department.id == dept.parent_department_id)
        )
        if not parent_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent department with ID {dept.parent_department_id} not found"
            )
            
    # Department head check
    if dept.department_head_id:
        head_check = await db.execute(
            select(models.Employee).where(models.Employee.id == dept.department_head_id)
        )
        if not head_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with ID {dept.department_head_id} not found for department head"
            )

    db_dept = models.Department(
        name=dept.name,
        parent_department_id=dept.parent_department_id,
        department_head_id=dept.department_head_id,
        status="ACTIVE"
    )
    
    db.add(db_dept)
    await db.commit()
    await db.refresh(db_dept)
    return db_dept


@router.put("/departments/{id}", response_model=schemas.DepartmentResponse)
async def update_department(
    id: int, 
    dept: schemas.DepartmentCreate, 
    db: AsyncSession = Depends(get_db), 
    admin: models.Employee = Depends(get_admin_user)
):
    result = await db.execute(
        select(models.Department).where(models.Department.id == id)
    )
    db_dept = result.scalar_one_or_none()
    if not db_dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
        
    db_dept.name = dept.name
    db_dept.parent_department_id = dept.parent_department_id
    db_dept.department_head_id = dept.department_head_id
    await db.commit()
    await db.refresh(db_dept)
    return db_dept


@router.put("/departments/{id}/head", response_model=schemas.DepartmentResponse)
async def assign_department_head(
    id: int, 
    employee_id: int, 
    db: AsyncSession = Depends(get_db), 
    admin: models.Employee = Depends(get_admin_user)
):
    # Fetch department
    result_dept = await db.execute(
        select(models.Department).where(models.Department.id == id)
    )
    db_dept = result_dept.scalar_one_or_none()
    if not db_dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
        
    # Fetch employee
    result_emp = await db.execute(
        select(models.Employee).where(models.Employee.id == employee_id)
    )
    db_employee = result_emp.scalar_one_or_none()
    if not db_employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
        
    # Update department head
    db_dept.department_head_id = employee_id
    
    # Update employee's role to DEPARTMENT_HEAD
    db_employee.role = "DEPARTMENT_HEAD"
    
    await db.commit()
    await db.refresh(db_dept)
    await db.refresh(db_employee)
    
    # Audit log
    audit_log = models.SystemAuditLog(
        employee_id=admin.id,
        action="ASSIGN_DEPARTMENT_HEAD",
        entity_name="Department",
        entity_id=db_dept.id,
        new_values={"head_employee_id": employee_id}
    )
    db.add(audit_log)
    await db.commit()
    
    return db_dept
