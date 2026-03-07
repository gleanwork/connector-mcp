export interface NextStep {
  label: string;
  description: string;
  tool: string;
}

export function formatNextSteps(steps: NextStep[]): string {
  const items = steps
    .map(
      (s, i) =>
        `${i + 1}. **${s.label}** — Call \`${s.tool}\` to ${s.description}.`,
    )
    .join('\n');
  return `\n---\n**What's next?**\n\n${items}`;
}
