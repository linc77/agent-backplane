// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdaterController } from "../hooks/useAppUpdater";
import { getUiText } from "../lib/i18n";
import { SettingsDialog } from "./SettingsDialog";

describe("SettingsDialog", () => {
  it("shows an available release and opens GitHub only after confirmation", () => {
    const downloadUpdate = vi.fn().mockResolvedValue(undefined);
    const controller: AppUpdaterController = {
      autoCheck: true,
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      downloadUpdate,
      setAutoCheck: vi.fn(),
      state: {
        phase: "available",
        currentVersion: "0.1.2",
        update: {
          currentVersion: "0.1.2",
          version: "0.1.3",
          body: "Improved update reliability.",
        },
        error: null,
      },
    };
    const { getByRole, getByText } = render(
      <SettingsDialog
        controller={controller}
        nativeEnabled
        onClose={vi.fn()}
        uiText={getUiText("zh-CN")}
      />,
    );

    expect(getByText("0.1.2")).toBeInTheDocument();
    expect(getByText("发现新版本 v0.1.3")).toBeInTheDocument();
    expect(getByText("Improved update reliability.")).toBeInTheDocument();
    expect(downloadUpdate).not.toHaveBeenCalled();

    fireEvent.click(getByRole("button", { name: "前往 GitHub 下载" }));
    expect(downloadUpdate).toHaveBeenCalledOnce();
  });
});
