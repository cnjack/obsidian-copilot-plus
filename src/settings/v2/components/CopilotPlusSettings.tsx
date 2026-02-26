import { Button } from "@/components/ui/button";
import { SettingItem } from "@/components/ui/setting-item";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { MCPInitResult, MCPManager, MCPServerStatus } from "@/tools/MCPManager";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { ToolSettingsSection } from "./ToolSettingsSection";

export const CopilotPlusSettings: React.FC = () => {
  const settings = useSettingsValue();
  const [mcpConnecting, setMcpConnecting] = useState(false);
  const [mcpResult, setMcpResult] = useState<MCPInitResult | null>(() => {
    // Show existing status from already-initialized servers on mount
    const statuses = MCPManager.getInstance().getServerStatuses();
    return statuses.length > 0 ? { servers: statuses } : null;
  });

  /**
   * Connect to MCP servers using the current config and update the status panel.
   */
  const handleMcpConnect = async () => {
    setMcpConnecting(true);
    setMcpResult(null);
    try {
      const result = await MCPManager.getInstance().initialize(settings.mcpServersConfig);
      setMcpResult(result);
    } finally {
      setMcpConnecting(false);
    }
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <section className="tw-flex tw-flex-col tw-gap-4">
        <div className="tw-flex tw-flex-col tw-gap-4">
          <div className="tw-pt-4 tw-text-xl tw-font-semibold">Agent Tools</div>

          <ToolSettingsSection />

          <div className="tw-pt-4 tw-text-xl tw-font-semibold">MCP Servers</div>

          <SettingItem
            type="custom"
            title="MCP Server Configuration"
            description="Configure Model Context Protocol servers in JSON format. Changes take effect immediately when you update the configuration."
          >
            <div className="tw-w-full" />
          </SettingItem>
          <div className="tw-rounded-lg tw-bg-secondary tw-p-3">
            <div className="tw-mb-2 tw-text-xs tw-text-muted">
              Format: <code className="tw-text-accent">{'{"server-name": {"command": "npx", "args": ["-y", "package-name"], "env": {}}}'}</code>
            </div>
            <textarea
              className="tw-w-full tw-resize-y tw-rounded tw-border tw-border-solid tw-border-border tw-bg-background tw-p-2 tw-font-mono tw-text-xs tw-text-normal"
              rows={8}
              placeholder={`{\n  "my-server": {\n    "command": "npx",\n    "args": ["-y", "mcp-server-package"],\n    "env": {\n      "API_KEY": "your-key"\n    }\n  },\n  "my-remote": {\n    "url": "https://example.com/mcp",\n    "headers": {\n      "Authorization": "Bearer your-token"\n    }\n  }\n}`}
              value={settings.mcpServersConfig}
              onChange={(e) => updateSetting("mcpServersConfig", e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="tw-flex tw-items-center tw-gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMcpConnect}
              disabled={mcpConnecting}
            >
              {mcpConnecting && <Loader2 className="tw-mr-1.5 tw-size-4 tw-animate-spin" />}
              {mcpConnecting ? "Connecting…" : "Test Connection"}
            </Button>
            {mcpResult && !mcpConnecting && (
              <span className="tw-text-xs tw-text-muted">
                {mcpResult.configError
                  ? "Config error"
                  : `${mcpResult.servers.filter((s) => s.status === "connected").length}/${mcpResult.servers.length} connected`}
              </span>
            )}
          </div>

          {mcpResult && (
            <div className="tw-flex tw-flex-col tw-gap-2 tw-rounded-lg tw-border tw-border-solid tw-border-border tw-bg-secondary tw-p-3 tw-text-xs">
              {mcpResult.configError ? (
                <div className="tw-text-error">
                  <span className="tw-font-medium">Config error: </span>
                  {mcpResult.configError}
                </div>
              ) : mcpResult.servers.length === 0 ? (
                <div className="tw-text-muted">No servers configured.</div>
              ) : (
                mcpResult.servers.map((server) => (
                  <div key={server.name} className="tw-flex tw-flex-col tw-gap-1">
                    <div className="tw-flex tw-items-center tw-gap-1.5">
                      <span
                        className={
                          server.status === "connected"
                            ? "tw-text-success"
                            : server.status === "error"
                              ? "tw-text-error"
                              : "tw-text-muted"
                        }
                      >
                        {server.status === "connected" ? "✓" : server.status === "error" ? "✗" : "·"}
                      </span>
                      <span className="tw-font-medium tw-text-normal">{server.name}</span>
                      <span className="tw-text-muted">({server.status})</span>
                    </div>
                    {server.status === "error" && server.error && (
                      <div className="tw-ml-4 tw-text-error">{server.error}</div>
                    )}
                    {server.status === "connected" && server.tools.length > 0 && (
                      <div className="tw-ml-4 tw-flex tw-flex-col tw-gap-0.5 tw-text-muted">
                        {server.tools.map((t) => (
                          <div key={t.name} title={t.description || undefined}>
                            <span className="tw-text-accent">{t.name}</span>
                            {t.description && (
                              <span className="tw-ml-1.5 tw-opacity-70">— {t.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {server.status === "connected" && server.tools.length === 0 && (
                      <div className="tw-ml-4 tw-text-muted">No tools exposed.</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          <div className="tw-pt-4 tw-text-xl tw-font-semibold">Document Processor</div>

          <SettingItem
            type="text"
            title="Store converted markdown at"
            description="When PDFs and other documents are processed, the converted markdown is saved to this folder. Leave empty to skip saving."
            value={settings.convertedDocOutputFolder}
            onChange={(value) => {
              updateSetting("convertedDocOutputFolder", value);
            }}
            placeholder="e.g. copilot/converteddocs"
          />

          <div className="tw-pt-4 tw-text-xl tw-font-semibold">Memory (experimental)</div>

          <SettingItem
            type="text"
            title="Memory Folder Name"
            description="Specify the folder where memory data is stored."
            value={settings.memoryFolderName}
            onChange={(value) => {
              updateSetting("memoryFolderName", value);
            }}
            placeholder="copilot/memory"
          />

          <SettingItem
            type="switch"
            title="Reference Recent Conversation"
            description="When enabled, Copilot references your recent conversation history to provide more contextually relevant responses. All history data is stored locally in your vault."
            checked={settings.enableRecentConversations}
            onCheckedChange={(checked) => {
              updateSetting("enableRecentConversations", checked);
            }}
          />

          {settings.enableRecentConversations && (
            <SettingItem
              type="slider"
              title="Max Recent Conversations"
              description="Number of recent conversations to remember for context. Higher values provide more context but may slow down responses."
              min={10}
              max={50}
              step={1}
              value={settings.maxRecentConversations}
              onChange={(value) => updateSetting("maxRecentConversations", value)}
            />
          )}

          <SettingItem
            type="switch"
            title="Reference Saved Memories"
            description="When enabled, Copilot can access memories that you explicitly asked it to remember. Use this to store important facts, preferences, or context for future conversations."
            checked={settings.enableSavedMemory}
            onCheckedChange={(checked) => {
              updateSetting("enableSavedMemory", checked);
            }}
          />

        </div>
      </section>
    </div>
  );
};
