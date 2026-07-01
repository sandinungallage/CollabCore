"""
main.py
────────
CollabCore ML Microservice — FastAPI application.

Endpoints:
  POST /predict/team-quality        → Team Good/At-Risk prediction
  POST /predict/task-assignment     → Student ranking for a task
  POST /predict/risk                → Early risk detection
  GET  /health                      → Service health + model status
  GET  /models/info                 → Model metadata & metrics

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# Import our prediction module
from model.predict import (
    registry,
    predict_team_quality,
    predict_task_assignment,
    predict_risk,
)

BASE_DIR = Path(__file__).resolve().parent
SAVE_DIR = BASE_DIR / "model" / "saved"
START_TIME = time.time()


# ─── Lifespan: load models at startup ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        registry.load()
    except Exception as e:
        print(f"⚠  Models not yet trained. Run model/train.py first.\n   Error: {e}")
    yield   # app runs here
    print("CollabCore ML — shutdown")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CollabCore ML Microservice",
    description="AI-powered team quality, task assignment, and risk prediction for CollabCore.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *([os.getenv("FRONTEND_URL")] if os.getenv("FRONTEND_URL") else []),
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class SkillEntry(BaseModel):
    name:  str
    level: int = Field(ge=0, le=5)

class MemberProfile(BaseModel):
    model_config = {
        "populate_by_name": True
    }
    id:           Optional[str] = Field(default=None, alias="_id")
    name:         Optional[str] = "Unknown"
    role:         Optional[str] = ""
    skills:       list[SkillEntry] = []
    taskCount:    int = 0
    availability: float = Field(default=0.7, ge=0.0, le=1.0)

class RequiredSkill(BaseModel):
    name:     str
    minLevel: int = Field(default=3, ge=0, le=5)

class TaskData(BaseModel):
    requiredSkills: list[RequiredSkill] = []
    urgency:        int = Field(default=3, ge=1, le=5)

class ExtraContext(BaseModel):
    days_since_last_commit:    Optional[int]   = None
    missed_milestones:         Optional[int]   = None
    avg_response_time_hours:   Optional[float] = None

# ── Request bodies ──────────────────────────────────────────────────────────

class TeamQualityRequest(BaseModel):
    members:              list[MemberProfile]
    availability_overlap: float = Field(default=0.7, ge=0.0, le=1.0)

    @field_validator("members")
    @classmethod
    def at_least_two_members(cls, v):
        if len(v) < 2:
            raise ValueError("A team must have at least 2 members")
        return v

class TaskAssignmentRequest(BaseModel):
    students: list[MemberProfile]
    task:     TaskData

    @field_validator("students")
    @classmethod
    def at_least_one_student(cls, v):
        if len(v) < 1:
            raise ValueError("At least one student required")
        return v

class RiskRequest(BaseModel):
    members:              list[MemberProfile]
    availability_overlap: float        = Field(default=0.7, ge=0.0, le=1.0)
    extra_context:        Optional[ExtraContext] = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    uptime = round(time.time() - START_TIME, 1)
    return {
        "status":        "ok" if registry.is_ready() else "degraded",
        "models_loaded": registry.is_ready(),
        "uptime_seconds": uptime,
        "message": "Ready" if registry.is_ready() else "Run model/train.py to train models first",
    }


@app.get("/models/info")
def models_info():
    """Return training metrics for all models."""
    metrics_path = SAVE_DIR / "metrics_report.json"
    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="metrics_report.json not found. Train models first.")
    with metrics_path.open() as f:
        return json.load(f)


@app.post("/predict/team-quality")
def team_quality(req: TeamQualityRequest):
    """
    Predict whether a team composition is likely to succeed.

    Returns:
    - score: 0-100 (higher = better)
    - label: "Good" | "At Risk"
    - confidence: 0-1 (how certain the model is)
    """
    if not registry.is_ready():
        raise HTTPException(status_code=503, detail="Models not loaded. Train first.")

    members_dicts = [m.model_dump(by_alias=True) for m in req.members]
    result = predict_team_quality(members_dicts, req.availability_overlap)
    return result


@app.post("/predict/task-assignment")
def task_assignment(req: TaskAssignmentRequest):
    """
    Rank students for a given task based on skill match and workload.

    Returns a ranked list of students with recommendation labels.
    """
    if not registry.is_ready():
        raise HTTPException(status_code=503, detail="Models not loaded. Train first.")

    students_dicts = [s.model_dump(by_alias=True) for s in req.students]
    task_dict      = req.task.model_dump()
    result = predict_task_assignment(students_dicts, task_dict)
    return result


@app.post("/predict/risk")
def risk_detection(req: RiskRequest):
    """
    Early risk detection for a team.

    Returns:
    - risk_level: "Low" | "Medium" | "High"
    - risk_score: 0-100
    - flags: list of specific risk reasons
    """
    if not registry.is_ready():
        raise HTTPException(status_code=503, detail="Models not loaded. Train first.")

    members_dicts = [m.model_dump(by_alias=True) for m in req.members]
    extra         = req.extra_context.model_dump() if req.extra_context else None
    result        = predict_risk(members_dicts, req.availability_overlap, extra)
    return result


# ─── Request logging middleware ────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    ms = round((time.time() - t0) * 1000, 1)
    print(f"  {request.method} {request.url.path} → {response.status_code} ({ms}ms)")
    return response
