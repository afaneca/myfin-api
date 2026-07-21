const unresolvedVariablePattern = /\$\{[^}]+\}/;

const getTrimmedValue = (environment: NodeJS.ProcessEnv, name: string) => environment[name]?.trim();

const getRequiredValue = (environment: NodeJS.ProcessEnv, names: string[]) => {
  for (const name of names) {
    const value = getTrimmedValue(environment, name);
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required database configuration: ${names.join(' or ')}`);
};

const validatePort = (port: string) => {
  const numericPort = Number(port);

  if (!/^\d+$/.test(port) || numericPort < 1 || numericPort > 65535) {
    throw new Error('DB_PORT must be a number between 1 and 65535.');
  }

  return port;
};

export const resolveDatabaseUrl = (
  environment: NodeJS.ProcessEnv = process.env
): string | undefined => {
  const configuredUrl = getTrimmedValue(environment, 'DATABASE_URL');

  if (configuredUrl) {
    if (!unresolvedVariablePattern.test(configuredUrl)) {
      return configuredUrl;
    }

    const encodedVariableNames = new Set(['DB_NAME', 'DB_TABLE', 'DB_USER', 'DB_PW']);

    return configuredUrl.replace(/\$\{([A-Z0-9_]+)\}/g, (_placeholder, name: string) => {
      const value = getRequiredValue(environment, [name]);

      if (name === 'DB_PORT') {
        return validatePort(value);
      }

      return encodedVariableNames.has(name) ? encodeURIComponent(value) : value;
    });
  }

  const databaseVariableNames = ['DB_NAME', 'DB_TABLE'];
  const databaseConfigurationNames = [
    ...databaseVariableNames,
    'DB_USER',
    'DB_PW',
    'DB_HOST',
    'DB_PORT',
  ];
  const hasDatabaseConfiguration = databaseConfigurationNames.some((name) =>
    Boolean(getTrimmedValue(environment, name))
  );

  if (!hasDatabaseConfiguration) {
    return undefined;
  }

  const database = getRequiredValue(environment, databaseVariableNames);
  const user = getRequiredValue(environment, ['DB_USER']);
  const password = getRequiredValue(environment, ['DB_PW']);
  const host = getRequiredValue(environment, ['DB_HOST']);
  const port = validatePort(getTrimmedValue(environment, 'DB_PORT') || '3306');

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
};
