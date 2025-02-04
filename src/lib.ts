import {
  buildASTSchema,
  DefinitionNode,
  DocumentNode,
  GraphQLSchema,
  Kind,
  validateSchema,
} from "graphql";
import {
  ok,
  err,
  graphQlErrorToDiagnostic,
  DiagnosticsResult,
  Result,
  ReportableDiagnostics,
} from "./utils/DiagnosticError";
import * as ts from "typescript";
import { Extractor } from "./Extractor";
import { TypeContext } from "./TypeContext";
import { validateSDL } from "graphql/validation/validate";
import { applyServerDirectives, DIRECTIVES_AST } from "./serverDirectives";

export { applyServerDirectives } from "./serverDirectives";

export type BuildOptions = {
  // The set of files which might contain GraphQL definitions.
  // TODO: Can we get rid of this and just use the tsconfig and search through
  // _all_ files?
  files: string[];

  // Should we write a schema file to disk? If so, where?
  // TODO: Clarify what this path is relative to.
  emitSchemaFile?: string;

  // Should all fields be typed as nullable in accordance with GraphQL best practices?
  // https://graphql.org/learn/best-practices/#nullability
  nullableByDefault?: boolean;
};

// Construct a schema, using GraphQL schema language
// Exported for tests that want to intercept diagnostic errors.
export function buildSchemaResult(
  options: BuildOptions,
): Result<GraphQLSchema, ReportableDiagnostics> {
  // https://stackoverflow.com/a/66604532/1263117
  const compilerOptions: ts.CompilerOptions = { allowJs: true };
  const compilerHost = ts.createCompilerHost(
    options,
    /* setParentNodes this is needed for finding jsDocs */
    true,
  );

  return buildSchemaResultWithHost(options, compilerOptions, compilerHost);
}

export function buildSchemaResultWithHost(
  options: BuildOptions,
  compilerOptions: ts.CompilerOptions,
  compilerHost: ts.CompilerHost,
): Result<GraphQLSchema, ReportableDiagnostics> {
  const docResult = buildSchemaAst(options, compilerHost, compilerOptions);
  if (docResult.kind === "ERROR") {
    return err(new ReportableDiagnostics(compilerHost, docResult.err));
  }

  const schema = buildASTSchema(docResult.value, { assumeValidSDL: true });

  const diagnostics = validateSchema(schema)
    // FIXME: Handle case where query is not defined (no location)
    .filter((e) => e.source && e.locations && e.positions)
    .map((e) => graphQlErrorToDiagnostic(e));

  if (diagnostics.length > 0) {
    return err(new ReportableDiagnostics(compilerHost, diagnostics));
  }

  return ok(applyServerDirectives(schema));
}

export function buildSchemaAst(
  options: BuildOptions,
  host: ts.CompilerHost,
  compilerOptions: ts.CompilerOptions,
): DiagnosticsResult<DocumentNode> {
  const docResult = definitionsFromFile(options, host, compilerOptions);
  if (docResult.kind === "ERROR") return docResult;

  const doc = docResult.value;

  // TODO: Currently this does not detect definitions that shadow builtins
  // (`String`, `Int`, etc). However, if we pass a second param (extending an
  // existing schema) we do! So, we should find a way to validate that we don't
  // shadow builtins.
  const validationErrors = validateSDL(doc).map((e) => {
    return graphQlErrorToDiagnostic(e);
  });
  if (validationErrors.length > 0) {
    return err(validationErrors);
  }
  return ok(doc);
}

function definitionsFromFile(
  options: BuildOptions,
  host: ts.CompilerHost,
  compilerOptions: ts.CompilerOptions,
): DiagnosticsResult<DocumentNode> {
  const program = ts.createProgram(options.files, compilerOptions, host);
  const checker = program.getTypeChecker();
  const ctx = new TypeContext(checker, host);

  const definitions: DefinitionNode[] = Array.from(DIRECTIVES_AST.definitions);
  for (const sourceFile of program.getSourceFiles()) {
    // If the file doesn't contain any GraphQL definitions, skip it.
    if (!/@GQL/.test(sourceFile.text)) {
      continue;
    }

    const extractor = new Extractor(sourceFile, ctx, options);
    const extractedResult = extractor.extract();
    if (extractedResult.kind === "ERROR") return extractedResult;
    for (const definition of extractedResult.value) {
      definitions.push(definition);
    }
  }

  return ctx.resolveTypes({ kind: Kind.DOCUMENT, definitions });
}
