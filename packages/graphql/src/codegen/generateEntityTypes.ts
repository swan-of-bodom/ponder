/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { PonderLogger, PonderOptions } from "@ponder/ponder";
import { Kind } from "graphql";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { FieldKind, PonderSchema } from "@/schema/types";

const gqlScalarToTsType: Record<string, string | undefined> = {
  ID: "string",
  Boolean: "boolean",
  Int: "number",
  String: "string",
  // graph-ts scalar types
  BigInt: "string",
  BigDecimal: "string",
  Bytes: "string",
};

export const generateEntityTypes = async (
  schema: PonderSchema,
  logger: PonderLogger,
  OPTIONS: PonderOptions
) => {
  const entityNames = schema.entities.map((entity) => entity.name);

  const entityModelTypes = schema.entities
    .map((entity) => {
      return `
  export type ${entity.name}Instance = {
    ${entity.fields
      .map((field) => {
        switch (field.kind) {
          case FieldKind.ID: {
            return `${field.name}: string;`;
          }
          case FieldKind.ENUM: {
            return `${field.name}${field.notNull ? "" : "?"}: ${field.enumValues
              .map((val) => `"${val}"`)
              .join(" | ")};`;
          }
          case FieldKind.SCALAR: {
            const scalarTsType = gqlScalarToTsType[field.baseGqlType.name];
            if (!scalarTsType) {
              throw new Error(
                `TypeScript type not found for scalar: ${field.baseGqlType.name}`
              );
            }

            return `${field.name}${field.notNull ? "" : "?"}: ${scalarTsType};`;
          }
          case FieldKind.LIST: {
            // This is trash
            let tsBaseType: string;
            if (
              Object.keys(gqlScalarToTsType).includes(
                field.baseGqlType.toString()
              )
            ) {
              const scalarTypeName = field.baseGqlType.toString();
              const scalarTsType = gqlScalarToTsType[scalarTypeName];
              if (!scalarTsType) {
                throw new Error(
                  `TypeScript type not found for scalar: ${scalarTypeName}`
                );
              }
              tsBaseType = scalarTsType;
            } else if (
              // @ts-ignore
              field.baseGqlType.astNode?.kind === Kind.ENUM_TYPE_DEFINITION
            ) {
              // @ts-ignore
              const enumValues = (field.baseGqlType.astNode?.values || []).map(
                // @ts-ignore
                (v) => v.name.value
              );
              // @ts-ignore
              tsBaseType = `(${enumValues.map((v) => `"${v}"`).join(" | ")})`;
            } else {
              throw new Error(
                `Unable to generate type for field: ${field.name}`
              );
            }

            return `${field.name}${field.notNull ? "" : "?"}: ${tsBaseType}[];`;
          }
          case FieldKind.RELATIONSHIP: {
            return `${field.name}: string;`;
          }
        }
      })
      .join("")}
  };

  export type ${entity.name}Model = {
    get: (id: string) => Promise<${entity.name}Instance | null>;
    insert: (obj: ${entity.name}Instance) => Promise<${entity.name}Instance>;
    update: (obj: { id: string } & Partial<${entity.name}Instance>) =>
      Promise<${entity.name}Instance>;
    delete: (id: string) => Promise<void>;
  };
    `;
    })
    .join("");

  const raw = `
    /* Autogenerated file. Do not edit manually. */

    ${entityModelTypes}

    export type entities = {
      ${entityNames
        .map((entityName) => `${entityName}: ${entityName}Model;`)
        .join("")}
    }
  `;

  writeFileSync(
    path.join(OPTIONS.GENERATED_DIR_PATH, "entities.ts"),
    raw,
    "utf8"
  );

  logger.debug(`Generated entities.ts file`);
};
