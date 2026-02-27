module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "ts-jest",
  },
  // uuid v10+ is pure ESM; tell Jest to transform it instead of skipping it.
  // The pattern handles both npm and pnpm path structures:
  // - npm: /node_modules/uuid/...
  // - pnpm: /node_modules/.pnpm/uuid@X.Y.Z/node_modules/uuid/...
  transformIgnorePatterns: ["/node_modules/(?!(.pnpm/(uuid@)|uuid/))"],
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^obsidian$": "<rootDir>/__mocks__/obsidian.js",
  },
  testRegex: ".*\\.test\\.(jsx?|tsx?)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testPathIgnorePatterns: ["/node_modules/"],
  setupFiles: ["<rootDir>/jest.setup.js"],
};
