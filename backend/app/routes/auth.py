from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.audit import record_audit_event
from app.core.db import execute, fetch_one
from app.core.security import generate_session_token, utc_now_iso, verify_password
from app.dependencies import get_current_user
from app.schemas import AuthResponse, LoginRequest, UserResponse


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    email = payload.email.strip().lower()
    user = fetch_one(
        """
        SELECT id, name, email, role, active, password_salt, password_hash
        FROM users
        WHERE email = ?
        """,
        (email,),
    )

    if not user or not verify_password(payload.password, user["password_salt"], user["password_hash"]):
        record_audit_event(
            action="login_failed",
            entity_type="auth",
            description=f"Tentativa de login invalida para {email}",
            metadata={"email": email},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais invalidas.")

    if not user["active"]:
        record_audit_event(
            action="login_blocked",
            entity_type="auth",
            description=f"Tentativa de login em usuario inativo: {email}",
            user_id=user["id"],
            user_name=user["name"],
            metadata={"email": email},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inativo.")

    token, token_hash, expires_at = generate_session_token()
    now = utc_now_iso()
    session_id = execute(
        """
        INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user["id"], token_hash, expires_at, now, now),
    )

    record_audit_event(
        action="login",
        entity_type="auth",
        description=f"Login realizado por {user['name']}",
        user_id=user["id"],
        user_name=user["name"],
        session_id=session_id,
        metadata={"email": user["email"], "role": user["role"]},
    )

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            role=user["role"],
            active=bool(user["active"]),
        ),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: dict = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user["id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        active=True,
    )


@router.post("/logout")
def logout(current_user: dict = Depends(get_current_user)) -> dict[str, str]:
    record_audit_event(
        action="logout",
        entity_type="auth",
        description=f"Logout realizado por {current_user['name']}",
        user_id=current_user["id"],
        user_name=current_user["name"],
        session_id=current_user["session_id"],
        metadata={"email": current_user["email"], "role": current_user["role"]},
    )
    execute("DELETE FROM sessions WHERE id = ?", (current_user["session_id"],))
    return {"message": "Sessao encerrada."}
