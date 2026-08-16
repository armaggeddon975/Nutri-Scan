import { existsSync } from "node:fs";
import { createRequire } from "node:module";

// Este modulo usa apenas built-ins do Node.js de proposito.
// Ele precisa funcionar em uma copia recem-extraida, sem node_modules.

export function createRequireFrom(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return null;
  return createRequire(packageJsonPath);
}

export function createModuleResolver(packageJsonPath) {
  const requireFrom = createRequireFrom(packageJsonPath);
  if (!requireFrom) return () => false;

  return (moduleName) => {
    try {
      requireFrom.resolve(moduleName);
      return true;
    } catch {
      try {
        requireFrom.resolve(`${moduleName}/package.json`);
        return true;
      } catch {
        return false;
      }
    }
  };
}

export function loadOptionalModule(packageJsonPath, moduleName) {
  const requireFrom = createRequireFrom(packageJsonPath);
  if (!requireFrom) return null;
  try {
    return requireFrom(moduleName);
  } catch {
    return null;
  }
}
