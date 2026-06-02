// n8n Creator Portal verification shim.
//
// The Portal's automated pre-check fetches credential source files from the
// repo root, ignoring npm's `repository.directory` field. In this monorepo
// the real source lives at `n8n-nodes-ramsisa/credentials/RamsisaApi.credentials.ts`,
// so this file re-exports it from the path the pre-check expects.
//
// See also: nodes/Ramsisa/Ramsisa.node.ts (same pattern, same reason).

export { RamsisaApi } from "../n8n-nodes-ramsisa/credentials/RamsisaApi.credentials";
