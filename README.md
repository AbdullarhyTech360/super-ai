# Super-AI

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Overview

Super-AI is a modern AI-powered web application designed to assist with everyday tasks such as chatting, text generation, and (soon) image generation. Powered by state-of-the-art models and a clean interface, Super-AI is your productivity partner for both personal and professional use.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Contribution](#contribution)
- [Database Choice](#database-choice)
- [Support](#support)
- [About Us](#about-us)
- [License](#license)

## Features

- **Conversational AI:** Chat with AI to get answers, explanations, and ideas.
- **Text Generation:** Produce articles, summaries, code, and more.
- **Image Generation:** (Coming soon) Generate images using AI.
- **User Authentication:** Secure login and session management.
- **Enterprise-grade Security:** Built with security best practices.
- **Developer-Friendly:** Modular codebase and clear docs for contributors.

## Screenshots

**Landing Page:**

![Super-AI Landing Page](screenshot-1.jpeg)

**Chat Page:**

![Super-AI Chat Page](screenshot-2.jpeg)

## Tech Stack

- **Frontend:** [Next.js](https://nextjs.org/) (React)
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **AI Model:** Gemini (via API integration)
- **Database:** See [Database Choice](#database-choice)
- **Authentication:** (e.g., JWT, OAuth) [Specify if implemented]
- **Deployment:** [Vercel](https://vercel.com/) / [Docker](https://www.docker.com/) / [Other]

## Project Structure

```
/api
  /app
    /routers      # API endpoint modules
    /services     # Business logic
    /models       # ORM models
    /schemas      # Pydantic schemas
    /db           # DB connection and migrations
    dependencies.py # Shared dependencies (auth, DB sessions)
    main.py       # FastAPI app entrypoint
/web
  /src
    /app          # Next.js app router
    /components   # Reusable UI components
    /features     # Feature-driven modules (chat, auth, etc.)
    /lib          # API client, utilities
    /types        # Shared TypeScript types
    /hooks        # Custom React hooks
docker-compose.yml # Orchestrates backend and frontend
README.md
```

This is a monorepo: both frontend and backend are managed in a single git repository.

## Getting Started

### Prerequisites

- Node.js >= 20.x
- Python >= 3.12
- [Optional] Docker

### Frontend Setup

See [web/README.md](web/README.md) for detailed instructions.

```bash
cd web
npm install
npm run dev
```

### Backend Setup

See [api/README.md](api/README.md) for detailed instructions.

```bash
cd api
pdm install
pdm run uvicorn app.main:app --reload
```

### Using Docker Compose

To start both frontend and backend together for development:
```bash
docker-compose up --build
```
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Usage

1. Register or log in to your Super-AI account.
2. Start a new chat or continue an existing session.
3. Ask questions, generate text, or (soon) generate images.
4. Your data is securely handled throughout your session.

## Contribution

We welcome contributions from the community!

- Read the [CONTRIBUTING.md](CONTRIBUTING.md) for our contributing guidelines.
- Please follow our code of conduct (if available).
- Check open issues or start a discussion to suggest features or report bugs.

**Folder Conventions:**
- **Backend:**
  - Place new API endpoints in `api/app/routers/`
  - Core logic in `api/app/services/`
  - ORM models in `api/app/models/`
  - Pydantic schemas in `api/app/schemas/`
  - Database connection/migrations in `api/app/db/`
  - Shared dependencies in `api/app/dependencies.py`
- **Frontend:**
  - Reusable UI components in `web/src/components/`
  - Feature modules in `web/src/features/`
  - Utilities and API clients in `web/src/lib/`
  - Shared TypeScript types in `web/src/types/`
  - Custom React hooks in `web/src/hooks/`

## Database Choice

For simple projects and prototyping, **SQLite** is recommended:
- Easy to set up, no server required.
- Works out of the box with FastAPI and SQLModel/SQLAlchemy.

For scaling up or production, consider **PostgreSQL**:
- Robust, supports advanced features, handles concurrency well.

**How to switch:**  
Use an ORM (e.g., SQLAlchemy/SQLModel) and configure your database connection using environment variables. This makes future migration seamless.

| Database   | Pros                        | Cons                  | Recommended For         |
|------------|-----------------------------|-----------------------|------------------------|
| SQLite     | Simple, file-based          | Not for high traffic  | Development, prototyping|
| PostgreSQL | Scalable, robust, secure    | Needs server setup    | Production, scaling up |

## Support

For technical support, feature requests, or questions, please open an issue or contact us at [super-ai-support@example.com](#).

## About Us

Super-AI is developed by [@AbdullarhyTech360](https://github.com/AbdullarhyTech360) and contributors—a team passionate about making advanced AI easy and accessible for everyone.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

*Empowering your daily tasks with the power of AI—Super-AI Team*