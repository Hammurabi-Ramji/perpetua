import { vi } from 'vitest';

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class TreeItem {
  tooltip?: string;
  contextValue?: string;
  iconPath?: ThemeIcon;
  command?: unknown;

  constructor(
    public readonly label: string,
    public readonly collapsibleState?: number
  ) {}
}

export class EventEmitter<T = unknown> {
  readonly event = vi.fn();
  readonly fire = vi.fn<(value?: T) => void>();
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((_key: string, fallback: unknown) => fallback)
  })),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() }))
};

export const window = {
  registerTreeDataProvider: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn()
};
