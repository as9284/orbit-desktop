export interface CodexInitializeParams {
  clientInfo: {
    name: string;
    title: string;
    version: string;
  };
  capabilities: {
    experimentalApi: true;
  };
}

export function createCodexInitializeParams(version: string): CodexInitializeParams {
  return {
    clientInfo: {
      name: "orbit-desktop",
      title: "Orbit Desktop",
      version,
    },
    capabilities: {
      experimentalApi: true,
    },
  };
}
