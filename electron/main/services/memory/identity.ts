import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentKind, MemoryEntry } from "../../../../src/lib/types";
import { atomicWrite, sha256 } from "../shared";

interface ClaimIdentityRecord {
  id: string;
  sourcePath: string;
  structuralKey: string;
  revisionHashes: string[];
  fingerprint: string;
  aliasIds: string[];
  missing: boolean;
}

interface ClaimIdentityIndex {
  schemaVersion: "1";
  records: ClaimIdentityRecord[];
}

const emptyIndex = (): ClaimIdentityIndex => ({ schemaVersion: "1", records: [] });

function identityPath(root: string, agent: AgentKind) {
  return join(root, ".backplane", `claim-identities.${agent}.v1.json`);
}

export async function stabilizeMemoryEntryIds(
  agent: AgentKind,
  root: string,
  entries: MemoryEntry[],
) {
  const path = identityPath(root, agent);
  const previous = await loadIdentityIndex(path);
  const records = previous.records.map((record) => ({ ...record }));
  const usedStableIds = new Set(records.map((record) => record.id));
  const nextRecords: ClaimIdentityRecord[] = [];
  const output: MemoryEntry[] = [];
  const sourcePaths = new Set([
    ...entries.map((entry) => entry.sourcePath),
    ...records.map((record) => record.sourcePath),
  ]);

  for (const sourcePath of [...sourcePaths].sort()) {
    const sourceEntries = entries.filter((entry) => entry.sourcePath === sourcePath);
    const sourceRecords = records.filter((record) => record.sourcePath === sourcePath);
    const reconciled = reconcileSource(sourceEntries, sourceRecords, usedStableIds);
    output.push(...reconciled.entries);
    nextRecords.push(...reconciled.records);
  }

  const stableIds = new Set(nextRecords.map((record) => record.id));
  for (const record of nextRecords) {
    record.aliasIds = record.aliasIds.filter((alias) => !stableIds.has(alias));
  }
  const recordsById = new Map(nextRecords.map((record) => [record.id, record]));
  const sanitizedOutput = output.map((entry) => ({
    ...entry,
    aliasIds: recordsById.get(entry.id)?.aliasIds ?? [],
  }));
  const next: ClaimIdentityIndex = {
    schemaVersion: "1",
    records: nextRecords.sort((left, right) => left.id.localeCompare(right.id)),
  };
  const previousJson = `${JSON.stringify(previous, null, 2)}\n`;
  const nextJson = `${JSON.stringify(next, null, 2)}\n`;
  if (previousJson !== nextJson) {
    await atomicWrite(path, nextJson);
  }
  return sanitizedOutput.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.startLine - right.startLine ||
    left.id.localeCompare(right.id),
  );
}

function reconcileSource(
  entries: MemoryEntry[],
  records: ClaimIdentityRecord[],
  usedStableIds: Set<string>,
) {
  const assignments = new Map<number, number>();
  const usedRecords = new Set<number>();
  const entryRevisionHashes = entries.map((entry) =>
    entry.revisionHash ?? sha256(normalizeFingerprint(entry.searchText)),
  );
  const entryFingerprints = entries.map((entry) => normalizeFingerprint(entry.searchText));

  const assign = (entryIndex: number, recordIndex: number) => {
    if (assignments.has(entryIndex) || usedRecords.has(recordIndex)) return false;
    assignments.set(entryIndex, recordIndex);
    usedRecords.add(recordIndex);
    return true;
  };

  for (const [entryIndex, entry] of entries.entries()) {
    if (!entry.change) continue;
    const stableChangeId = `change:${entry.change.id}`;
    const recordIndex = records.findIndex((record) => record.id === stableChangeId);
    if (recordIndex >= 0) assign(entryIndex, recordIndex);
  }

  for (const [entryIndex, revisionHash] of entryRevisionHashes.entries()) {
    if (assignments.has(entryIndex)) continue;
    const matchingEntries = entryRevisionHashes.filter((candidate) => candidate === revisionHash);
    const matchingRecords = records
      .map((record, recordIndex) => ({ record, recordIndex }))
      .filter(({ record, recordIndex }) =>
        !usedRecords.has(recordIndex) && record.revisionHashes.includes(revisionHash),
      );
    if (matchingEntries.length === 1 && matchingRecords.length === 1) {
      assign(entryIndex, matchingRecords[0].recordIndex);
    }
  }

  const unassignedEntryCount = entries.filter((_entry, index) => !assignments.has(index)).length;
  const unusedRecordCount = records.filter((record, index) =>
    !usedRecords.has(index) && !record.missing,
  ).length;
  if (unassignedEntryCount === unusedRecordCount) {
    for (const [entryIndex, entry] of entries.entries()) {
      if (assignments.has(entryIndex)) continue;
      const matchingEntries = entries
        .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
        .filter(({ candidate, candidateIndex }) =>
          !assignments.has(candidateIndex) && candidate.structuralKey === entry.structuralKey,
        );
      const matchingRecords = records
        .map((record, recordIndex) => ({ record, recordIndex }))
        .filter(({ record, recordIndex }) =>
          !usedRecords.has(recordIndex) &&
          !record.missing &&
          record.structuralKey === entry.structuralKey &&
          fingerprintSimilarity(entryFingerprints[entryIndex], record.fingerprint) >= 0.45,
        );
      if (matchingEntries.length === 1 && matchingRecords.length === 1) {
        assign(entryIndex, matchingRecords[0].recordIndex);
      }
    }
  }

  for (const [entryIndex, entry] of entries.entries()) {
    if (assignments.has(entryIndex)) continue;
    const preferredId = entry.change ? `change:${entry.change.id}` : entry.id;
    const id = uniqueStableId(preferredId, entry, usedStableIds);
    records.push({
      id,
      sourcePath: entry.sourcePath,
      structuralKey: entry.structuralKey ?? `claim:${entryIndex}`,
      revisionHashes: [entryRevisionHashes[entryIndex]],
      fingerprint: entryFingerprints[entryIndex],
      aliasIds: [...new Set([entry.id, ...(entry.aliasIds ?? [])])].filter((alias) => alias !== id),
      missing: false,
    });
    assignments.set(entryIndex, records.length - 1);
    usedRecords.add(records.length - 1);
    usedStableIds.add(id);
  }

  for (const [recordIndex, record] of records.entries()) {
    if (!usedRecords.has(recordIndex)) record.missing = true;
  }

  const stabilizedEntries = entries.map((entry, entryIndex) => {
    const record = records[assignments.get(entryIndex)!];
    const aliases = [...new Set([
      ...record.aliasIds,
      entry.id,
      ...(entry.aliasIds ?? []),
    ])].filter((alias) => alias !== record.id);
    record.structuralKey = entry.structuralKey ?? record.structuralKey;
    record.revisionHashes = [...new Set([
      ...record.revisionHashes,
      entryRevisionHashes[entryIndex],
    ])].slice(-12);
    record.fingerprint = entryFingerprints[entryIndex];
    record.aliasIds = aliases;
    record.missing = false;
    return {
      ...entry,
      id: record.id,
      revisionHash: entryRevisionHashes[entryIndex],
      aliasIds: aliases,
    };
  });
  return { entries: stabilizedEntries, records };
}

function uniqueStableId(preferredId: string, entry: MemoryEntry, usedIds: Set<string>) {
  if (!usedIds.has(preferredId)) return preferredId;
  const suffix = sha256(`${entry.sourcePath}\0${entry.structuralKey}\0${entry.revisionHash}`).slice(0, 8);
  const candidate = `${preferredId}:${suffix}`;
  if (!usedIds.has(candidate)) return candidate;
  let counter = 2;
  while (usedIds.has(`${candidate}:${counter}`)) counter += 1;
  return `${candidate}:${counter}`;
}

function normalizeFingerprint(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/<!--[^>]*-->/g, " ")
    .replace(/[`*_>#\[\](){}|~]/g, " ")
    .replace(/^(?:\s*)(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprintSimilarity(left: string, right: string) {
  if (left === right) return 1;
  const leftTokens = fingerprintTokens(left);
  const rightTokens = fingerprintTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function fingerprintTokens(value: string) {
  const compact = value.replace(/\s+/g, " ");
  const tokens = new Set(compact.split(/\s+/).filter(Boolean));
  const characters = [...compact.replace(/\s/g, "")];
  for (let index = 0; index < characters.length - 1; index += 1) {
    tokens.add(`${characters[index]}${characters[index + 1]}`);
  }
  return tokens;
}

async function loadIdentityIndex(path: string): Promise<ClaimIdentityIndex> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyIndex();
    throw error;
  }
  try {
    const value = JSON.parse(content) as Partial<ClaimIdentityIndex>;
    if (
      value.schemaVersion !== "1" ||
      !Array.isArray(value.records) ||
      !value.records.every(isIdentityRecord)
    ) {
      throw new Error("invalid claim identity index");
    }
    const recordIds = new Set(value.records.map((record) => record.id));
    if (recordIds.size !== value.records.length) {
      throw new Error("duplicate claim identity IDs");
    }
    return { schemaVersion: "1", records: value.records };
  } catch (error) {
    const backupPath = `${path}.corrupt-${Date.now()}`;
    await atomicWrite(backupPath, content);
    throw new Error(`Claim identity index is invalid. A backup was saved to ${backupPath}.`, {
      cause: error,
    });
  }
}

function isIdentityRecord(value: unknown): value is ClaimIdentityRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ClaimIdentityRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.sourcePath === "string" &&
    typeof record.structuralKey === "string" &&
    Array.isArray(record.revisionHashes) &&
    record.revisionHashes.every((item) => typeof item === "string") &&
    typeof record.fingerprint === "string" &&
    Array.isArray(record.aliasIds) &&
    record.aliasIds.every((item) => typeof item === "string") &&
    typeof record.missing === "boolean"
  );
}
