// Run on staged *.ts: a project-wide typecheck (tsc -p can't take file args, so we
// return a literal command — the function form prevents lint-staged from appending
// filenames to it) plus vitest's related-tests for the staged files.
export default {
  "*.ts": (files) => [
    "tsc --noEmit -p tsconfig.json --skipLibCheck",
    `vitest related --run ${files.join(" ")}`,
  ],
};
