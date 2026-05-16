import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Express } from 'express';
import joiToSwagger from 'joi-to-swagger';
import swaggerUi from 'swagger-ui-express';
import * as ts from 'typescript';
import { type RouteDefinition, type RouteGroup, routeGroups } from '../routes/routeDefinitions.js';

type ImportBinding =
  | {
      kind: 'default';
      moduleSpecifier: string;
    }
  | {
      kind: 'named';
      exportName: string;
      moduleSpecifier: string;
    }
  | {
      kind: 'namespace';
      moduleSpecifier: string;
    };

type StatementEntry = {
  name: string;
  node: ts.Node;
  position: number;
  text: string;
};

type HandlerAnalysis = {
  bodySchemaName?: string;
  paramsSchemaName?: string;
  querySchemaName?: string;
  requiresAuth: boolean;
  usesMobileHeader: boolean;
};

type ControllerAnalysis = {
  handlers: Map<string, HandlerAnalysis>;
  imports: Map<string, ImportBinding>;
  sourceFile: ts.SourceFile;
  statements: Map<string, StatementEntry>;
};

type RequestSchemas = {
  body?: unknown;
  params?: unknown;
  query?: unknown;
};

type SwaggerObjectSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
  type?: string;
};

const controllerAnalysisCache = new Map<string, ControllerAnalysis>();
const importedModuleCache = new Map<string, Promise<unknown>>();

const AUTH_USERNAME_SCHEME = 'authusernameHeader';
const SESSION_KEY_SCHEME = 'sessionkeyHeader';

const HEADER_MOBILE_PARAMETER = {
  description: 'Optional mobile session mode header. Use `true` for mobile sessions.',
  in: 'header',
  name: 'mobile',
  required: false,
  schema: {
    enum: ['true', 'false'],
    type: 'string',
  },
};

const COMMON_RESPONSES = {
  200: { description: 'Successful response.' },
  400: { description: 'Validation error or malformed request.' },
  401: { description: 'Authentication failed or session is invalid.' },
  500: { description: 'Internal server error.' },
};

const buildOpenApiDocument = async (version: string) => {
  const components: Record<string, Record<string, unknown>> = {
    schemas: {},
    securitySchemes: {
      [AUTH_USERNAME_SCHEME]: {
        description: 'Authenticated username header used by protected endpoints.',
        in: 'header',
        name: 'authusername',
        type: 'apiKey',
      },
      [SESSION_KEY_SCHEME]: {
        description: 'Authenticated session key header used by protected endpoints.',
        in: 'header',
        name: 'sessionkey',
        type: 'apiKey',
      },
    },
  };

  const paths: Record<string, Record<string, unknown>> = {
    '/': {
      get: {
        operationId: 'getRootInfo',
        responses: { 200: { description: 'API metadata response.' } },
        summary: 'Get API info',
        tags: ['Meta'],
      },
    },
  };

  for (const group of routeGroups) {
    const controllerPath = resolveExistingModulePath(group.controllerSourceBaseUrl);
    const analysis = getControllerAnalysis(controllerPath);

    for (const route of group.routes) {
      const handler = analysis.handlers.get(route.handlerName) || {
        requiresAuth: false,
        usesMobileHeader: false,
      };

      const schemas = await loadSchemasForHandler(analysis, controllerPath, handler);
      const fullPath = normalizeOpenApiPath(group.basePath, route.path);
      const pathItem = paths[fullPath] || {};
      paths[fullPath] = pathItem;

      const operation = buildOperation(group, route, handler, schemas, components, fullPath);
      pathItem[route.method] = operation;
    }
  }

  return {
    components,
    info: {
      title: 'MyFin API',
      version,
    },
    openapi: '3.0.3',
    paths,
    servers: [{ url: '/' }],
  };
};

const registerSwagger = (app: Express, swaggerDocument: Record<string, unknown>) => {
  const sendSwaggerDocument = (_req, res) => {
    res.json(swaggerDocument);
  };

  app.get('/swagger.json', sendSwaggerDocument);
  app.get('/docs.json', sendSwaggerDocument);

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'MyFin API Docs',
      explorer: true,
    })
  );
};

const buildOperation = (
  group: RouteGroup,
  route: RouteDefinition,
  handler: HandlerAnalysis,
  schemas: RequestSchemas,
  components: Record<string, Record<string, unknown>>,
  fullPath: string
) => {
  const parameters = [
    ...buildPathParameters(fullPath, schemas.params, components),
    ...buildQueryParameters(schemas.query, components),
  ];

  if (handler.usesMobileHeader || handler.requiresAuth) {
    parameters.push(HEADER_MOBILE_PARAMETER);
  }

  const operation: Record<string, unknown> = {
    operationId: buildOperationId(group, route),
    parameters,
    responses: COMMON_RESPONSES,
    summary: humanizeHandlerName(route.handlerName),
    tags: [group.tag],
  };

  if (schemas.body) {
    const bodySchema = convertJoiSchema(schemas.body, components);
    operation.requestBody = {
      content: {
        'application/json': { schema: bodySchema },
        'application/x-www-form-urlencoded': { schema: bodySchema },
      },
      required: true,
    };
  }

  if (handler.requiresAuth) {
    operation.security = [
      {
        [AUTH_USERNAME_SCHEME]: [],
        [SESSION_KEY_SCHEME]: [],
      },
    ];
  }

  return operation;
};

const buildOperationId = (group: RouteGroup, route: RouteDefinition) => {
  const basePath = group.basePath.replace(/^\//, '').replace(/[/:]+/g, '_');
  return `${route.method}_${basePath}_${route.handlerName}`;
};

const buildPathParameters = (
  fullPath: string,
  schema: unknown,
  components: Record<string, Record<string, unknown>>
) => {
  const parameterNames = Array.from(fullPath.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
  if (parameterNames.length === 0) {
    return [];
  }

  const swaggerSchema = schema ? convertJoiSchema(schema, components) : undefined;
  const propertyMap = toPropertyMap(swaggerSchema);

  return parameterNames.map((name) => ({
    in: 'path',
    name,
    required: true,
    schema: propertyMap[name] || { type: 'string' },
  }));
};

const buildQueryParameters = (
  schema: unknown,
  components: Record<string, Record<string, unknown>>
) => {
  if (!schema) {
    return [];
  }

  const swaggerSchema = convertJoiSchema(schema, components);
  const properties = toPropertyMap(swaggerSchema);
  const required = new Set(Array.isArray(swaggerSchema?.required) ? swaggerSchema.required : []);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    in: 'query',
    name,
    required: required.has(name),
    schema: propertySchema,
  }));
};

const toPropertyMap = (swaggerSchema: unknown): Record<string, unknown> => {
  if (!swaggerSchema || typeof swaggerSchema !== 'object') {
    return {};
  }

  const objectSchema = swaggerSchema as SwaggerObjectSchema;
  if (objectSchema.type !== 'object' || !objectSchema.properties) {
    return {};
  }

  return objectSchema.properties;
};

const convertJoiSchema = (schema: unknown, components: Record<string, Record<string, unknown>>) => {
  const converted = joiToSwagger(schema as Parameters<typeof joiToSwagger>[0]);

  if (converted.components) {
    mergeComponents(components, converted.components as Record<string, Record<string, unknown>>);
  }

  return converted.swagger;
};

const mergeComponents = (
  target: Record<string, Record<string, unknown>>,
  source: Record<string, Record<string, unknown>>
) => {
  for (const [componentType, values] of Object.entries(source)) {
    const current = target[componentType] || {};
    target[componentType] = current;
    Object.assign(current, values);
  }
};

const loadSchemasForHandler = async (
  analysis: ControllerAnalysis,
  controllerPath: string,
  handler: HandlerAnalysis
): Promise<RequestSchemas> => {
  const schemaNames = [
    handler.bodySchemaName,
    handler.paramsSchemaName,
    handler.querySchemaName,
  ].filter((schemaName): schemaName is string => Boolean(schemaName));

  if (schemaNames.length === 0) {
    return {};
  }

  const evaluatedSchemas = await evaluateSchemas(controllerPath, analysis, schemaNames);

  return {
    body: handler.bodySchemaName ? evaluatedSchemas[handler.bodySchemaName] : undefined,
    params: handler.paramsSchemaName ? evaluatedSchemas[handler.paramsSchemaName] : undefined,
    query: handler.querySchemaName ? evaluatedSchemas[handler.querySchemaName] : undefined,
  };
};

const evaluateSchemas = async (
  controllerPath: string,
  analysis: ControllerAnalysis,
  schemaNames: string[]
) => {
  const declarationNames = new Set<string>();
  const importNames = new Set<string>();
  const orderedEntries: StatementEntry[] = [];
  const seenStatementNames = new Set<string>();

  for (const schemaName of schemaNames) {
    collectDependencies(
      schemaName,
      analysis,
      declarationNames,
      importNames,
      orderedEntries,
      seenStatementNames
    );
  }

  const orderedStatements = orderedEntries.sort((left, right) => left.position - right.position);
  const bindings = await Promise.all(
    Array.from(importNames).map(
      async (name): Promise<[string, unknown]> => [
        name,
        await loadImportValue(controllerPath, analysis, name),
      ]
    )
  );

  const argumentNames = bindings.map(([name]) => name);
  const argumentValues = bindings.map(([, value]) => value);
  const evaluator = new Function(
    ...argumentNames,
    `${orderedStatements.map((statement) => statement.text).join('\n')}\nreturn { ${schemaNames.join(', ')} };`
  );

  return evaluator(...argumentValues) as Record<string, unknown>;
};

const collectDependencies = (
  name: string,
  analysis: ControllerAnalysis,
  declarationNames: Set<string>,
  importNames: Set<string>,
  orderedEntries: StatementEntry[],
  seenStatementNames: Set<string>
) => {
  if (declarationNames.has(name)) {
    return;
  }

  const entry = analysis.statements.get(name);
  if (!entry) {
    return;
  }

  declarationNames.add(name);

  for (const identifier of collectReferencedIdentifiers(entry.node)) {
    if (identifier === name) {
      continue;
    }

    if (analysis.statements.has(identifier)) {
      collectDependencies(
        identifier,
        analysis,
        declarationNames,
        importNames,
        orderedEntries,
        seenStatementNames
      );
    }

    if (analysis.imports.has(identifier)) {
      importNames.add(identifier);
    }
  }

  if (!seenStatementNames.has(entry.name)) {
    orderedEntries.push(entry);
    seenStatementNames.add(entry.name);
  }
};

const collectReferencedIdentifiers = (node: ts.Node) => {
  const identifiers = new Set<string>();

  const visit = (currentNode: ts.Node) => {
    if (ts.isIdentifier(currentNode)) {
      identifiers.add(currentNode.text);
    }

    ts.forEachChild(currentNode, visit);
  };

  visit(node);
  return identifiers;
};

const loadImportValue = async (
  controllerPath: string,
  analysis: ControllerAnalysis,
  importName: string
) => {
  const binding = analysis.imports.get(importName);
  if (!binding) {
    throw new Error(`Unable to resolve import binding "${importName}" for ${controllerPath}`);
  }

  const moduleUrl = resolveImportModuleUrl(controllerPath, binding.moduleSpecifier);
  const importedModulePromise = importedModuleCache.get(moduleUrl) || import(moduleUrl);
  importedModuleCache.set(moduleUrl, importedModulePromise);
  const importedModule = (await importedModulePromise) as Record<string, unknown>;

  if (binding.kind === 'default') {
    return importedModule.default;
  }

  if (binding.kind === 'namespace') {
    return importedModule;
  }

  return importedModule[binding.exportName];
};

const resolveImportModuleUrl = (controllerPath: string, specifier: string) => {
  if (!specifier.startsWith('.')) {
    return specifier;
  }

  const resolvedUrl = new URL(specifier, pathToFileURL(controllerPath));
  const resolvedPath = resolveExistingModulePath(resolvedUrl.href);
  return pathToFileURL(resolvedPath).href;
};

const getControllerAnalysis = (controllerPath: string) => {
  const cached = controllerAnalysisCache.get(controllerPath);
  if (cached) {
    return cached;
  }

  const sourceText = readFileSync(controllerPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    controllerPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    controllerPath.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  const imports = new Map<string, ImportBinding>();
  const localHandlers = new Map<string, HandlerAnalysis>();
  const statements = new Map<string, StatementEntry>();
  const exportedNames = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImportBindings(statement, imports);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }

        const name = declaration.name.text;
        statements.set(name, {
          name,
          node: declaration,
          position: statement.getStart(sourceFile),
          text: statement.getText(sourceFile),
        });

        if (
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          localHandlers.set(name, extractHandlerAnalysis(declaration.initializer));
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      statements.set(name, {
        name,
        node: statement,
        position: statement.getStart(sourceFile),
        text: statement.getText(sourceFile),
      });
      continue;
    }

    if (ts.isExportAssignment(statement) && ts.isObjectLiteralExpression(statement.expression)) {
      for (const property of statement.expression.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          exportedNames.set(property.name.text, property.name.text);
          continue;
        }

        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isIdentifier(property.initializer)
        ) {
          exportedNames.set(property.name.text, property.initializer.text);
        }
      }
    }
  }

  const handlers = new Map<string, HandlerAnalysis>();
  for (const [exportedName, localName] of exportedNames) {
    const localHandler = localHandlers.get(localName);
    if (localHandler) {
      handlers.set(exportedName, localHandler);
    }
  }

  const analysis = {
    handlers,
    imports,
    sourceFile,
    statements,
  };

  controllerAnalysisCache.set(controllerPath, analysis);
  return analysis;
};

const collectImportBindings = (
  statement: ts.ImportDeclaration,
  imports: Map<string, ImportBinding>
) => {
  const importClause = statement.importClause;
  if (!importClause || importClause.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) {
    return;
  }

  const moduleSpecifier = statement.moduleSpecifier.text;

  if (importClause.name) {
    imports.set(importClause.name.text, {
      kind: 'default',
      moduleSpecifier,
    });
  }

  if (!importClause.namedBindings) {
    return;
  }

  if (ts.isNamespaceImport(importClause.namedBindings)) {
    imports.set(importClause.namedBindings.name.text, {
      kind: 'namespace',
      moduleSpecifier,
    });
    return;
  }

  for (const element of importClause.namedBindings.elements) {
    if (element.isTypeOnly) {
      continue;
    }

    imports.set(element.name.text, {
      exportName: (element.propertyName || element.name).text,
      kind: 'named',
      moduleSpecifier,
    });
  }
};

const extractHandlerAnalysis = (
  handlerNode: ts.ArrowFunction | ts.FunctionExpression
): HandlerAnalysis => {
  const requestParamName = getRequestParameterName(handlerNode);
  const handlerAnalysis: HandlerAnalysis = {
    requiresAuth: false,
    usesMobileHeader: false,
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'validateAsync' &&
        ts.isIdentifier(node.expression.expression) &&
        node.arguments.length > 0 &&
        ts.isPropertyAccessExpression(node.arguments[0]) &&
        ts.isIdentifier(node.arguments[0].expression) &&
        node.arguments[0].expression.text === requestParamName
      ) {
        const target = node.arguments[0].name.text;
        if (target === 'body') {
          handlerAnalysis.bodySchemaName = node.expression.expression.text;
        }
        if (target === 'params') {
          handlerAnalysis.paramsSchemaName = node.expression.expression.text;
        }
        if (target === 'query') {
          handlerAnalysis.querySchemaName = node.expression.expression.text;
        }
      }

      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'checkAuthSessionValidity'
      ) {
        handlerAnalysis.requiresAuth = true;
      }

      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === requestParamName &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === 'mobile'
      ) {
        handlerAnalysis.usesMobileHeader = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(handlerNode.body, visit);
  return handlerAnalysis;
};

const getRequestParameterName = (handlerNode: ts.ArrowFunction | ts.FunctionExpression) => {
  const firstParameter = handlerNode.parameters[0];
  if (!firstParameter || !ts.isIdentifier(firstParameter.name)) {
    return 'req';
  }
  return firstParameter.name.text;
};

const normalizeOpenApiPath = (basePath: string, routePath: string) => {
  const combinedPath = `${basePath}${routePath}`.replace(/\/+/g, '/');
  return combinedPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
};

const humanizeHandlerName = (handlerName: string) =>
  handlerName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bTrx\b/g, 'transaction')
    .replace(/^./, (value) => value.toUpperCase());

const resolveExistingModulePath = (moduleUrlOrPath: string) => {
  const candidatePaths = new Set<string>();

  if (moduleUrlOrPath.startsWith('file:')) {
    const rawPath = fileURLToPath(moduleUrlOrPath);
    addPathCandidates(candidatePaths, rawPath);
  } else {
    addPathCandidates(candidatePaths, moduleUrlOrPath);
  }

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(`Unable to resolve source file for ${moduleUrlOrPath}`);
};

const addPathCandidates = (candidatePaths: Set<string>, rawPath: string) => {
  candidatePaths.add(rawPath);
  candidatePaths.add(`${rawPath}.ts`);
  candidatePaths.add(`${rawPath}.js`);

  if (rawPath.endsWith('.js')) {
    candidatePaths.add(rawPath.replace(/\.js$/, '.ts'));
  }

  if (rawPath.endsWith('.ts')) {
    candidatePaths.add(rawPath.replace(/\.ts$/, '.js'));
  }
};

export { buildOpenApiDocument, registerSwagger };
