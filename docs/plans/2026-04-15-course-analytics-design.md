# Course Analytics and Early Warning System Design

## Overview
Transform the DeepTutor Course Assistant from a generic AI tutor into a University-grade instructional tool. This system analyzes student interactions and exam performances to provide actionable insights for instructors and timely interventions for students.

## Architecture & Data Flow

1. **Event Sourcing (Micro-tracking)**
   - Utilize existing `stream_bus.py`.
   - Track micro-interactions whenever a student uses the AI Tutor, reads documents, or takes an exam.
   - **Metrics tracked:** `student_id`, `topic_id`, `time_spent`, `message_count`, and an AI-calculated `confusion_level` (1-10 scoring by LLM analyzing chat sentiment and logic gaps).

2. **Aggregator Engine (Batch Processing)**
   - A nightly background job (worker) processes the raw interaction logs of the class.
   - Applies LLM Map-Reduce to detect patterns.
   - Extracts insights like: "30% of the class is stuck on C++ Pointers in Chapter 4."

3. **Early Warning Tiers (Risk Level Triggers)**
   - **Yellow Tier (Warning):** Declining quiz scores or an abnormally high repetition of questions on the same fundamental topic.
   - **Red Tier (Critical):** Lack of AI interaction for 14 days or >80% failure rate on core assignments. Triggers immediate email/dashboard alerts to the Instructor.

## UI Components & User Flow

### 1. Professor Dashboard (Instructor View)
- **Class Overview:** Heatmap of weekly engagement. Prominently displays an "At-Risk Students" list based on Red/Yellow tiers.
- **Topic Analysis (Bottlenecks):** Instead of raw grades, lists topics with highest failure rates, accompanied by LLM-generated plain-text summaries explaining *why* students are failing.
- **Quick Interventions:** An "[AI] Generate Recovery Quiz/Plan" button. This links to the existing Exam Generator to instantly push customized remedial plans to struggling students.

### 2. Student View (Encouragement & Recovery)
- **Personal Health Check:** Integrates with the existing Gamification UI to display their academic health gently.
- If flagged as "At-Risk", the platform overrides their default landing page with a mandatory, AI-generated **Recovery Study Plan** to bridge their knowledge gaps before advancing.

### 3. Automated Alert Luồng (Automated Alert Flow)
- Aggregator -> Flag Risk in DB -> Push real-time WebSockets to App -> Generate "Weekly Class Report" email for Instructors every Monday morning.
