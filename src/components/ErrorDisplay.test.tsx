import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PipelineError } from "@/lib/errors";
import { ErrorDisplay } from "./ErrorDisplay";

const NEXT_STEP = "Send the request with a credential this runtime accepts.";

const CREDENTIAL_MISSING: PipelineError = {
  domain: "account",
  title: "No credential was sent",
  message: "This route needs a credential, and the request carried none.",
  nextStep: NEXT_STEP,
  hint: {
    summary: "Set the key this MTHDS API accepts in .env.local, then restart the dev server:",
    code: "MTHDS_API_KEY=your-key-here",
    codeLanguage: "env",
  },
  code: "auth.missing_credential",
  requestId: "req_123",
  details: "POST /v1/execute answered HTTP 401 Unauthorized\ndomain account, retry no",
};

describe("ErrorDisplay", () => {
  it("renders the problem's title, detail, next step and hint", () => {
    render(<ErrorDisplay error={CREDENTIAL_MISSING} />);
    expect(screen.getByRole("heading", { name: "No credential was sent" })).toBeInTheDocument();
    expect(screen.getByText(CREDENTIAL_MISSING.message)).toBeInTheDocument();
    expect(screen.getByText(NEXT_STEP)).toBeInTheDocument();
    expect(screen.getByText("MTHDS_API_KEY=your-key-here")).toBeInTheDocument();
  });

  it("names who must act and takes its tone from the domain", () => {
    const { rerender } = render(<ErrorDisplay error={CREDENTIAL_MISSING} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-domain", "account");
    expect(alert).toHaveTextContent("Who must act: The account's owner");
    expect(alert.className).toContain("bg-amber-50");

    rerender(<ErrorDisplay error={{ ...CREDENTIAL_MISSING, domain: "runtime" }} />);
    expect(screen.getByRole("alert").className).toContain("bg-red-50");
  });

  it("shows the code and the request id under Technical details", () => {
    render(<ErrorDisplay error={CREDENTIAL_MISSING} />);
    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(screen.getByText("auth.missing_credential")).toBeInTheDocument();
    expect(screen.getByText("req_123")).toBeInTheDocument();
    expect(screen.getByText(/answered HTTP 401 Unauthorized/)).toBeInTheDocument();
  });

  it("renders a failure the app caught itself, with no code or next step", () => {
    render(
      <ErrorDisplay
        error={{
          domain: "input",
          title: "Input required",
          message: "Enter some text to extract entities from.",
          details: "Empty input",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Input required" })).toBeInTheDocument();
    expect(screen.queryByText(/Next step/)).not.toBeInTheDocument();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
    expect(screen.queryByText("Request id")).not.toBeInTheDocument();
  });
});
