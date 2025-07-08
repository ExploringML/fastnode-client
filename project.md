# FastNode — Visual AI Workflow Builder

## Overview

**FastNode** is a web-based visual programming tool that allows users to create, connect, and run AI-powered workflows using a node-based UI (similar to ComfyUI). Users can drag, drop, and link nodes such as text inputs, LLMs, and image generation models to build generative AI pipelines. It's designed for both experimentation and production-ready prototyping.

---

## Tech Stack

- **Frontend**
  - React (with hooks)
  - [@xyflow/react](https://reactflow.dev/) (aka React Flow)
  - Tailwind CSS
  - DaisyUI (optional)
  - Custom widgets (`TextAreaField`, `ImageDisplayField`, etc.)

- **Backend**
  - Python + FastHTML server
  - OpenAI API via `openai.AsyncOpenAI`
  - WebSocket communication (`utils/ws.py`)
  - Node registration system (`core/nodes.py`)

---

## Project Structure (Key Files)

### Frontend

| File | Description |
|------|-------------|
| `App.jsx` | Main application entry, loads nodes and canvas. |
| `MetaNode.jsx` | Generic dynamic node renderer; reads `nodeRegistry` and renders appropriate widget for each param. |
| `TextReadonlyField.jsx`, `ImageDisplayField.jsx`, etc. | Input/output widgets used inside nodes. |
| `BaseNode.jsx` | Stylized container for each node; includes resize behavior. |
| `traversal.js` | Handles node execution order, dependency resolution, and edge traversal. |
| `labeled-handle.jsx` | Enhanced handles that show labels for better UX. |

### Backend

| File | Description |
|------|-------------|
| `core/nodes.py` | Central registry for server-executed nodes. |
| `utils/ws.py` | Safe WebSocket send helpers for status and progress updates. |
| `nodes/image_gen.py` | Handles OpenAI image generation via DALL·E. |
| `nodes/llm_response.py` | Handles OpenAI chat completions (LLM). |

---

## Server Node Format

Nodes are registered using `register_node()` with:
- `inputs`: named incoming fields
- `outputs`: named outgoing fields
- `params`: optionally shown in the UI
- `handler`: async Python function that processes inputs

---

## Features Implemented

### UI / UX
- [x] Resizable image output nodes (`NodeResizer`)
- [x] Image auto-scaling and padding removal
- [x] Proper memoization for image rendering (`React.memo`)
- [x] Scrollable prompt fields
- [x] Support for custom system/user prompts
- [x] LLM node chaining (Prompt → LLM → Image Gen)

### Node System
- [x] Image generation node using `gpt-image-1`
- [x] LLM response node using GPT-4 / GPT-4o
- [x] Model selectors for LLM and image nodes
- [x] Output values flattened for generic display nodes
- [x] Full progress feedback via WebSocket updates

### Workflow System
- [x] Dynamic traversal and evaluation of node chains
- [x] Frontend + server hybrid execution support
- [x] Edge validation and labeled handles
