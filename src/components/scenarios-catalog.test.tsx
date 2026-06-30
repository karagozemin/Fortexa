import { describe, it, expect, vi, beforeEach } from "vitest";


// Setup mock state storage
let hookIndex = 0;
const states: unknown[] = [];
const setters: Array<(val: unknown) => void> = [];

// Mock React hooks
vi.mock("react", async () => {
  const original = await vi.importActual<typeof import("react")>("react");
  return {
    ...original,
    useState: (initialValue: unknown) => {
      const currentIndex = hookIndex;
      hookIndex++;
      if (states.length <= currentIndex) {
        const value = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
        states.push(value);
        setters.push((newValue: unknown) => {
          if (typeof newValue === "function") {
            states[currentIndex] = newValue(states[currentIndex]);
          } else {
            states[currentIndex] = newValue;
          }
        });
      }
      return [states[currentIndex], setters[currentIndex]];
    },
    useMemo: (factory: () => unknown) => {
      return factory();
    },
  };
});

// Mock components to keep tests light
vi.mock("@/components/decision-badge", () => ({
  DecisionBadge: ({ decision }: { decision: string }) => ({ type: "DecisionBadge", props: { decision } }),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => ({ type: "Input", props }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => ({ type: "Button", props }),
}));

import { ScenariosCatalog } from "./scenarios-catalog";
import { demoScenarios } from "@/lib/scenarios/seed";

describe("ScenariosCatalog Search, Filter, and Empty State", () => {
  beforeEach(() => {
    hookIndex = 0;
    states.length = 0;
    setters.length = 0;
  });

  const getSearchQuery = () => states[0] as string;
  const setSearchQuery = (val: string) => setters[0](val);
  const getSelectedDecision = () => states[1] as string;
  const setSelectedDecision = (val: string) => setters[1](val);

  it("initially shows all scenarios and has empty search and ALL decision filter", () => {
    hookIndex = 0;
    const element = ScenariosCatalog();

    expect(getSearchQuery()).toBe("");
    expect(getSelectedDecision()).toBe("ALL");

    // The grid should contain all demo scenarios
    const gridDiv = element.props.children[1];
    expect(gridDiv.type).toBe("div");
    expect(gridDiv.props.className).toContain("grid");
    expect(gridDiv.props.children.length).toBe(demoScenarios.length);
  });

  it("filters scenarios based on search query", () => {
    // Render first time
    hookIndex = 0;
    ScenariosCatalog();

    // Set search query to match "Suspicious"
    setSearchQuery("suspicious");

    // Render second time with new state
    hookIndex = 0;
    const element = ScenariosCatalog();

    const gridDiv = element.props.children[1];
    expect(gridDiv.type).toBe("div");
    
    // Check filtered results - should match "Suspicious endpoint attempt" and "Process suspicious tool output"
    const expectedCount = demoScenarios.filter(
      (s) =>
        s.title.toLowerCase().includes("suspicious") ||
        s.description.toLowerCase().includes("suspicious")
    ).length;

    expect(gridDiv.props.children.length).toBe(expectedCount);
  });

  it("filters scenarios based on decision badge", () => {
    // Render first time
    hookIndex = 0;
    ScenariosCatalog();

    // Set filter to "BLOCK"
    setSelectedDecision("BLOCK");

    // Render second time with new state
    hookIndex = 0;
    const element = ScenariosCatalog();

    const gridDiv = element.props.children[1];
    expect(gridDiv.type).toBe("div");

    const expectedCount = demoScenarios.filter((s) => s.expectedDecision === "BLOCK").length;
    expect(gridDiv.props.children.length).toBe(expectedCount);
  });

  it("displays empty state when no scenarios match filters", () => {
    // Render first time
    hookIndex = 0;
    ScenariosCatalog();

    // Set search query to non-existent value
    setSearchQuery("nonexistent_search_query_that_matches_nothing_12345");

    // Render second time
    hookIndex = 0;
    const element = ScenariosCatalog();

    // The second child should be the empty state container
    const emptyStateDiv = element.props.children[1];
    expect(emptyStateDiv.type).toBe("div");
    expect(emptyStateDiv.props.id).toBe("scenario-empty-state");

    // Verify copy requirements
    const heading = emptyStateDiv.props.children[1];
    expect(heading.props.children).toBe("No scenarios match your current filters.");

    const paragraph = emptyStateDiv.props.children[2];
    expect(paragraph.props.children).toBe("Try clearing your search or filters to see all available scenarios.");

    const clearButton = emptyStateDiv.props.children[3];
    expect(clearButton.props.id).toBe("clear-filters-btn");
  });

  it("restores scenario list immediately when clear filters is clicked", () => {
    // Render first time
    hookIndex = 0;
    ScenariosCatalog();

    // Set search query to non-existent value to trigger empty state
    setSearchQuery("nonexistent_search_query_that_matches_nothing_12345");
    setSelectedDecision("BLOCK");

    // Verify empty state is displayed
    hookIndex = 0;
    let element = ScenariosCatalog();
    expect(element.props.children[1].props.id).toBe("scenario-empty-state");

    // Click the clear filters button (directly invoke the onClick callback)
    const clearButton = element.props.children[1].props.children[3];
    clearButton.props.onClick();

    // Render again
    hookIndex = 0;
    element = ScenariosCatalog();

    // Should be back to initial state
    expect(getSearchQuery()).toBe("");
    expect(getSelectedDecision()).toBe("ALL");
    expect(element.props.children[1].props.id).not.toBe("scenario-empty-state");
    expect(element.props.children[1].props.children.length).toBe(demoScenarios.length);
  });
});
