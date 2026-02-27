import { Button } from "@/components/ui/button";
import { App, Modal } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import * as Diff from "diff";

/**
 * Props for the DiffPreviewModal content component
 */
interface DiffPreviewContentProps {
  originalContent: string;
  proposedContent: string;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * Generate a unified diff between original and proposed content
 */
export function generateDiff(originalContent: string, proposedContent: string): Diff.Change[] {
  return Diff.diffLines(originalContent, proposedContent);
}

/**
 * Convert diff changes to a renderable format with type information
 */
export interface DiffLine {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
}

export function formatDiffLines(changes: Diff.Change[]): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const type = change.added ? 'added' : change.removed ? 'removed' : 'unchanged';
    // Split multi-line changes into individual lines for better rendering
    const changeLines = change.value.split('\n');
    for (let i = 0; i < changeLines.length; i++) {
      const lineText = changeLines[i];
      // Don't add empty lines at the end of the content
      if (i === changeLines.length - 1 && lineText === '' && change.value.endsWith('\n')) {
        continue;
      }
      lines.push({
        text: lineText,
        type,
      });
    }
  }

  return lines;
}

/**
 * React component for rendering the diff with colored formatting
 */
function DiffPreviewContent({
  originalContent,
  proposedContent,
  onAccept,
  onReject,
}: DiffPreviewContentProps) {
  const diffChanges = generateDiff(originalContent, proposedContent);
  const diffLines = formatDiffLines(diffChanges);

  // Check if there are any actual changes
  const hasChanges = diffChanges.some(change => change.added || change.removed);

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      {/* Diff view container */}
      <div className="tw-bg-base-05 tw-max-h-96 tw-overflow-auto tw-rounded-md tw-border tw-font-mono tw-text-sm">
        {diffLines.length === 0 ? (
          <div className="tw-p-4 tw-text-muted">No content to display</div>
        ) : (
          <div className="tw-p-2">
            {diffLines.map((line, index) => (
              <div
                key={index}
                className={`tw-whitespace-pre-wrap tw-break-all tw-px-2 tw-py-0.5 ${
                  line.type === 'added'
                    ? 'tw-bg-success tw-text-normal'
                    : line.type === 'removed'
                    ? 'tw-bg-error tw-text-normal'
                    : 'tw-text-muted'
                }`}
              >
                <span className="tw-mr-2 tw-select-none tw-text-faint">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="tw-text-sm tw-text-muted">
        {hasChanges ? (
          <span>
            Showing {diffLines.filter(l => l.type === 'added').length} additions and{' '}
            {diffLines.filter(l => l.type === 'removed').length} deletions
          </span>
        ) : (
          <span>No changes to preview</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="tw-flex tw-justify-end tw-gap-2">
        <Button variant="secondary" onClick={onReject}>
          Reject
        </Button>
        <Button variant="default" onClick={onAccept} disabled={!hasChanges}>
          Accept
        </Button>
      </div>
    </div>
  );
}

/**
 * Modal interface for accepting or rejecting proposed file edits
 */
export interface DiffPreviewModalOptions {
  originalContent: string;
  proposedContent: string;
  onAccept: (newContent: string) => void;
  onReject?: () => void;
  title?: string;
}

/**
 * A modal that displays a diff between original and proposed content
 * with Accept and Reject buttons
 */
export class DiffPreviewModal extends Modal {
  private root: Root;

  constructor(
    app: App,
    private options: DiffPreviewModalOptions
  ) {
    super(app);
    this.setTitle(options.title ?? 'Preview Changes');
  }

  onOpen() {
    const { contentEl } = this;
    this.root = createRoot(contentEl);

    const handleAccept = () => {
      this.options.onAccept(this.options.proposedContent);
      this.close();
    };

    const handleReject = () => {
      this.options.onReject?.();
      this.close();
    };

    this.root.render(
      <DiffPreviewContent
        originalContent={this.options.originalContent}
        proposedContent={this.options.proposedContent}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    );
  }

  onClose() {
    this.root.unmount();
  }
}
