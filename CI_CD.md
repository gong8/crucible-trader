# CI/CD Pipeline Documentation

## Overview

This project uses GitHub Actions to automatically run tests, linting, and builds on every push and pull request to the `main` branch. This ensures code quality and catches issues before they're merged.

## Workflow Configuration

The workflow is defined in `.github/workflows/test.yml` and runs the following steps:

### 1. Environment Setup

- **OS**: Ubuntu latest
- **Node.js**: v20.x
- **Package Manager**: pnpm v8

### 2. Build & Test Pipeline

The workflow executes these steps in order:

1. **Checkout Repository**: Clones the repository code
2. **Setup pnpm**: Installs pnpm package manager
3. **Setup Node.js**: Installs Node.js with caching for faster subsequent runs
4. **Install Dependencies**: Runs `pnpm install --frozen-lockfile` to ensure reproducible builds
5. **Run Linter**: Executes `pnpm run lint` to check code style and catch common issues
6. **Build Packages**: Runs `pnpm run build` to compile all TypeScript packages
7. **Run Tests**: Executes `pnpm test` to run the entire test suite (290+ tests)
8. **Test Summary**: Generates a summary visible in the GitHub Actions UI

## Triggers

The workflow automatically runs on:

- **Push to main**: Every commit pushed to the main branch
- **Pull Requests**: Every PR opened against the main branch

## Local Testing

Before pushing, you can run the same checks locally:

```bash
# Run linter
pnpm run lint

# Build all packages
pnpm run build

# Run all tests
pnpm test

# Run all checks (recommended before pushing)
pnpm run lint && pnpm run build && pnpm test
```

## Viewing Results

### In GitHub Actions UI

1. Go to your repository on GitHub
2. Click the "Actions" tab
3. Click on a specific workflow run to see details
4. Each step shows detailed logs and timing information

### Status Badges

You can add a status badge to your README.md:

```markdown
![Test Suite](https://github.com/YOUR_USERNAME/crucible-trader/actions/workflows/test.yml/badge.svg)
```

## Troubleshooting

### Failed Linter

If linting fails:

- Run `pnpm run lint` locally to see errors
- Many issues can be auto-fixed with `pnpm run lint --fix` (if configured)
- Review the reported issues and fix them manually

### Failed Build

If the build fails:

- Check TypeScript errors in the logs
- Run `pnpm run build` locally to reproduce
- Ensure all dependencies are properly installed
- Check for missing type definitions

### Failed Tests

If tests fail:

- Review the test output in the GitHub Actions logs
- Run `pnpm test` locally to reproduce
- Run specific package tests: `pnpm --filter @crucible-trader/PACKAGE test`
- Use `node --test` with the `--inspect-brk` flag for debugging

## Best Practices

### Before Committing

1. Run tests locally: `pnpm test`
2. Run linter: `pnpm run lint`
3. Build packages: `pnpm run build`
4. Fix any issues before pushing

### Pull Requests

- Ensure all CI checks pass before requesting review
- If checks fail, push fixes to the same branch
- Don't merge until all checks are green

### Branch Protection (Recommended)

Consider enabling branch protection rules on GitHub:

1. Go to Settings > Branches
2. Add rule for `main` branch
3. Enable "Require status checks to pass before merging"
4. Select the "Run Tests" check
5. Enable "Require branches to be up to date before merging"

This prevents merging code that doesn't pass tests.

## Performance

The CI pipeline typically takes 3-5 minutes to complete:

- Checkout & Setup: ~30 seconds
- Install Dependencies: ~60 seconds (with cache: ~20 seconds)
- Linting: ~10 seconds
- Build: ~60-90 seconds
- Tests: ~30-60 seconds

## Future Enhancements

Potential improvements to consider:

- Add test coverage reporting (e.g., with c8)
- Upload test artifacts for failed runs
- Add deployment steps for successful builds
- Run tests in parallel for different packages
- Add matrix testing for multiple Node.js versions
- Add performance benchmarking
- Add security scanning (e.g., npm audit)

## Maintenance

### Updating Actions

Regularly update GitHub Actions to their latest versions:

```yaml
# Check for updates at:
# - https://github.com/actions/checkout
# - https://github.com/pnpm/action-setup
# - https://github.com/actions/setup-node
```

### Updating Dependencies

Keep pnpm and Node.js versions up to date:

- Update `node-version` in the workflow file
- Update `version` for pnpm action
- Test locally before updating in CI

## Support

For issues with:

- **GitHub Actions**: Check [GitHub Actions documentation](https://docs.github.com/en/actions)
- **pnpm**: Check [pnpm documentation](https://pnpm.io)
- **Tests**: See `TESTING.md` for test documentation
- **Build**: Check individual package build scripts
