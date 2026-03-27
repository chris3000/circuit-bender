# Node Version Requirement

## Required Node Version: 18.0.0 or higher

This project requires **Node.js 18.0.0 or higher** to run tests and development tools.

### Why?

The project uses the following tools that require Node 18+:
- **Vite 5.x**: Requires Node ^18.0.0 || >=20.0.0
- **Vitest 1.x**: Requires Node ^18.0.0 || >=20.0.0
- **nanoid 5.x**: Requires Node ^18 || >=20
- **Rollup 4.x**: Requires Node >=18.0.0

### Current Environment Issue

The current Node version (16.16.0) causes a crypto compatibility error:
```
TypeError: crypto$2.getRandomValues is not a function
```

This prevents Vite and Vitest from running.

### Solution

Upgrade Node.js to version 18 or higher:

```bash
# Using nvm
nvm install 18
nvm use 18

# Or download from https://nodejs.org/
```

### Verification

After upgrading, verify with:
```bash
node --version  # Should show v18.x.x or higher
npm test        # Tests should now run
```
