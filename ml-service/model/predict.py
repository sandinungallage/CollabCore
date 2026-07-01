"""
predict.py
──────────
Loads trained models from disk and exposes clean prediction functions.
Used by main.py (FastAPI) at runtime.

Three prediction endpoints:
  1. predict_team_quality(team_data)     → {score, label, confidence}
  2. predict_task_assignment(data)       → {ranked_students, scores}
  3. predict_risk(team_data)             → {risk_level, risk_score, flags}
"""

import os
import sys
import json

import numpy as np
import pandas as pd
import joblib

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from utils.constants import (
    SKILL_COLS, ROLE_COLS, SKILL_NAMES, ROLE_NAMES,
    TARGET_COL, SUCCESS_THRESHOLD
)

SAVE_DIR = os.path.join(os.path.dirname(__file__), "saved")


# ─── Model Loader (singleton-style, loaded once at startup) ───────────────────

class ModelRegistry:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._loaded = False
        return cls._instance

    def load(self):
        if self._loaded:
            return

        print("[ModelRegistry] Loading models from disk …")
        self.scaler  = joblib.load(f"{SAVE_DIR}/scaler.pkl")

        with open(f"{SAVE_DIR}/feature_cols.json") as f:
            self.feature_cols = json.load(f)

        self.team_quality    = joblib.load(f"{SAVE_DIR}/team_quality_classifier.pkl")
        self.task_assignment = joblib.load(f"{SAVE_DIR}/task_assignment_ranker.pkl")

        risk_payload         = joblib.load(f"{SAVE_DIR}/risk_detector.pkl")
        self.risk_detector   = risk_payload["model"]
        self.risk_features   = risk_payload["features"]

        self._loaded = True
        print("[ModelRegistry] All models loaded ✅")

    def is_ready(self) -> bool:
        return self._loaded


registry = ModelRegistry()


# ─── Feature Builders ─────────────────────────────────────────────────────────

def _skill_vector_from_members(members: list[dict]) -> dict:
    """
    Aggregate per-member skill lists into a team-level max-skill dict.
    Each member: { skills: [{name, level}, ...], role: str, taskCount: int }
    """
    skill_values = {sk: 0 for sk in SKILL_COLS}
    for member in members:
        for sk_entry in member.get("skills", []):
            name  = sk_entry.get("name", "").lower().replace(" ", "")
            level = int(sk_entry.get("level", 0))
            col   = f"skill_{name}"
            if col in skill_values:
                skill_values[col] = max(skill_values[col], level)
    return skill_values


def _role_vector_from_members(members: list[dict]) -> dict:
    role_values = {rc: 0 for rc in ROLE_COLS}
    for member in members:
        role = member.get("role", "")
        col  = f"role_{role}"
        if col in role_values:
            role_values[col] = 1
    return role_values


def _build_aggregate(members: list[dict],
                     availability_overlap: float,
                     skill_values: dict,
                     role_values: dict) -> dict:
    team_size         = len(members)
    all_levels        = list(skill_values.values())
    avg_skill_level   = float(np.mean(all_levels)) if all_levels else 0
    skill_diversity   = int(sum(1 for v in all_levels if v >= 2))
    roles_covered     = int(sum(role_values.values()))

    task_counts = [int(m.get("taskCount", 0)) for m in members]
    workload_balance_score = float(np.std(task_counts)) if task_counts else 0

    # Max skill gap — if required_skills passed in team_data, use them; else 0
    max_skill_gap = 0.0

    # Derived features (must match preprocessor.engineer_features)
    full_role_coverage  = float(roles_covered == 5)
    pm_level            = max(skill_values.get("skill_python", 0),
                              skill_values.get("skill_javascript", 0))
    core_skills_present = float(
        (skill_values.get("skill_python", 0) >= 3 or
         skill_values.get("skill_javascript", 0) >= 3) and
        skill_values.get("skill_testing", 0) >= 3 and
        skill_values.get("skill_design", 0) >= 3
    )
    high_availability   = float(availability_overlap >= 0.7)
    skill_role_alignment = (
        role_values.get("role_PM", 0)          * avg_skill_level +
        role_values.get("role_Developer", 0)   * max(skill_values.get("skill_python", 0),
                                                     skill_values.get("skill_javascript", 0),
                                                     skill_values.get("skill_nodejs", 0)) +
        role_values.get("role_Designer", 0)    * skill_values.get("skill_design", 0) +
        role_values.get("role_QA", 0)          * skill_values.get("skill_testing", 0)
    ) / 5.0

    return {
        "availability_overlap":   availability_overlap,
        "team_size":              float(team_size),
        "avg_skill_level":        round(avg_skill_level, 3),
        "skill_diversity":        float(skill_diversity),
        "roles_covered":          float(roles_covered),
        "max_skill_gap":          round(max_skill_gap, 3),
        "workload_balance_score": round(workload_balance_score, 3),
        # derived
        "full_role_coverage":     full_role_coverage,
        "core_skills_present":    core_skills_present,
        "high_availability":      high_availability,
        "skill_role_alignment":   round(skill_role_alignment, 3),
    }


def _team_to_feature_row(members: list[dict],
                          availability_overlap: float,
                          feature_cols: list[str]) -> np.ndarray:
    skill_values = _skill_vector_from_members(members)
    role_values  = _role_vector_from_members(members)
    agg          = _build_aggregate(members, availability_overlap, skill_values, role_values)

    flat = {**skill_values, **role_values, **agg}
    row  = [flat.get(col, 0.0) for col in feature_cols]
    return np.array(row, dtype="float32")


def _task_skill_match_bonus(student: dict, required: dict[str, int]) -> float:
    """
    Compute how well a student matches the required skills for a task.

    Returns a score in the 0-1 range where 1 means all required skills meet
    or exceed the requested proficiency level.
    """
    if not required:
        return 0.5

    skill_levels = {
        sk_entry.get("name", "").lower(): int(sk_entry.get("level", 0))
        for sk_entry in student.get("skills", [])
    }

    score = 0.0
    for skill_name, required_level in required.items():
        member_level = skill_levels.get(skill_name, 0)
        score += min(member_level / max(required_level, 1), 1.0)

    return round(score / len(required), 4)


# ─── 1. Team Quality Prediction ───────────────────────────────────────────────

def predict_team_quality(members: list[dict],
                          availability_overlap: float) -> dict:
    """
    Returns: { score: float (0-100), label: str, confidence: float }
    """
    registry.load()
    row     = _team_to_feature_row(members, availability_overlap, registry.feature_cols)
    row_df  = pd.DataFrame([row], columns=registry.feature_cols)
    scaled  = registry.scaler.transform(row_df)
    prob    = float(registry.team_quality.predict_proba(scaled)[0][1])
    score   = round(prob * 100, 1)
    label   = "Good" if prob >= 0.5 else "At Risk"

    # Confidence: how far from the 0.5 decision boundary
    confidence = round(abs(prob - 0.5) * 2, 3)

    return {"score": score, "label": label, "confidence": confidence}


# ─── 2. Task Assignment Ranking ───────────────────────────────────────────────

def predict_task_assignment(students: list[dict],
                             task: dict) -> dict:
    """
    Rank students for a given task.

    students: list of { _id, name, skills: [{name, level}], role, taskCount }
    task:     { requiredSkills: [{name, minLevel}], urgency: 1-5 }

    Returns: { rankings: [ {studentId, name, score, recommendation}, ... ] }
    """
    registry.load()

    rankings = []
    required = {
        rs["name"].lower(): int(rs.get("minLevel", 3))
        for rs in task.get("requiredSkills", [])
        if rs.get("name")
    }
    urgency = max(1, min(int(task.get("urgency", 3)), 5))
    urgency_bonus = (urgency - 1) / 4.0

    for student in students:
        # Build a 1-person "team" to reuse the feature pipeline, but do not
        # rely on that classifier alone for ranking. It was trained on team-level
        # labels, so the raw probability is only a weak signal here.
        pseudo_members = [student]
        avail_overlap   = float(student.get("availability", 0.7))
        row             = _team_to_feature_row(pseudo_members, avail_overlap, registry.feature_cols)
        row_df          = pd.DataFrame([row], columns=registry.feature_cols)
        scaled          = registry.scaler.transform(row_df)
        prob            = float(registry.task_assignment.predict_proba(scaled)[0][1])

        skill_match_bonus = _task_skill_match_bonus(student, required)
        availability_bonus = max(0.0, min(avail_overlap, 1.0))

        # Workload penalty
        task_count = int(student.get("taskCount", 0))
        workload_penalty = min(task_count / 10.0, 0.3)

        final_score = round(
            0.18 * prob +
            0.48 * skill_match_bonus +
            0.18 * availability_bonus +
            0.16 * urgency_bonus -
            0.12 * workload_penalty,
            4
        )

        final_score = max(0.0, min(final_score, 1.0))

        if required:
            final_score = max(final_score, min(0.95, 0.35 + 0.45 * skill_match_bonus))

        rankings.append({
            "studentId":      str(student.get("_id", "")),
            "name":           student.get("name", "Unknown"),
            "score":          final_score,
            "recommendation": "Recommended" if final_score >= 0.6 else "Available",
        })

    rankings.sort(key=lambda x: x["score"], reverse=True)
    return {"rankings": rankings}


# ─── 3. Risk Detection ────────────────────────────────────────────────────────

def predict_risk(members: list[dict],
                 availability_overlap: float,
                 extra_context: dict | None = None) -> dict:
    """
    Predict whether a team is at risk.

    extra_context: optional { days_since_last_commit: int,
                              missed_milestones: int,
                              avg_response_time_hours: float }

    Returns: { risk_level: str, risk_score: float, flags: [str] }
    """
    registry.load()

    skill_values = _skill_vector_from_members(members)
    role_values  = _role_vector_from_members(members)
    agg          = _build_aggregate(members, availability_overlap, skill_values, role_values)
    flat         = {**skill_values, **role_values, **agg}

    # Build a full feature row (all feature_cols), then slice to risk_features for the model
    full_row      = np.array([flat.get(col, 0.0) for col in registry.feature_cols], dtype="float32")
    full_row_df   = pd.DataFrame([full_row], columns=registry.feature_cols)
    full_scaled   = registry.scaler.transform(full_row_df)[0]
    risk_indices  = [registry.feature_cols.index(c) for c in registry.risk_features
                     if c in registry.feature_cols]
    scaled        = full_scaled[risk_indices].reshape(1, -1)

    # Risk model outputs P(at_risk)
    risk_prob = float(registry.risk_detector.predict_proba(scaled)[0][1])

    # Overlay heuristic flags from extra_context
    flags = []
    if extra_context:
        if extra_context.get("days_since_last_commit", 0) > 7:
            flags.append("No commits in 7+ days")
            risk_prob = min(risk_prob + 0.15, 1.0)
        if extra_context.get("missed_milestones", 0) > 0:
            flags.append(f"{extra_context['missed_milestones']} missed milestone(s)")
            risk_prob = min(risk_prob + 0.20 * extra_context["missed_milestones"], 1.0)
        if extra_context.get("avg_response_time_hours", 0) > 48:
            flags.append("High mentor response latency")
            risk_prob = min(risk_prob + 0.10, 1.0)

    if agg["roles_covered"] < 3:
        flags.append("Less than 3 roles covered")
    if agg["availability_overlap"] < 0.4:
        flags.append("Low team availability overlap")
    if agg["avg_skill_level"] < 1.5:
        flags.append("Below-average team skill level")

    risk_score = round(risk_prob * 100, 1)
    if risk_score >= 70:
        risk_level = "High"
    elif risk_score >= 40:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "flags":      flags,
    }
