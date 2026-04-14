# Vietnamese Default Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vietnamese the default UI and response language while preserving the ability to switch to English or Chinese in Settings.

**Architecture:** Add `vi` as a first-class language in frontend i18n and backend settings normalization, then enforce Vietnamese output at the LLM system-prompt layer so capability-specific code can inherit the behavior. Locale coverage starts with core UI labels and can be expanded incrementally.

**Tech Stack:** FastAPI, Pydantic, React, Next.js, i18next, Python prompt/runtime services

---
