# CollabCore
> Intelligent Team Formation, Project Management & Mentorship Platform

**Team:** Pulseframe | **Competition:** CIPHER 2.0 | **Scenario 3:** Student Project Team Formation & Task Allocation

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Proposed Solution](#proposed-solution)
- [Core Modules](#core-modules)
- [Dashboards](#dashboards)
- [Algorithmic Approach](#algorithmic-approach)
- [Tech Stack](#tech-stack)
- [Feasibility & Scalability](#feasibility--scalability)
- [Future Enhancements](#future-enhancements)
- [Limitations](#limitations)

---

## Overview

CollabCore is an online platform for automated management of capstone projects. It covers the entire project lifecycle — from team formation to completion — by unifying manual, fragmented processes into one intelligent, data-driven system.

---

## Problem Statement

Capstone projects are a vital part of university education, but managing them at scale is inefficient. Faculty spend significant time coordinating teams via spreadsheets and email, leading to recurring issues:

| # | Problem | Impact |
|---|---------|--------|
| 1 | **Skill Mismatch** | Duplicate roles; missing testers, designers, or PMs |
| 2 | **Unfair Workload Distribution** | Some members overwhelmed, others underperforming |
| 3 | **Missing Critical Skills** | Teams lack QA, UI/UX, or database expertise |
| 4 | **Duplicate Project Selection** | Multiple groups choose the same topic, requiring manual intervention |
| 5 | **Incompatible Schedules** | Part-time work and varied timetables make collaboration difficult |
| 6 | **Lack of Visibility** | Faculty have no real-time view of progress, contributions, or risks |

---

## Proposed Solution

CollabCore automates and streamlines every stage of the capstone project process for three user types:

### Students
- Personalised dashboard to track assignments and projects
- Kanban task board, milestone tracker, and team analytics
- Submit deliverables and receive mentor feedback and grades

### Coordinators
- Create and evaluate team structures
- Override system-generated suggestions when needed
- Access analytics dashboards for program-wide oversight

### Mentors
- View full project details and student profiles
- Provide written feedback, assign grades, and raise risk flags
- Generate progress reports for assigned teams

---

## Core Modules

### 1. Student Profiling Module
Collects technical skills, soft skills, preferred roles, availability, and project interests into structured, normalised profiles stored at registration.

### 2. Smart Team Formation Engine
Builds optimal teams across seven steps using skill diversity, desired roles, compatibility scores, availability, and team size constraints.

### 3. Role Assignment Automation Tool
Maps skills to roles algorithmically:

| Skill Set | Assigned Role |
|-----------|---------------|
| Leadership & Communication | Project Manager |
| Programming & Architecture | Software Developer |
| Visual & Interaction Design | UI/UX Designer |
| Testing & Quality Assurance | QA Tester |
| Requirements & Analysis | Business Analyst |

### 4. Project Allocation Intelligence
Assigns projects using ranking-based matching. Each team-project combination is scored and conflicts are resolved automatically based on team scores.

**Scoring weights:** Skill Match 60% · Preference 30% · Fairness 10%

### 5. Intelligent Task Allocation
Tasks are assigned based on four weighted criteria: skill match, workload, availability, and urgency — tracking the full pipeline from assignment through to completion.

### 6. Continuous Conflict Detection & Resolution
The system monitors all active teams and projects in real time, triggering automated resolution workflows and notifying relevant stakeholders when conflicts arise.

### 7. Analytics & Reporting Engine
Powers all dashboards with live data including task completion rates, workload distribution maps, skill gap alerts, and risk indicators.

---

## Dashboards

CollabCore features two role-specific dashboards sharing a common backend but tailored interfaces:

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

---

## Algorithmic Approach

```
Student Profile Data
        ↓
Normalised Skill Vectors
        ↓
Smart Team Formation Engine (7 steps)
        ↓
Role Assignment (skill-to-role mapping)
        ↓
Project Allocation (ranking-based matching)
        ↓
Task Assignment (skill + workload + availability + urgency)
        ↓
Conflict Detection & Auto-Resolution
        ↓
Mentor Evaluation (4-parameter scoring → performance report cards)
```

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React, Next.js | Server-side rendering, fast SPA, component reuse |
| **Backend** | Node.js, Spring Boot | Microservice-ready, high concurrency, enterprise-grade |
| **Database** | MongoDB | Flexible schema for varied student/project profiles; JSON-native; horizontal scaling |
| **Auth & Security** | Firebase Authentication | Free tier covers student-scale usage; role-based access; GDPR-ready |

---

## Feasibility & Scalability

### Practical Feasibility
- Uses data already collected during student enrolment — no new setup required
- Minimal training needed for administrators and students
- Estimated **70% reduction** in administrative costs vs. email/spreadsheet workflows
- Faculty can override automated decisions at any stage

### Scalability

| Current Scope | Future Scope |
|---------------|-------------|
| Hundreds of students per semester | Thousands of students across multiple faculties |
| Multiple simultaneous projects | Multi-campus deployment via shared cloud |
| Single faculty/module deployment | Horizontal scaling with containerisation |
| Relational DB sufficient at this scale | Microservice architecture for independent module scaling |

---

## Future Enhancements

- **AI-Based Team Optimisation** — Predict successful team combinations using historical performance data and ML models
- **Personality Compatibility** — Psychometric analysis to improve collaboration outcomes
- **Predictive Risk Detection** — Flag struggling teams early via NLP sentiment analysis on activity logs
- **LMS Integration** — Seamless connection with Moodle, Canvas, and other academic platforms

---

## Limitations

- Efficacy relies on the accuracy of self-reported skill data
- Soft skills (communication, leadership) are difficult to quantify objectively
- Not all project preference requests may be fulfilled due to availability constraints
- Faculty approval workflows may introduce delays when overriding system decisions

---

## Conclusion

CollabCore provides an intelligent, scalable, and practical solution covering the full capstone project lifecycle — from team formation and role assignment through task management, mentorship, and performance evaluation. By automating manual processes and surfacing real-time insights through purpose-built dashboards, it enables universities to run more effective capstone programs while scaling to support larger student cohorts and additional faculties over time.
