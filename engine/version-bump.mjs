import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
    console.error("Error: npm_package_version not set. Run via 'npm version' command.");
    process.exit(1);
}

// Update package.json version (npm version already does this, but this ensures consistency)
let packageJson = JSON.parse(readFileSync("package.json", "utf8"));
packageJson.version = targetVersion;
writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n");

console.log(`✓ Version bumped to ${targetVersion}`);

