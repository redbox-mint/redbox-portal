---
name: 'Web Interface Verification'
description: "This skill outlines the workflow for verifying the Redbox Portal web interface using the Agent's built-in browser capabilities and natural language test scripts."
---

# Skill: Web Interface Verification

## Context

This skill outlines the workflow for verifying the Redbox Portal web interface using the Agent's built-in browser capabilities and natural language test scripts.

## Workflow

### 1. Start the Application

Start the application in development mode with the mount profile. The `dev:run` script applies the mount profile implicitly (no extra flags required).
**Important:** Capture the `CommandId` returned by this command to monitor logs later. The `CommandId` is typically a UUID or numeric ID printed near startup; look for it before or around the "Sails lifted" readiness marker.

```bash
npm run dev:run
```

Example output (capture the value after `CommandId:`):

```text
CommandId: 9f2b5c3a-1d4e-4a6a-9e5b-0a1234567890
...Sails lifted...
```

Extract it from the logs with a one-liner (or copy the `CommandId:` line directly):

```bash
grep -m 1 "CommandId:" .tmp/logs/dev-run.log
```

Wait for the application to be ready (look for "Sails lifted").

### 2. Launch Browser

Use the `browser_subagent` tool to launch a browser session.

- **TaskName:** Web Verification
- **Task:** "Open http://localhost:1500 and [Insert Natural Language Script Here]"

### 3. Execute Natural Language Script

Follow the natural language instructions provided by the user.
**Example Script:**

1. "Login to the system."
2. "Expectation: You are navigated to `/researcher/home`."
3. "Navigate to 'My Data'."
4. "Verify the 'Create Record' button is visible."

**Agent Responsibilities:**

- translate high-level actions (e.g., "Login") into interaction steps (type username, type password, click login).
- Verify URLs and UI elements match expectations.

### 4. Monitor Logs

While the browser session is active or after a step fails, check the logs of the running application using the `command_status` tool and the captured `CommandId`.

- Look for server-side errors (500s, exceptions) that correlate with UI actions.

### 5. Report Findings

After completing the script or encountering a failure, report the results to the user.

- **Success:** Confirm all steps passed.
- **Failure:** Detail which step failed, the observed vs. expected behavior, and any relevant server logs.
