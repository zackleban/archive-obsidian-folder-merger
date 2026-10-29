// Synthetic only. No live app behavior is implied by these expected states.
export const fixtureFiles = {
  "A/Same.md": "# Alpha root\nmarker: alpha-root\n",
  "A/nested/Same.md": "# Alpha nested\nmarker: alpha-nested\n",
  "A/External.md": "# Routed externally\nmarker: external-route\n",
  "B/Same.md": "# Beta root\nmarker: beta-root\n",
  "B/nested/Same.md": "# Beta nested\nmarker: beta-nested\n",
  "B/nested/Top.md": "# Routed to destination root\nmarker: top-route\n",
  "Combined/Same.md": "# Existing root collision\nmarker: existing-root\n",
  "Combined/nested/Same.md": "# Existing nested collision\nmarker: existing-nested\n",
  "Combined/A/Keep.md": "# Existing folder collision\nmarker: existing-folder\n",
  "Outside/External.md": "# Existing route collision\nmarker: existing-external\n",
};

export const scenarios = ["notes", "folder", "recovery"];
const routeMoves = {
  "A/External.md": "Outside/External 2.md",
  "B/nested/Top.md": "Combined/Top.md",
};
export const intermediateMoves = { ...routeMoves, "A/Same.md": "Combined/Same 2.md" };

export function finalMoves(scenario) {
  if (!scenarios.includes(scenario)) throw Error(`Unknown scenario: ${scenario}`);
  return scenario === "folder" ? {
    ...routeMoves,
    "A/Same.md": "Combined/A 2/Same.md",
    "A/nested/Same.md": "Combined/A 2/nested/Same.md",
    "B/Same.md": "Combined/B/Same.md",
    "B/nested/Same.md": "Combined/B/nested/Same.md",
  } : {
    ...routeMoves,
    "A/Same.md": "Combined/Same 2.md",
    "A/nested/Same.md": "Combined/nested/Same 2.md",
    "B/Same.md": "Combined/Same 3.md",
    "B/nested/Same.md": "Combined/nested/Same 3.md",
  };
}

export function marker(text) { return text.match(/^marker: (.+)$/m)[1]; }

export function inboundText(moves = {}) {
  return "# Synthetic inbound links\n" + Object.entries(fixtureFiles)
    .map(([path, text]) => `[[${(moves[path] ?? path).replace(/\.md$/, "")}|${marker(text)}]]\n`).join("");
}

export function filesAt(moves = {}) {
  return Object.fromEntries(Object.entries(fixtureFiles).map(([path, text]) => [moves[path] ?? path, text]));
}

export function initialFiles(scenario) {
  if (!scenarios.includes(scenario)) throw Error(`Unknown scenario: ${scenario}`);
  const moves = scenario === "recovery" ? intermediateMoves : {};
  return { ...filesAt(moves), "Inbound.md": inboundText(moves) };
}
