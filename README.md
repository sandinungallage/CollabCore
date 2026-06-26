# CollabCore

> Intelligent Team Formation, Project Management & Mentorship Platform

**Team:** Pulseframe · **Competition:** CIPHER 2.0 · **Scenario 3:** Student Project Team Formation & Task Allocation

---

## What is CollabCore?

CollabCore is a web platform that automates the full lifecycle of university capstone projects — from team formation and role assignment through task management, mentorship, and performance evaluation. It replaces fragmented spreadsheet and email workflows with a single, data-driven system built for coordinators, students, and mentors.

---

## The Problem

Managing capstone projects at scale is painful for faculty. Six recurring issues drive the need for a platform like this:

| # | Problem | Impact |
|---|---------|--------|
| 1 | Skill mismatch | Duplicate roles; missing testers, designers, or PMs |
| 2 | Unfair workload distribution | Some members overwhelmed, others underperforming |
| 3 | Missing critical skills | Teams lack QA, UI/UX, or database expertise |
| 4 | Duplicate project selection | Multiple groups choose the same topic |
| 5 | Incompatible schedules | Part-time work and varied timetables block collaboration |
| 6 | Lack of visibility | Faculty have no real-time view of progress or risks |

---

## Core Modules

### 1. Student Profiling
Collects technical skills, soft skills, preferred roles, availability, and project interests into structured, normalised profiles at registration.

### 2. Smart Team Formation Engine
Builds optimal teams across seven steps using skill diversity, desired roles, compatibility scores, availability, and team size constraints.

### 3. Role Assignment
Maps student skill sets to one of five core roles algorithmically:

| Skill Set | Role |
|-----------|------|
| Leadership & communication | Project Manager |
| Programming & architecture | Software Developer |
| Visual & interaction design | UI/UX Designer |
| Testing & quality assurance | QA Tester |
| Requirements & analysis | Business Analyst |

### 4. Project Allocation
Assigns projects using ranking-based matching. Each team–project pair is scored and conflicts are resolved automatically.

**Scoring weights:** Skill match 60% · Preference 30% · Fairness 10%

### 5. Intelligent Task Allocation
Assigns tasks based on four weighted criteria — skill match, workload, availability, and urgency — tracking the full pipeline from assignment through to completion.

### 6. ML-Powered Team Quality & Task Suitability

**Team quality classification (XGBoost)** — When a team is formed, member profiles are aggregated into a feature vector and passed through a pre-trained XGBoost model. The model evaluates four dimensions:

- Skill diversity — unique skills at intermediate proficiency or above
- Role coverage — how many of the five core roles are represented
- Workload balance — standard deviation of task counts across members
- Skill–role alignment — how closely skills match assigned roles

Teams scoring 0.5 or above are labelled **Good**. Those below are flagged **At Risk** and surfaced immediately on the coordinator's dashboard.

**Task suitability ranking** — Every new task triggers a ranked shortlist of eligible members scored across three factors:

- Member success probability — 50%
- Skill match bonus — 35%
- Workload penalty (capped at 0.3) — 15%

Members scoring 0.6 or above receive a **Best Fit** label. Those below appear as **Available**. Coordinators make the final assignment call.

### 7. Continuous Risk Detection
A rule-enhanced classifier runs on top of the ML model and monitors three engagement signals in real time:

- No commit in over 7 days → +15% risk
- Each missed milestone → cumulative penalty
- Average response latency over 48 hours → +10% risk

When risk is detected, the system automatically opens a conflict resolution case visible to both the assigned mentor and the coordinator.

### 8. Analytics & Reporting Engine
Powers all dashboards with live data including task completion rates, workload distribution maps, skill gap alerts, and risk indicators.

---

## Dashboards

### Student Dashboard
- Kanban task manager
- Milestone tracker
- Team performance metrics
- Deliverable submission portal
- Mentor feedback and grades viewer

### Mentor Dashboard
- Project information overview
- Student profile access
- Written feedback and grading tools
- Risk/warning flag system
- Progress report generation

### Coordinator Dashboard
- Program-wide analytics and oversight
- Team creation and evaluation tools
- Override controls for system-generated suggestions
- At-risk team alerts

---

## How It Works

```
Student profile data
        ↓
Normalised skill vectors
        ↓
Smart team formation engine (7 steps)
        ↓
Role assignment (skill-to-role mapping)
        ↓
Project allocation (ranking-based matching)
        ↓
Task assignment (skill + workload + availability + urgency)
        ↓
ML quality classification + risk detection (continuous)
        ↓
Mentor evaluation (4-parameter scoring → performance report cards)
```

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | React, Next.js | Server-side rendering, fast SPA, component reuse |
| Backend | Node.js, Spring Boot | Microservice-ready, high concurrency, enterprise-grade |
| Database | MongoDB | Flexible schema for varied profiles; JSON-native; horizontal scaling |
| Auth & Security | Firebase Authentication | Role-based access; GDPR-ready; free tier covers student-scale usage |

---

## Feasibility & Scalability

CollabCore is built to be deployable with minimal setup — it uses data already collected during student enrolment and requires no significant training for administrators or students. Estimated administrative cost reduction versus email/spreadsheet workflows is **70%**. Faculty can override automated decisions at any stage.

| Current scope | Future scope |
|---------------|--------------|
| Hundreds of students per semester | Thousands of students across multiple faculties |
| Multiple simultaneous projects | Multi-campus deployment via shared cloud |
| Single faculty/module deployment | Horizontal scaling with containerisation |

---

## Future Enhancements

- **AI team optimisation** — predict successful combinations using historical performance data
- **Personality compatibility** — psychometric analysis to improve collaboration outcomes
- **Predictive risk detection** — NLP sentiment analysis on activity logs to flag struggling teams early
- **LMS integration** — seamless connection with Moodle, Canvas, and other academic platforms

---

## Limitations

- Efficacy depends on the accuracy of self-reported skill data
- Soft skills such as communication and leadership are difficult to quantify objectively
- Not all project preference requests may be fulfilled due to availability constraints
- Faculty approval workflows may introduce delays when overriding system decisions

---

## License

This project was developed for CIPHER 2.0 by Team Pulseframe. See `LICENSE` for details.
