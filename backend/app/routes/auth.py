from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.errors import error_responses
from app.hardening import rate_limit
from app.models import User
from app.security import bearer_token, current_user
from app.services import auth

router = APIRouter(prefix="/api/v1")
Db = Annotated[Session, Depends(get_db)]


@router.post("/auth/register", response_model=schemas.AuthResponse, status_code=201, dependencies=[rate_limit("register", 10)],
             responses=error_responses("VALIDATION_ERROR", "RATE_LIMITED"))
def register(body: schemas.RegisterIn, db: Db) -> schemas.AuthResponse:
    return auth.register(db, body)


@router.post("/auth/login", response_model=schemas.AuthResponse, dependencies=[rate_limit("login", 10)],
             responses=error_responses("UNAUTHORIZED", "VALIDATION_ERROR", "RATE_LIMITED"))
def login(body: schemas.LoginIn, db: Db) -> schemas.AuthResponse:
    return auth.login(db, body)


@router.post("/auth/logout", status_code=204, responses=error_responses("UNAUTHORIZED"))
def logout(db: Db, user: Annotated[User, Depends(current_user)],
           authorization: Annotated[str | None, Header()] = None) -> Response:
    auth.logout(db, bearer_token(authorization))
    return Response(status_code=204)


@router.get("/auth/me", response_model=schemas.MeResponse, responses=error_responses("UNAUTHORIZED"))
def me(user: Annotated[User, Depends(current_user)]) -> schemas.MeResponse:
    return schemas.MeResponse(user=auth.user_out(user))
