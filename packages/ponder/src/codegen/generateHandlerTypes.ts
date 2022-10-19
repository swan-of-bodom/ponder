import type { EventFragment, ParamType } from "@ethersproject/abi";
import { Contract } from "ethers";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { CONFIG } from "@/common/config";
import { logger } from "@/common/logger";
import { formatPrettier } from "@/common/utils";
import { Source } from "@/sources/base";

const header = `
/* Autogenerated file. Do not edit manually. */
`;

const imports = `
import type { Block, EventLog, Transaction } from "@ponder/ponder";
import type { BigNumber } from "ethers";

import type { Context } from "./context";
`;

const generateHandlerTypes = async (sources: Source[]) => {
  await Promise.all(
    sources.map(async (source) => {
      const contract = new Contract(source.address, source.abiInterface);

      const eventHandlers = Object.entries(contract.interface.events).map(
        ([eventSignature, event]) =>
          generateEventHandlerType(eventSignature, event)
      );

      const eventHandlersTypeString = eventHandlers
        .map((handler) => handler.typeString)
        .join("");

      const contractHandlersTypeString = `
      export type ${source.name}Handlers = { ${eventHandlers
        .map(({ name }) => `${name}?: ${name}Handler`)
        .join(",")}}
      `;

      const final = formatPrettier(
        header + imports + eventHandlersTypeString + contractHandlersTypeString
      );

      await writeFile(
        path.join(CONFIG.GENERATED_DIR_PATH, `${source.name}.d.ts`),
        final,
        "utf8"
      );
    })
  );

  logger.info(`\x1b[36m${"Generated handler types"}\x1b[0m`); // magenta
};

// HELPERS

const generateEventHandlerType = (
  eventSignature: string,
  event: EventFragment
) => {
  const eventName = eventSignature.slice(0, eventSignature.indexOf("("));

  const parameterType = generateParamsType(event.inputs);

  const eventHandlerTypes = `
  export interface ${eventName}Event extends EventLog {
    name: "${eventName}";
    params: ${parameterType};
    block: Block;
    transaction: Transaction;
  }
  export type ${eventName}Handler = (event: ${eventName}Event, context: Context) => void;
  `;

  return {
    name: eventName,
    typeString: eventHandlerTypes,
  };
};

const valueTypeMap: { [baseType: string]: string | undefined } = {
  bool: "boolean",
  address: "string",
  string: "string",
  int: "BigNumber",
  uint: "BigNumber",
  bytes: "Bytes",
};

const generateParamsType = (params: ParamType[]): string => {
  const childTypes = params
    .map((param) => {
      if (param.components) {
        return `${param.name}: ${generateParamsType(param.components)}; `;
      }

      // Remove any trailing numbers (uint256 -> uint)
      const trimmedParamBaseType = param.baseType.replace(/[0-9]+$/, "");
      const valueType = valueTypeMap[trimmedParamBaseType];
      if (valueType) {
        return `${param.name}: ${valueType}; `;
      }

      console.error("unhandled param:", { param });
      return `${param.name}: unknown; `;
    })
    .join("");

  return `{ ${childTypes}}`;
};

export { generateHandlerTypes };
