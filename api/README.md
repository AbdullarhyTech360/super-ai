# FastAPI Backend

## Getting Started

1. **Before setting up the project, ensure you have Python 3.12 installed. If you don't have it, you can install it using the following command (this is for macOS only):**
   ```sh
   brew install python@3.12
   ```
   Or you can install it manually from the [Python website](https://www.python.org/downloads/release/python-3120/).

2. **Ignore this if pdm is already installed on your machine:**

   ```sh
   pip install pdm
   ```

3. **Install dependencies:**

   ```sh
   pdm install
   ```

4. **Run the development server:**
   ```sh
   pdm run uvicorn app.main:app --reload
   ```
   The API will be available at http://127.0.0.1:8000

## Project Structure

```
api/
  app/
    __init__.py
    main.py
  pyproject.toml
  pdm.lock
  .gitignore
  README.md
```

- `app/main.py`: Main FastAPI application.
- `pyproject.toml`: Project dependencies and metadata managed by PDM.
- `.gitignore`: Excludes virtual environments and cache files.

## Development

- Format code: `pdm run black .`
- Lint imports: `pdm run isort .`
- Run tests: `pdm run pytest`
