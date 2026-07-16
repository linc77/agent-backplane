// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdaterController } from "../hooks/useAppUpdater";
import { getUiText } from "../lib/i18n";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("shows language controls and opens an available release only after confirmation", () => {
    const downloadUpdate = vi.fn().mockResolvedValue(undefined);
    const onLocaleChange = vi.fn();
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
      <SettingsPage
        controller={controller}
        locale="zh-CN"
        nativeEnabled
        onLocaleChange={onLocaleChange}
        uiText={getUiText("zh-CN")}
      />,
    );

    expect(getByRole("main")).toBeInTheDocument();
    expect(getByRole("group", { name: "语言" })).toBeInTheDocument();
    expect(getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(getByRole("button", { name: "English" }));
    expect(onLocaleChange).toHaveBeenCalledWith("en-US");

    expect(getByText("0.1.2")).toBeInTheDocument();
    expect(getByText("发现新版本 v0.1.3")).toBeInTheDocument();
    expect(getByText("Improved update reliability.")).toBeInTheDocument();
    expect(downloadUpdate).not.toHaveBeenCalled();

    fireEvent.click(getByRole("button", { name: "前往 GitHub 下载" }));
    expect(downloadUpdate).toHaveBeenCalledOnce();
  });
});
