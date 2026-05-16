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

type ResponseMethod = 'json' | 'send';

type ResponseAnalysis = {
  expression?: ts.Expression;
  method: ResponseMethod;
  statusCode: number;
};

type HandlerAnalysis = {
  bodySchemaName?: string;
  localValues: Map<string, ts.Expression>;
  paramsSchemaName?: string;
  querySchemaName?: string;
  requiresAuth: boolean;
  responses: ResponseAnalysis[];
  usesMobileHeader: boolean;
};

type ControllerAnalysis = {
  handlers: Map<string, HandlerAnalysis>;
  imports: Map<string, ImportBinding>;
  sourceFile: ts.SourceFile;
  statements: Map<string, StatementEntry>;
};

type FunctionLikeNode =
  | ts.ArrowFunction
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.MethodDeclaration;

type ModuleAnalysis = {
  classes: Map<string, ts.ClassDeclaration>;
  defaultExport?: ts.Expression;
  imports: Map<string, ImportBinding>;
  sourceFile: ts.SourceFile;
  topLevelFunctions: Map<string, FunctionLikeNode>;
  topLevelValues: Map<string, ts.Expression>;
};

type InferenceContext = {
  filePath: string;
  imports: Map<string, ImportBinding>;
  localValues: Map<string, ts.Expression>;
  moduleAnalysis?: ModuleAnalysis;
  visitedFunctions: Set<string>;
  visitedNames: Set<string>;
};

type ResolvedFunction = {
  filePath: string;
  functionName: string;
  imports: Map<string, ImportBinding>;
  moduleAnalysis: ModuleAnalysis;
  node: FunctionLikeNode;
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
const moduleAnalysisCache = new Map<string, ModuleAnalysis>();
const importedModuleCache = new Map<string, Promise<unknown>>();

const AUTH_USERNAME_SCHEME = 'authusernameHeader';
const SESSION_KEY_SCHEME = 'sessionkeyHeader';
const API_ERROR_SCHEMA_NAME = 'ApiError';

const ROOT_INFO_RESPONSE_SCHEMA = {
  properties: {
    info: { type: 'string' },
    version: { type: 'string' },
  },
  required: ['info', 'version'],
  type: 'object',
};

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
  400: {
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${API_ERROR_SCHEMA_NAME}` },
      },
    },
    description: 'Validation error or malformed request.',
  },
  401: {
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${API_ERROR_SCHEMA_NAME}` },
      },
    },
    description: 'Authentication failed or session is invalid.',
  },
  413: {
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${API_ERROR_SCHEMA_NAME}` },
      },
    },
    description: 'Request payload too large.',
  },
  500: {
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${API_ERROR_SCHEMA_NAME}` },
      },
    },
    description: 'Internal server error.',
  },
};

const buildOpenApiDocument = async (version: string) => {
  const components: Record<string, Record<string, unknown>> = {
    schemas: {
      [API_ERROR_SCHEMA_NAME]: {
        properties: {
          message: { type: 'string' },
          rationale: { type: 'string' },
        },
        type: 'object',
      },
    },
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
        responses: {
          200: {
            content: {
              'application/json': {
                schema: ROOT_INFO_RESPONSE_SCHEMA,
              },
            },
            description: 'API metadata response.',
          },
        },
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
        localValues: new Map(),
        requiresAuth: false,
        responses: [],
        usesMobileHeader: false,
      };

      const schemas = await loadSchemasForHandler(analysis, controllerPath, handler);
      const fullPath = normalizeOpenApiPath(group.basePath, route.path);
      const pathItem = paths[fullPath] || {};
      paths[fullPath] = pathItem;

      const operation = buildOperation(
        group,
        route,
        handler,
        schemas,
        components,
        fullPath,
        controllerPath,
        analysis.imports
      );
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
  fullPath: string,
  controllerPath: string,
  controllerImports: Map<string, ImportBinding>
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
    responses: buildResponses(handler, controllerPath, controllerImports),
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

const buildResponses = (
  handler: HandlerAnalysis,
  controllerPath: string,
  controllerImports: Map<string, ImportBinding>
) => {
  const responses: Record<string, unknown> = {
    ...COMMON_RESPONSES,
  };

  if (handler.responses.length === 0) {
    responses[200] = {
      content: {
        'application/json': {
          schema: {},
        },
      },
      description: 'Successful response.',
    };
    return responses;
  }

  const responsesByStatus = new Map<number, ResponseAnalysis[]>();

  for (const responseAnalysis of handler.responses) {
    const currentResponses = responsesByStatus.get(responseAnalysis.statusCode) || [];
    currentResponses.push(responseAnalysis);
    responsesByStatus.set(responseAnalysis.statusCode, currentResponses);
  }

  if (!responsesByStatus.has(200)) {
    delete responses[200];
  }

  for (const [statusCode, responseAnalyses] of responsesByStatus.entries()) {
    const responseSchema = combineSchemas(
      responseAnalyses.map((responseAnalysis) =>
        inferResponseSchema(
          responseAnalysis.expression,
          handler.localValues,
          new Set<string>(),
          controllerPath,
          controllerImports
        )
      )
    );

    if (statusCode === 204) {
      responses[String(statusCode)] = { description: 'No content.' };
      continue;
    }

    const mediaType = determineResponseMediaType(responseAnalyses, responseSchema);
    responses[String(statusCode)] = {
      content: {
        [mediaType]: {
          schema: responseSchema,
        },
      },
      description: describeSuccessStatusCode(statusCode),
    };
  }

  return responses;
};

const describeSuccessStatusCode = (statusCode: number) => {
  if (statusCode === 201) {
    return 'Resource created successfully.';
  }

  if (statusCode === 202) {
    return 'Request accepted successfully.';
  }

  if (statusCode === 204) {
    return 'No content.';
  }

  return 'Successful response.';
};

const determineResponseMediaType = (
  responseAnalyses: ResponseAnalysis[],
  schema: unknown
): 'application/json' | 'text/plain' => {
  if (responseAnalyses.some((responseAnalysis) => responseAnalysis.method === 'json')) {
    return 'application/json';
  }

  if (isPlainValueSchema(schema)) {
    return 'text/plain';
  }

  return 'application/json';
};

const isPlainValueSchema = (schema: unknown) => {
  if (!schema || typeof schema !== 'object') {
    return false;
  }

  const type = (schema as { type?: string }).type;
  return type === 'boolean' || type === 'integer' || type === 'number' || type === 'string';
};

const combineSchemas = (schemas: unknown[]) => {
  const meaningfulSchemas = schemas.filter(isMeaningfulSchema);

  if (meaningfulSchemas.length === 0) {
    return {};
  }

  const serializedSchemas = new Set<string>();
  const uniqueSchemas = [];

  for (const schema of meaningfulSchemas) {
    const serializedSchema = JSON.stringify(schema);
    if (serializedSchemas.has(serializedSchema)) {
      continue;
    }

    serializedSchemas.add(serializedSchema);
    uniqueSchemas.push(schema);
  }

  if (uniqueSchemas.length === 1) {
    return uniqueSchemas[0];
  }

  return {
    oneOf: uniqueSchemas,
  };
};

const isMeaningfulSchema = (schema: unknown) => {
  return Boolean(schema && typeof schema === 'object' && Object.keys(schema as object).length > 0);
};

const inferResponseSchema = (
  expression?: ts.Expression,
  localValues: Map<string, ts.Expression> = new Map(),
  visitedNames = new Set<string>(),
  filePath?: string,
  imports = new Map<string, ImportBinding>()
): unknown => {
  if (!expression) {
    return {};
  }

  const context: InferenceContext = {
    filePath: filePath || '',
    imports,
    localValues,
    moduleAnalysis: filePath ? getModuleAnalysis(filePath) : undefined,
    visitedFunctions: new Set<string>(),
    visitedNames,
  };

  return inferSchemaFromExpression(expression, context);
};

const inferSchemaFromExpression = (expression: ts.Expression, context: InferenceContext): unknown => {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isIdentifier(unwrappedExpression)) {
    if (context.visitedNames.has(unwrappedExpression.text)) {
      return {};
    }

    const localValue =
      context.localValues.get(unwrappedExpression.text) ||
      context.moduleAnalysis?.topLevelValues.get(unwrappedExpression.text);
    if (localValue) {
      const nextContext = cloneInferenceContext(context);
      nextContext.visitedNames.add(unwrappedExpression.text);
      return inferSchemaFromExpression(localValue, nextContext);
    }

    const callbackValueSchema = inferSchemaFromCallbackParameter(unwrappedExpression, context);
    if (isMeaningfulSchema(callbackValueSchema)) {
      return callbackValueSchema;
    }

    return {};
  }

  if (
    ts.isStringLiteral(unwrappedExpression) ||
    ts.isNoSubstitutionTemplateLiteral(unwrappedExpression) ||
    ts.isTemplateExpression(unwrappedExpression)
  ) {
    return { type: 'string' };
  }

  if (
    ts.isCallExpression(unwrappedExpression) &&
    ts.isPropertyAccessExpression(unwrappedExpression.expression) &&
    unwrappedExpression.expression.name.text === 'map'
  ) {
    const callback = unwrappedExpression.arguments[0];
    const itemSchema =
      callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        ? inferSchemaFromFunctionNode(callback, {
            filePath: context.filePath,
            imports: context.imports,
            localValues: collectFunctionLocalValues(callback),
            moduleAnalysis: context.moduleAnalysis,
            visitedFunctions: new Set(context.visitedFunctions),
            visitedNames: new Set(),
          })
        : {};

    return {
      items: isMeaningfulSchema(itemSchema) ? itemSchema : {},
      type: 'array',
    };
  }

  if (
    ts.isCallExpression(unwrappedExpression) &&
    ts.isIdentifier(unwrappedExpression.expression) &&
    unwrappedExpression.expression.text === 'performDatabaseRequest'
  ) {
    const callback = unwrappedExpression.arguments[0];
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      return inferSchemaFromFunctionNode(callback, {
        filePath: context.filePath,
        imports: context.imports,
        localValues: collectFunctionLocalValues(callback),
        moduleAnalysis: context.moduleAnalysis,
        visitedFunctions: new Set(context.visitedFunctions),
        visitedNames: new Set(),
      });
    }
  }

  if (
    ts.isTaggedTemplateExpression(unwrappedExpression) &&
    ts.isPropertyAccessExpression(unwrappedExpression.tag) &&
    unwrappedExpression.tag.name.text === '$queryRaw'
  ) {
    return {
      items: {
        additionalProperties: true,
        type: 'object',
      },
      type: 'array',
    };
  }

  if (ts.isNumericLiteral(unwrappedExpression)) {
    return { type: 'number' };
  }

  if (
    unwrappedExpression.kind === ts.SyntaxKind.TrueKeyword ||
    unwrappedExpression.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return { type: 'boolean' };
  }

  if (unwrappedExpression.kind === ts.SyntaxKind.NullKeyword) {
    return { nullable: true };
  }

  if (ts.isArrayLiteralExpression(unwrappedExpression)) {
    return {
      items: combineSchemas(
        unwrappedExpression.elements.map((element) =>
          inferSchemaFromExpression(element as ts.Expression, cloneInferenceContext(context))
        )
      ),
      type: 'array',
    };
  }

  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    let hasSpreadAssignment = false;

    for (const property of unwrappedExpression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = getPropertyNameText(property.name);
        if (!name) {
          continue;
        }

        properties[name] = inferSchemaFromExpression(property.initializer, cloneInferenceContext(context));
        required.push(name);
        continue;
      }

      if (ts.isShorthandPropertyAssignment(property)) {
        properties[property.name.text] = inferSchemaFromExpression(
          property.name,
          cloneInferenceContext(context)
        );
        required.push(property.name.text);
        continue;
      }

      if (ts.isSpreadAssignment(property)) {
        hasSpreadAssignment = true;
      }
    }

    const schema: Record<string, unknown> = {
      properties,
      required,
      type: 'object',
    };

    if (hasSpreadAssignment) {
      schema.additionalProperties = true;
    }

    return schema;
  }

  if (ts.isConditionalExpression(unwrappedExpression)) {
    return combineSchemas([
      inferSchemaFromExpression(unwrappedExpression.whenTrue, cloneInferenceContext(context)),
      inferSchemaFromExpression(unwrappedExpression.whenFalse, cloneInferenceContext(context)),
    ]);
  }

  if (ts.isCallExpression(unwrappedExpression)) {
    const functionSchemas = inferSchemaFromCallExpression(unwrappedExpression, context);
    if (isMeaningfulSchema(functionSchemas)) {
      return functionSchemas;
    }
  }

  return {};
};

const cloneInferenceContext = (context: InferenceContext): InferenceContext => ({
  filePath: context.filePath,
  imports: context.imports,
  localValues: context.localValues,
  moduleAnalysis: context.moduleAnalysis,
  visitedFunctions: new Set(context.visitedFunctions),
  visitedNames: new Set(context.visitedNames),
});

const inferSchemaFromCallbackParameter = (identifier: ts.Identifier, context: InferenceContext) => {
  let currentNode: ts.Node | undefined = identifier;

  while (currentNode) {
    if (
      (ts.isArrowFunction(currentNode) || ts.isFunctionExpression(currentNode)) &&
      currentNode.parameters.some(
        (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text
      ) &&
      ts.isCallExpression(currentNode.parent) &&
      ts.isPropertyAccessExpression(currentNode.parent.expression) &&
      currentNode.parent.expression.name.text === 'then'
    ) {
      return inferSchemaFromExpression(
        currentNode.parent.expression.expression,
        cloneInferenceContext(context)
      );
    }

    currentNode = currentNode.parent;
  }

  return {};
};

const inferSchemaFromCallExpression = (callExpression: ts.CallExpression, context: InferenceContext) => {
  const resolvedFunction = resolveCalledFunction(callExpression, context);
  if (!resolvedFunction) {
    return {};
  }

  const functionKey = `${resolvedFunction.filePath}#${resolvedFunction.functionName}`;
  if (context.visitedFunctions.has(functionKey)) {
    return {};
  }

  const nextContext: InferenceContext = {
    filePath: resolvedFunction.filePath,
    imports: resolvedFunction.imports,
    localValues: collectFunctionLocalValues(resolvedFunction.node),
    moduleAnalysis: resolvedFunction.moduleAnalysis,
    visitedFunctions: new Set(context.visitedFunctions),
    visitedNames: new Set(),
  };
  nextContext.visitedFunctions.add(functionKey);

  return inferSchemaFromFunctionNode(resolvedFunction.node, nextContext);
};

const inferSchemaFromFunctionNode = (node: FunctionLikeNode, context: InferenceContext) => {
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
    return inferSchemaFromExpression(node.body, context);
  }

  if (ts.isFunctionExpression(node) && !ts.isBlock(node.body)) {
    return inferSchemaFromExpression(node.body, context);
  }

  const body = node.body;
  if (!body || !ts.isBlock(body)) {
    return {};
  }

  const returnSchemas = [];
  const visit = (currentNode: ts.Node) => {
    if (currentNode !== body && isFunctionLikeNode(currentNode)) {
      return;
    }

    if (ts.isReturnStatement(currentNode) && currentNode.expression) {
      returnSchemas.push(inferSchemaFromExpression(currentNode.expression, cloneInferenceContext(context)));
    }

    ts.forEachChild(currentNode, visit);
  };

  ts.forEachChild(body, visit);
  return combineSchemas(returnSchemas);
};

const collectFunctionLocalValues = (node: FunctionLikeNode) => {
  const localValues = new Map<string, ts.Expression>();
  const body = node.body;
  if (!body || !ts.isBlock(body)) {
    return localValues;
  }

  const visit = (currentNode: ts.Node) => {
    if (currentNode !== body && isFunctionLikeNode(currentNode)) {
      return;
    }

    if (ts.isVariableDeclaration(currentNode) && ts.isIdentifier(currentNode.name) && currentNode.initializer) {
      localValues.set(currentNode.name.text, currentNode.initializer);
    }

    ts.forEachChild(currentNode, visit);
  };

  ts.forEachChild(body, visit);
  return localValues;
};

const isFunctionLikeNode = (node: ts.Node): node is FunctionLikeNode => {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  );
};

const resolveCalledFunction = (
  callExpression: ts.CallExpression,
  context: InferenceContext
): ResolvedFunction | undefined => {
  const expression = callExpression.expression;

  if (ts.isIdentifier(expression) && context.moduleAnalysis?.topLevelFunctions.has(expression.text)) {
    const functionNode = context.moduleAnalysis.topLevelFunctions.get(expression.text);
    if (!functionNode) {
      return undefined;
    }

    return {
      filePath: context.filePath,
      functionName: expression.text,
      imports: context.imports,
      moduleAnalysis: context.moduleAnalysis,
      node: functionNode,
    };
  }

  if (!ts.isPropertyAccessExpression(expression) || !context.filePath) {
    return undefined;
  }

  const targetIdentifier = ts.isIdentifier(expression.expression) ? expression.expression.text : undefined;
  if (!targetIdentifier) {
    return undefined;
  }

  const importBinding = context.imports.get(targetIdentifier);
  if (!importBinding) {
    return undefined;
  }

  if (!importBinding.moduleSpecifier.startsWith('.')) {
    return undefined;
  }

  const importedModulePath = resolveExistingModulePath(
    new URL(importBinding.moduleSpecifier, pathToFileURL(context.filePath)).href
  );
  const moduleAnalysis = getModuleAnalysis(importedModulePath);

  if (importBinding.kind === 'default') {
    return resolveDefaultExportMemberFunction(importedModulePath, moduleAnalysis, expression.name.text);
  }

  if (importBinding.kind === 'named') {
    if (importBinding.exportName !== expression.name.text) {
      return undefined;
    }

    const functionNode = moduleAnalysis.topLevelFunctions.get(importBinding.exportName);
    if (!functionNode) {
      return undefined;
    }

    return {
      filePath: importedModulePath,
      functionName: importBinding.exportName,
      imports: moduleAnalysis.imports,
      moduleAnalysis,
      node: functionNode,
    };
  }

  return undefined;
};

const resolveDefaultExportMemberFunction = (
  filePath: string,
  moduleAnalysis: ModuleAnalysis,
  memberName: string
): ResolvedFunction | undefined => {
  const defaultExport = moduleAnalysis.defaultExport;
  if (!defaultExport) {
    return undefined;
  }

  if (ts.isObjectLiteralExpression(defaultExport)) {
    const functionNode = getFunctionFromObjectLiteral(defaultExport, memberName, moduleAnalysis);
    if (!functionNode) {
      return undefined;
    }

    return {
      filePath,
      functionName: memberName,
      imports: moduleAnalysis.imports,
      moduleAnalysis,
      node: functionNode,
    };
  }

  if (ts.isIdentifier(defaultExport)) {
    const defaultExportValue = moduleAnalysis.topLevelValues.get(defaultExport.text);
    if (defaultExportValue && ts.isObjectLiteralExpression(defaultExportValue)) {
      const functionNode = getFunctionFromObjectLiteral(defaultExportValue, memberName, moduleAnalysis);
      if (!functionNode) {
        return undefined;
      }

      return {
        filePath,
        functionName: `${defaultExport.text}.${memberName}`,
        imports: moduleAnalysis.imports,
        moduleAnalysis,
        node: functionNode,
      };
    }

    const classDeclaration = moduleAnalysis.classes.get(defaultExport.text);
    if (!classDeclaration) {
      return undefined;
    }

    for (const classMember of classDeclaration.members) {
      if (
        ts.isMethodDeclaration(classMember) &&
        hasStaticModifier(classMember) &&
        getPropertyNameText(classMember.name) === memberName
      ) {
        return {
          filePath,
          functionName: `${defaultExport.text}.${memberName}`,
          imports: moduleAnalysis.imports,
          moduleAnalysis,
          node: classMember,
        };
      }
    }
  }

  return undefined;
};

const getModuleAnalysis = (modulePath: string) => {
  const cached = moduleAnalysisCache.get(modulePath);
  if (cached) {
    return cached;
  }

  const sourceText = readFileSync(modulePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    modulePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    modulePath.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  const imports = new Map<string, ImportBinding>();
  const classes = new Map<string, ts.ClassDeclaration>();
  const topLevelFunctions = new Map<string, FunctionLikeNode>();
  const topLevelValues = new Map<string, ts.Expression>();
  let defaultExport: ts.Expression | undefined;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImportBindings(statement, imports);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }

        topLevelValues.set(declaration.name.text, declaration.initializer);
        if (
          ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer)
        ) {
          topLevelFunctions.set(declaration.name.text, declaration.initializer);
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      topLevelFunctions.set(statement.name.text, statement);
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      classes.set(statement.name.text, statement);
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      defaultExport = statement.expression;
    }
  }

  const analysis = {
    classes,
    defaultExport,
    imports,
    sourceFile,
    topLevelFunctions,
    topLevelValues,
  };

  moduleAnalysisCache.set(modulePath, analysis);
  return analysis;
};

const getFunctionFromObjectLiteral = (
  objectLiteral: ts.ObjectLiteralExpression,
  memberName: string,
  moduleAnalysis: ModuleAnalysis
) => {
  for (const property of objectLiteral.properties) {
    if (ts.isPropertyAssignment(property) && getPropertyNameText(property.name) === memberName) {
      if (ts.isIdentifier(property.initializer)) {
        return moduleAnalysis.topLevelFunctions.get(property.initializer.text);
      }

      if (
        ts.isArrowFunction(property.initializer) ||
        ts.isFunctionExpression(property.initializer)
      ) {
        return property.initializer;
      }
    }

    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === memberName
    ) {
      return moduleAnalysis.topLevelFunctions.get(memberName);
    }

    if (ts.isMethodDeclaration(property) && getPropertyNameText(property.name) === memberName) {
      return property;
    }
  }

  return undefined;
};

const hasStaticModifier = (node: ts.Node) => {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword));
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let currentExpression = expression;

  while (true) {
    if (ts.isAwaitExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isParenthesizedExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isAsExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isSatisfiesExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isNonNullExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isTypeAssertionExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    return currentExpression;
  }
};

const getPropertyNameText = (name: ts.PropertyName) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
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
  const responseParamName = getResponseParameterName(handlerNode);
  const handlerAnalysis: HandlerAnalysis = {
    localValues: new Map(),
    requiresAuth: false,
    responses: [],
    usesMobileHeader: false,
  };

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      handlerAnalysis.localValues.set(node.name.text, node.initializer);
    }

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

      const responseAnalysis = extractResponseAnalysis(node, responseParamName);
      if (responseAnalysis) {
        handlerAnalysis.responses.push(responseAnalysis);
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

const getResponseParameterName = (handlerNode: ts.ArrowFunction | ts.FunctionExpression) => {
  const secondParameter = handlerNode.parameters[1];
  if (!secondParameter || !ts.isIdentifier(secondParameter.name)) {
    return 'res';
  }

  return secondParameter.name.text;
};

const extractResponseAnalysis = (node: ts.CallExpression, responseParamName: string) => {
  const responseTarget = getResponseTarget(node.expression, responseParamName);
  if (!responseTarget || node.arguments.length === 0) {
    return undefined;
  }

  return {
    expression: node.arguments[0],
    method: responseTarget.method,
    statusCode: responseTarget.statusCode,
  };
};

const getResponseTarget = (
  expression: ts.LeftHandSideExpression,
  responseParamName: string
): Omit<ResponseAnalysis, 'expression'> | undefined => {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  if (expression.name.text !== 'json' && expression.name.text !== 'send') {
    return undefined;
  }

  if (ts.isIdentifier(expression.expression) && expression.expression.text === responseParamName) {
    return {
      method: expression.name.text,
      statusCode: 200,
    };
  }

  if (
    !ts.isCallExpression(expression.expression) ||
    !ts.isPropertyAccessExpression(expression.expression.expression) ||
    expression.expression.expression.name.text !== 'status' ||
    !ts.isIdentifier(expression.expression.expression.expression) ||
    expression.expression.expression.expression.text !== responseParamName
  ) {
    return undefined;
  }

  return {
    method: expression.name.text,
    statusCode: parseStatusCode(expression.expression.arguments[0]),
  };
};

const parseStatusCode = (expression?: ts.Expression) => {
  if (expression && ts.isNumericLiteral(expression)) {
    return Number.parseInt(expression.text, 10);
  }

  return 200;
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
