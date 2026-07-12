import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "@/components/search-input";

describe("SearchInput", () => {
  it("submits the typed query on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<SearchInput onChange={onChange} onSubmit={onSubmit} suggestions={[]} suggestionsLoading={false} value="useState" />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("useState");
  });

  it("supports keyboard selection from autocomplete", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchInput onChange={vi.fn()} onSubmit={onSubmit} suggestions={["useState", "useEffect"]} suggestionsLoading={false} value="use" />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("useEffect");
  });
});
