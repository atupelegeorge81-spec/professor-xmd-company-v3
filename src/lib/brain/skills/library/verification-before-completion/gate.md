---
id: verification-before-completion/gate
title: Verification — iron law & the gate function
phases: review, observer, fix, code, objection
priority: 1
upstream: SKILL.md §Overview, §The Iron Law, §The Gate Function
---

# Verification Before Completion

## Overview

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't produced the verification evidence in this message (probe facts, full read of the current version, acceptance checks traced), you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What evidence proves this claim? (probe fact / acceptance check / code line)
2. RUN: Do the FULL check (fresh, complete — the current version, every acceptance check)
3. READ: Full output, check every result, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```
