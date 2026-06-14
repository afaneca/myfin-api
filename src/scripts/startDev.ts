import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import 'dotenv/config';

const projectRoot = process.cwd();
const isWindows = process.platform === 'win32';
const dockerCommand = isWindows ? 'docker.exe' : 'docker';

const getLocalBinPath = (binaryName: string) =>
  resolve(projectRoot, 'node_modules', '.bin', isWindows ? `${binaryName}.cmd` : binaryName);

const getEnvValue = (key: string, fallback: string) => {
  const currentValue = process.env[key]?.trim();
  if (currentValue) {
    process.env[key] = currentValue;
    return currentValue;
  }

  process.env[key] = fallback;
  return fallback;
};

const dbName = getEnvValue('DB_NAME', 'myfin');
const dbHost = getEnvValue('DB_HOST', 'localhost');
const dbUser = getEnvValue('DB_USER', 'myfin');
const dbPassword = getEnvValue('DB_PW', 'myfinpassword');
const dbPort = getEnvValue('DB_PORT', '3406');

if (!process.env.LOGGING?.trim()) {
  process.env.LOGGING = 'false';
}

if (!process.env.BYPASS_SESSION_CHECK?.trim()) {
  process.env.BYPASS_SESSION_CHECK = 'false';
}

if (!process.env.ENABLE_USER_SIGNUP?.trim()) {
  process.env.ENABLE_USER_SIGNUP = 'true';
}

if (!process.env.TRUST_PROXY?.trim()) {
  process.env.TRUST_PROXY = 'false';
}

if (!process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL.includes('${')) {
  const encodedUser = encodeURIComponent(dbUser);
  const encodedPassword = encodeURIComponent(dbPassword);
  process.env.DATABASE_URL = `mysql://${encodedUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
}

const runtimeEnv = { ...process.env };

const getCommandNotFoundError = (command: string) => {
  if (command === dockerCommand) {
    return new Error('Docker Desktop is required to start the local MySQL container.');
  }

  return new Error('Project dependencies are missing. Run npm install before npm run start:dev.');
};

const runCommand = async (
  command: string,
  args: string[],
  options: { captureOutput?: boolean } = {}
) => {
  const { captureOutput = false } = options;

  return new Promise<string>((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: runtimeEnv,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        rejectCommand(getCommandNotFoundError(command));
        return;
      }

      rejectCommand(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolveCommand(stdout.trim());
        return;
      }

      rejectCommand(
        new Error(stderr.trim() || `${command} ${args.join(' ')} exited with code ${code}.`)
      );
    });
  });
};

const waitForDatabase = async (timeoutMs = 90_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const containerId = await runCommand(dockerCommand, ['compose', 'ps', '-q', 'db'], {
        captureOutput: true,
      });

      if (containerId) {
        const status = await runCommand(
          dockerCommand,
          [
            'inspect',
            '--format',
            '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
            containerId,
          ],
          { captureOutput: true }
        );

        if (status === 'healthy' || status === 'running') {
          return;
        }
      }
    } catch {
      // Keep polling until Docker reports the db container as ready.
    }

    await delay(2000);
  }

  throw new Error('Timed out waiting for the local MySQL container to become ready.');
};

const startDevServer = async () => {
  const tsxPath = getLocalBinPath('tsx');
  const child = spawn(tsxPath, ['watch', 'src/server.ts'], {
    cwd: projectRoot,
    env: runtimeEnv,
    stdio: 'inherit',
  });

  const stopChild = (signal?: NodeJS.Signals) => {
    if (child.killed) {
      return;
    }

    try {
      child.kill(signal);
    } catch {
      child.kill();
    }
  };

  process.on('SIGINT', () => stopChild('SIGINT'));
  process.on('SIGTERM', () => stopChild('SIGTERM'));

  return new Promise<void>((resolveCommand, rejectCommand) => {
    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        rejectCommand(getCommandNotFoundError(tsxPath));
        return;
      }

      rejectCommand(error);
    });

    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        resolveCommand();
        return;
      }

      rejectCommand(new Error(`The dev server exited with code ${code}.`));
    });
  });
};

const main = async () => {
  const prismaPath = getLocalBinPath('prisma');

  console.log('Starting local MySQL container...');
  await runCommand(dockerCommand, ['compose', 'up', '-d', 'db']);

  console.log('Waiting for local MySQL to become ready...');
  await waitForDatabase();

  console.log('Applying Prisma migrations...');
  await runCommand(prismaPath, ['migrate', 'deploy']);

  console.log('Starting API in watch mode...');
  await startDevServer();
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
