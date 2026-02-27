import { setChainType, setModelKey } from "@/aiParams";
import { ChainType } from "@/chainFactory";
import {
  ChatModelProviders,
  ChatModels,
  DEFAULT_SETTINGS,
  EmbeddingModelProviders,
  EmbeddingModels,
  PlusUtmMedium,
} from "@/constants";
import { logError, logInfo } from "@/logger";
import { getSettings, setSettings, updateSetting } from "@/settings/model";
import { Notice } from "obsidian";
import React from "react";

export const DEFAULT_COPILOT_PLUS_CHAT_MODEL = ChatModels.COPILOT_PLUS_FLASH;
export const DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_CHAT_MODEL + "|" + ChatModelProviders.COPILOT_PLUS;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL = EmbeddingModels.COPILOT_PLUS_SMALL;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL + "|" + EmbeddingModelProviders.COPILOT_PLUS;

// Default models for free users (imported from DEFAULT_SETTINGS)
export const DEFAULT_FREE_CHAT_MODEL_KEY = DEFAULT_SETTINGS.defaultModelKey;
export const DEFAULT_FREE_EMBEDDING_MODEL_KEY = DEFAULT_SETTINGS.embeddingModelKey;

// ============================================================================
// SELF-HOST MODE VALIDATION
// ============================================================================
// Self-host mode allows users to use their own infrastructure for search, LLMs, etc.
// No license validation required - users configure their own API endpoints and keys.
// ============================================================================

/**
 * Check if self-host mode is enabled.
 * Self-host mode is enabled when the user has configured a self-host URL.
 */
export function isSelfHostModeValid(): boolean {
  const settings = getSettings();
  return settings.enableSelfHostMode && !!settings.selfHostUrl;
}

/**
 * Check if self-host access is valid (for backwards compatibility).
 * Self-host mode is available to all users who configure their own infrastructure.
 */
export function isSelfHostAccessValid(): boolean {
  const settings = getSettings();
  return settings.enableSelfHostMode && !!settings.selfHostUrl;
}

/**
 * Check if the model key is a Copilot Plus model.
 * Note: All features are now available without license validation.
 */
export function isPlusModel(modelKey: string): boolean {
  return modelKey.split("|")[1] === EmbeddingModelProviders.COPILOT_PLUS;
}

/**
 * Synchronous check if Plus features should be enabled.
 * All features are now available without license validation.
 * Use this for synchronous checks (e.g., model validation, UI state).
 */
export function isPlusEnabled(): boolean {
  // All features are now available without license validation
  return true;
}

/**
 * Hook to get the isPlusUser setting.
 * All features are now available without license validation.
 */
export function useIsPlusUser(): boolean {
  return true;
}

/**
 * Check if the user is a Plus user.
 * All features are now available without license validation.
 */
export async function checkIsPlusUser(context?: Record<string, any>): Promise<boolean> {
  // All features are now available without license validation
  return true;
}

/**
 * Check if the user is on a plan that qualifies for self-host mode.
 * Self-host mode is now available to all users who configure their own infrastructure.
 */
export async function isSelfHostEligiblePlan(): Promise<boolean> {
  // Self-host mode is available to all users
  return true;
}

/**
 * Hook to check if user should see the self-host mode settings section.
 * Self-host mode is available to all users.
 */
export function useIsSelfHostEligible(): boolean {
  return true;
}

/**
 * Validate self-host mode when user enables the toggle.
 * Self-host mode is available to all users who configure their own infrastructure.
 *
 * @returns true if self-host mode can be enabled
 */
export async function validateSelfHostMode(): Promise<boolean> {
  // Self-host mode is available to all users
  logInfo("Self-host mode enabled");
  return true;
}

/**
 * Refresh self-host mode validation on plugin startup.
 * Self-host mode validation is no longer required.
 */
export async function refreshSelfHostModeValidation(): Promise<void> {
  // No validation required - self-host mode is available to all users
  const settings = getSettings();
  if (settings.enableSelfHostMode) {
    logInfo("Self-host mode is enabled");
  }
}

/**
 * Apply the Copilot Plus settings.
 * Includes clinical fix to ensure indexing is triggered when embedding model changes,
 * as the automatic detection doesn't work reliably in all scenarios.
 */
export function applyPlusSettings(): void {
  const defaultModelKey = DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY;
  const embeddingModelKey = DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY;
  const previousEmbeddingModelKey = getSettings().embeddingModelKey;

  logInfo("applyPlusSettings: Changing embedding model", {
    from: previousEmbeddingModelKey,
    to: embeddingModelKey,
    changed: previousEmbeddingModelKey !== embeddingModelKey,
  });

  setModelKey(defaultModelKey);
  setChainType(ChainType.AGENT_CHAIN);
  setSettings({
    defaultModelKey,
    embeddingModelKey,
    defaultChainType: ChainType.AGENT_CHAIN,
  });

  // Ensure indexing happens only once when embedding model changes
  if (previousEmbeddingModelKey !== embeddingModelKey) {
    logInfo("applyPlusSettings: Embedding model changed, triggering indexing");
    import("@/search/vectorStoreManager")
      .then(async (module) => {
        await module.default.getInstance().indexVaultToVectorStore();
      })
      .catch((error) => {
        logError("Failed to trigger indexing after Plus settings applied:", error);
        new Notice(
          "Failed to update Copilot index. Please try force reindexing from the command palette."
        );
      });
  } else {
    logInfo("applyPlusSettings: No embedding model change, skipping indexing");
  }
}

export function createPlusPageUrl(medium: PlusUtmMedium): string {
  return `https://www.obsidiancopilot.com?utm_source=obsidian&utm_medium=${medium}`;
}

export function navigateToPlusPage(medium: PlusUtmMedium): void {
  window.open(createPlusPageUrl(medium), "_blank");
}

export function turnOnPlus(): void {
  // All features are now available without license validation
  updateSetting("isPlusUser", true);
}

/**
 * Turn off Plus user status.
 * All features are now available without license validation.
 * No modal is shown - settings are simply updated.
 */
export function turnOffPlus(): void {
  updateSetting("isPlusUser", false);
}
