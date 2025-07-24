# Contributing Guidelines

Thank you for contributing to our projects! This guide outlines our internal workflow, code standards, and review process. Whether you're working on one project or multiple, please follow these best practices to ensure consistency and collaboration across all our repositories.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
  - [Branch Management](#branch-management)
  - [Commit Standards](#commit-standards)
- [Code Standards](#code-standards)
- [Testing and Documentation](#testing-and-documentation)
- [Reporting Issues](#reporting-issues)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Review Process](#review-process)
- [Code of Conduct](#code-of-conduct)
- [Additional Resources](#additional-resources)

---

## Getting Started

1. **Clone the Repository:**\
   Clone the repository for the project you wish to work on:

   ```bash
   git clone https://github.com/AbdullarhyTech360/Super-AI.git
   ```

2. **Switch to the Development Branch:**\
   Use the `dev` branch as your base branch for development:

   ```bash
   git checkout dev
   ```

3. **Install Dependencies:**\
   Follow the project-specific instructions provided in the README or documentation.

---

## Development Workflow

### Branch Management

- **Base Branch:**\
  Always create new branches off of the `dev` branch rather than `main` (or `master`).

- **Naming Conventions:**\
  Use the following format to name branches:

  ```
  <type>/<issue-number>-<short-description>
  ```

  **Examples:**

  - `feature/101-add-user-authentication`
  - `bugfix/102-fix-login-crash`
  - `hotfix/103-patch-security-vulnerability`
  - `chore/104-update-dependencies`

- **Branch Types:**

  | Type      | Purpose                                    | Example                           |
  | --------- | ------------------------------------------ | --------------------------------- |
  | `feature` | Adding new functionality                   | `feature/105-add-search-function` |
  | `bugfix`  | Fixing reported bugs                       | `bugfix/106-correct-typo`         |
  | `hotfix`  | Urgent fixes for production issues         | `hotfix/107-patch-critical-bug`   |
  | `chore`   | Maintenance, refactoring, or documentation | `chore/108-update-readme`         |

- **Keep Your Branch Updated:**\
  Regularly sync with the `dev` branch to avoid conflicts:

  ```bash
  git pull origin dev --rebase
  ```

### Commit Standards

- **Commit Message Format:**\
  We follow the [Conventional Commits](https://www.conventionalcommits.org/) style:

  ```
  <type>(<scope>): <description>
  ```

  **Example:**\
  `feat(auth): implement OAuth2 authentication`

- **Commit Types and Examples:**

  | Type       | Purpose                                           | Example                                           |
  | ---------- | ------------------------------------------------- | ------------------------------------------------- |
  | `feat`     | Introducing a new feature                         | `feat(profile): add profile picture upload`       |
  | `fix`      | Addressing a bug or issue                         | `fix(cart): resolve quantity update error`        |
  | `docs`     | Documentation updates                             | `docs(readme): update installation instructions`  |
  | `style`    | Code formatting changes with no functional impact | `style(ui): adjust header spacing`                |
  | `refactor` | Code restructuring without feature addition       | `refactor(auth): simplify token validation`       |
  | `test`     | Adding or updating tests                          | `test(api): add tests for user endpoints`         |
  | `chore`    | Tooling, build process, or maintenance tasks      | `chore(ci): update build scripts`                 |
  | `revert`   | Reverting a previous commit                       | `revert: Revert "feat(payment): add new gateway"` |

---

## Code Standards

- **Follow Project Conventions:**\
  Adhere to each project's established coding style and guidelines.
- **Meaningful Naming:**\
  Use clear, descriptive names for variables, functions, and classes.
- **Documentation:**\
  Add comments and inline documentation, especially for complex logic.
- **Error Handling and Security:**\
  Implement robust error handling and follow security best practices.

---

## Testing and Documentation

- **Unit and Integration Tests:**\
  Write tests for new features and bug fixes, ensuring reliable code.
- **Documentation Updates:**\
  Update relevant documentation (e.g., README, inline code comments) to reflect changes.
- **Continuous Integration:**\
  Verify that your commits pass all automated tests before creating a pull request.

---

## Creating Issues

When creating new issues or tickets, please follow these structured guidelines:

1. **Use Descriptive Titles:**\
   Create a clear, concise title following the format: `[Type]: Brief description`

   **Examples:**

   - `[Bug]: Checkout process fails on Safari browser`
   - `[Feature]: Add dark mode support`
   - `[Enhancement]: Improve search performance`

2. **Issue Types:**

   | Type            | Purpose                               |
   | --------------- | ------------------------------------- |
   | `Bug`           | Something isn't working correctly     |
   | `Feature`       | New functionality request             |
   | `Enhancement`   | Improvement to existing functionality |
   | `Documentation` | Documentation updates or corrections  |
   | `Question`      | General inquiry about the project     |

3. **Structured Description:**\
   For bugs and feature requests, include:

   - **Summary:** Brief overview of the issue
   - **Current Behavior:** What currently happens (for bugs)
   - **Expected Behavior:** What should happen
   - **Suggested Solution:** (Optional) Ideas for addressing the issue

   For documentation issues, simply describe what needs to be added, updated, or corrected without the need for current/expected behavior sections.

4. **Use Labels and Assignees:**\
   Tag your issue with appropriate labels and assign to relevant team members when applicable.

---

## Reporting Issues

When reporting issues, please follow these guidelines:

1. **Search Existing Issues:**\
   Ensure that the issue hasn’t already been reported.
2. **Use the Issue Template:**\
   Provide comprehensive details, including:
   - Clear description of the problem
   - Steps to reproduce the issue
   - Expected vs. actual behavior
   - Relevant screenshots, logs, or error messages
   - Environment details (OS, browser, etc.)

**Example Issue Summary:**

> **Title:** Bug: Crash on "Submit" during checkout\
> **Description:** The application crashes with a `NullReferenceException` when clicking the "Submit" button during checkout.\
> **Steps to Reproduce:**
>
> 1. Navigate to the checkout page.
> 2. Enter payment details.
> 3. Click "Submit".\
>    **Expected:** Order is processed.\
>    **Actual:** Application crashes.

---

## Submitting Pull Requests

### PR Best Practices

1. **Keep PRs Focused:**\
   Limit each pull request to a single feature or bug fix.

2. **Link Related Issues:**\
   Reference related issues using keywords (e.g., `Fixes #101`).

3. **Complete the PR Template:**\
   Include detailed descriptions, screenshots, and testing steps. If your commit message is detailed, you can use it as the PR description. Break down the changes into sections for clarity. If your PR is large, consider summarizing the changes in the description.

4. **Examples:**

   - **Title:** `feat(auth): implement two-factor authentication`
   - **Description:**
     > This pull request adds two-factor authentication (2FA) to improve security.\
     >
     > - Updated login flow
     > - Added 2FA verification component
     > - Updated unit tests for the auth module\
     >
     > Fixes #105

5. **Request Reviews:**\
   Tag the appropriate team members to review your changes.

---

## Review Process

- **Automated Checks:**\
  Your pull request must pass all CI/CD tests. [Coming Soon...]
- **Peer Review:**\
  At least one team member or maintainer will review your changes.
- **Address Feedback:**\
  Update your pull request based on review comments.
- **Final Merge:**\
  Only maintainers/reviewer can merge pull requests after approval. Do not merge your own PR.
- **Squash and Merge:**\
  When merging, use squash and merge to combine all branch commits into a single commit. This creates clean deployment boundaries between environments and simplifies rollbacks. Each squashed commit should represent a complete, working feature. Delete the branch after merging.
- **Merge Conflicts:**\
   Resolve any merge conflicts before merging your pull request. If you encounter conflicts, rebase your branch against the `dev` branch and resolve them locally. After resolving, push the changes to your branch.

---

## Code of Conduct

Our community values mutual respect and professionalism. Please adhere to these principles:

- **Inclusivity:**\
  Use inclusive language and respect all team members.
- **Constructive Feedback:**\
  Provide and accept feedback in a professional and supportive manner.
- **Professionalism:**\
  Maintain a courteous and collaborative environment.
- **Reporting:**\
  Report any behavior that undermines our community values to the appropriate channels.

---

## Additional Resources

- [Project README](./README.md) – Overview and setup instructions. Project subsections may have their own README files.
- [Contribution Guide](./CONTRIBUTING.md) – Detailed instructions for contributing to the project.

---

Thank you for your commitment and contributions! Your work strengthens our projects and fosters a collaborative environment across our organization. If you have any questions or need further clarification, please reach out to the team.

---
